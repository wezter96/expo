import type { Contact } from "@kinly/db";

/**
 * Turns a plain-language request ("call my daughter", "tell Tom I'll be late")
 * into a concrete app action. This runs on the SERVER so the Anthropic API key
 * never ships to the device.
 *
 * Two engines:
 *   1. Claude (Anthropic Messages API) when ANTHROPIC_API_KEY is set.
 *   2. A built-in rule-based parser as a fallback — works with no key.
 */

export type AgentAction =
  | { type: "none" }
  | { type: "open_chat"; contactId: string }
  | { type: "call"; contactId: string }
  | { type: "read_messages"; contactId: string }
  | { type: "send_message"; contactId: string; text: string };

export type AgentResult = {
  /** What the assistant says back — shown on screen and read aloud. */
  say: string;
  action: AgentAction;
  /** Outward actions (call / send) should be confirmed before running. */
  needsConfirm: boolean;
};

type Resolver = (query: string) => Contact | undefined;

export type AgentConfig = { apiKey?: string; model: string };

function makeResolver(contacts: Contact[]): Resolver {
  return (query: string) => {
    const q = query.trim().toLowerCase();
    if (!q) return undefined;
    return (
      contacts.find((c) => c.name.toLowerCase() === q) ||
      contacts.find((c) => c.name.toLowerCase().startsWith(q)) ||
      contacts.find((c) => c.name.toLowerCase().includes(q)) ||
      contacts.find((c) => c.relation.toLowerCase() === q) ||
      contacts.find((c) => c.relation.toLowerCase().includes(q))
    );
  };
}

// ---------------------------------------------------------------------------
// Claude engine
// ---------------------------------------------------------------------------

const TOOL = {
  name: "perform_action",
  description: "Decide what the user wants to do in their family messaging app and reply warmly and simply.",
  input_schema: {
    type: "object",
    properties: {
      action: {
        type: "string",
        enum: ["send_message", "call", "open_chat", "read_messages", "none"],
        description:
          "send_message: send a text now. call: place a phone call. open_chat: open a conversation. read_messages: read their latest messages aloud. none: just chat back or ask a clarifying question.",
      },
      contact_name: {
        type: "string",
        description: 'Who the action is about, using the name or relationship the user said (e.g. "Mary", "my daughter"). Empty if not applicable.',
      },
      message_text: {
        type: "string",
        description: "The message to send, when action is send_message. Otherwise empty.",
      },
      say: {
        type: "string",
        description: "A short, warm, plain-language sentence confirming what will happen or asking a follow-up.",
      },
    },
    required: ["action", "contact_name", "message_text", "say"],
  },
} as const;

async function runWithClaude(input: string, contacts: Contact[], config: AgentConfig): Promise<AgentResult> {
  const resolve = makeResolver(contacts);
  const roster = contacts.map((c) => `- ${c.name} (${c.relation})${c.isGroup ? " [group]" : ""}`).join("\n");

  const system =
    'You are the friendly voice assistant inside "Kinly", a very simple messaging app for older adults. ' +
    "You help them message and call their family and friends. Always be warm, patient, and use short, plain sentences. " +
    "Choose exactly one action with the perform_action tool. Match the person they mention to someone in this contact list:\n" +
    roster +
    '\nIf you are unsure who they mean or the request is unclear, use action "none" and ask a gentle clarifying question in "say".';

  const resp = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": config.apiKey ?? "",
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: config.model,
      max_tokens: 400,
      system,
      tools: [TOOL],
      tool_choice: { type: "tool", name: "perform_action" },
      messages: [{ role: "user", content: input }],
    }),
  });

  if (!resp.ok) throw new Error(`AI request failed: ${resp.status}`);
  const data = (await resp.json()) as { content?: Array<{ type: string; input?: unknown }> };
  const block = (data.content ?? []).find((b) => b.type === "tool_use");
  if (!block?.input) throw new Error("No structured response from AI");

  const argsInput = block.input as {
    action: AgentAction["type"];
    contact_name: string;
    message_text: string;
    say: string;
  };
  return buildResult(argsInput.action, argsInput.contact_name, argsInput.message_text, argsInput.say, resolve);
}

// ---------------------------------------------------------------------------
// Local rule-based engine
// ---------------------------------------------------------------------------

function runLocally(input: string, resolve: Resolver): AgentResult {
  const text = input.trim();
  const lower = text.toLowerCase();

  const nameMatch =
    lower.match(/(?:call|phone|ring)\s+(?:my\s+)?([a-z ]+?)(?:\s+(?:and|now|please)|[.?!]|$)/) ||
    lower.match(/(?:to|for|my)\s+([a-z ]+?)(?:\s+(?:that|saying|and|now)|[,.?!]|$)/);
  const who = nameMatch?.[1] ? resolve(nameMatch[1].trim()) : undefined;

  if (/\b(call|phone|ring|dial)\b/.test(lower)) {
    if (who) {
      return { say: `Calling ${who.name} now. Is that right?`, action: { type: "call", contactId: who.id }, needsConfirm: true };
    }
    return { say: "Who would you like to call?", action: { type: "none" }, needsConfirm: false };
  }

  const sendMatch = text.match(
    /(?:tell|text|message|send)\s+(?:a message to\s+|to\s+|my\s+)?([A-Za-z ]+?)(?:\s+(?:that|saying|:)\s+|,\s+)(.+)/i,
  );
  if (sendMatch?.[1] && sendMatch[2]) {
    const target = resolve(sendMatch[1].trim());
    const body = sendMatch[2].trim();
    if (target && body) {
      return {
        say: `I'll send "${body}" to ${target.name}. Shall I send it?`,
        action: { type: "send_message", contactId: target.id, text: body },
        needsConfirm: true,
      };
    }
  }
  if (/\b(send|text|message|tell|write)\b/.test(lower) && who) {
    return { say: `What would you like to say to ${who.name}?`, action: { type: "open_chat", contactId: who.id }, needsConfirm: false };
  }

  if (/\b(read|catch me up|what did|new messages|any messages)\b/.test(lower) && who) {
    return { say: `Here are your latest messages from ${who.name}.`, action: { type: "read_messages", contactId: who.id }, needsConfirm: false };
  }

  if (/\b(open|show|talk to|chat with|see)\b/.test(lower) && who) {
    return { say: `Opening your chat with ${who.name}.`, action: { type: "open_chat", contactId: who.id }, needsConfirm: false };
  }

  const bareName = resolve(text);
  if (bareName) {
    return { say: `Opening your chat with ${bareName.name}.`, action: { type: "open_chat", contactId: bareName.id }, needsConfirm: false };
  }

  return {
    say: 'I can help you call someone or send a message. For example, say "Call Mary" or "Tell Tom I\'ll be late".',
    action: { type: "none" },
    needsConfirm: false,
  };
}

// ---------------------------------------------------------------------------
// Shared
// ---------------------------------------------------------------------------

function buildResult(
  action: AgentAction["type"],
  contactName: string,
  messageText: string,
  say: string,
  resolve: Resolver,
): AgentResult {
  const contact = contactName ? resolve(contactName) : undefined;

  if (action !== "none" && !contact) {
    return { say: `I couldn't find "${contactName}" in your contacts. Who did you mean?`, action: { type: "none" }, needsConfirm: false };
  }

  switch (action) {
    case "send_message":
      if (!contact || !messageText.trim()) {
        return { say: say || "What would you like to say?", action: { type: "none" }, needsConfirm: false };
      }
      return {
        say: say || `Send "${messageText}" to ${contact.name}?`,
        action: { type: "send_message", contactId: contact.id, text: messageText.trim() },
        needsConfirm: true,
      };
    case "call":
      return { say: say || `Call ${contact!.name}?`, action: { type: "call", contactId: contact!.id }, needsConfirm: true };
    case "read_messages":
      return { say: say || `Reading your messages from ${contact!.name}.`, action: { type: "read_messages", contactId: contact!.id }, needsConfirm: false };
    case "open_chat":
      return { say: say || `Opening your chat with ${contact!.name}.`, action: { type: "open_chat", contactId: contact!.id }, needsConfirm: false };
    default:
      return { say: say || "How can I help?", action: { type: "none" }, needsConfirm: false };
  }
}

/** Main entry point. Uses Claude when configured, else the local parser. */
export async function runAgent(input: string, contacts: Contact[], config: AgentConfig): Promise<AgentResult> {
  if (!input.trim()) {
    return { say: "Please tell me what you would like to do.", action: { type: "none" }, needsConfirm: false };
  }
  if (config.apiKey) {
    try {
      return await runWithClaude(input, contacts, config);
    } catch {
      return runLocally(input, makeResolver(contacts));
    }
  }
  return runLocally(input, makeResolver(contacts));
}
