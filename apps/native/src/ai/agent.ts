import Constants from 'expo-constants';
import { Contact } from '../types';

/**
 * The assistant turns a plain-language request ("call my daughter",
 * "tell Tom I'll be a bit late") into a concrete app action.
 *
 * Two engines:
 *   1. Claude (Anthropic Messages API) when an API key is configured — it
 *      handles fuzzy, conversational requests robustly.
 *   2. A built-in rule-based parser as a fallback, so the app is fully
 *      usable out of the box with no key and no network.
 */

export type AgentAction =
  | { type: 'none' }
  | { type: 'open_chat'; contactId: string }
  | { type: 'call'; contactId: string }
  | { type: 'read_messages'; contactId: string }
  | { type: 'send_message'; contactId: string; text: string };

export type AgentResult = {
  /** What the assistant says back — shown on screen and read aloud. */
  say: string;
  action: AgentAction;
  /** For actions that do something outward (call / send), ask before doing it. */
  needsConfirm: boolean;
};

type Resolver = (query: string) => Contact | undefined;

function getConfig() {
  const extra = (Constants.expoConfig?.extra ?? {}) as { aiApiKey?: string; aiModel?: string };
  const apiKey = process.env.EXPO_PUBLIC_AI_API_KEY || extra.aiApiKey || '';
  const model = extra.aiModel || 'claude-haiku-4-5-20251001';
  return { apiKey, model };
}

// ---------------------------------------------------------------------------
// Claude engine
// ---------------------------------------------------------------------------

const TOOL = {
  name: 'perform_action',
  description:
    'Decide what the user wants to do in their family messaging app and reply warmly and simply.',
  input_schema: {
    type: 'object',
    properties: {
      action: {
        type: 'string',
        enum: ['send_message', 'call', 'open_chat', 'read_messages', 'none'],
        description:
          'send_message: send a text now. call: place a phone call. open_chat: open a conversation so they can read/type. read_messages: read their latest messages aloud. none: just chat back or ask a clarifying question.',
      },
      contact_name: {
        type: 'string',
        description:
          'Who the action is about, using the name or relationship the user said (e.g. "Mary", "my daughter", "Family group"). Empty if not applicable.',
      },
      message_text: {
        type: 'string',
        description: 'The message to send, when action is send_message. Otherwise empty.',
      },
      say: {
        type: 'string',
        description:
          'A short, warm, plain-language sentence to say back to the user confirming what will happen or asking a follow-up. One or two short sentences maximum.',
      },
    },
    required: ['action', 'contact_name', 'message_text', 'say'],
  },
} as const;

async function runWithClaude(
  input: string,
  contacts: Contact[],
  resolve: Resolver
): Promise<AgentResult> {
  const { apiKey, model } = getConfig();
  const roster = contacts
    .map((c) => `- ${c.name} (${c.relation})${c.isGroup ? ' [group]' : ''}`)
    .join('\n');

  const system =
    'You are the friendly voice assistant inside "Kinly", a very simple messaging app for older adults. ' +
    'You help them message and call their family and friends. Always be warm, patient, and use short, plain sentences. ' +
    'Choose exactly one action with the perform_action tool. Match the person they mention to someone in this contact list:\n' +
    roster +
    '\nIf you are unsure who they mean or the request is unclear, use action "none" and ask a gentle clarifying question in "say".';

  const resp = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model,
      max_tokens: 400,
      system,
      tools: [TOOL],
      tool_choice: { type: 'tool', name: 'perform_action' },
      messages: [{ role: 'user', content: input }],
    }),
  });

  if (!resp.ok) throw new Error(`AI request failed: ${resp.status}`);
  const data = await resp.json();
  const block = (data.content ?? []).find((b: any) => b.type === 'tool_use');
  if (!block) throw new Error('No structured response from AI');

  const args = block.input as {
    action: AgentAction['type'];
    contact_name: string;
    message_text: string;
    say: string;
  };

  return buildResult(args.action, args.contact_name, args.message_text, args.say, resolve);
}

// ---------------------------------------------------------------------------
// Local fallback engine (no network needed)
// ---------------------------------------------------------------------------

function runLocally(input: string, resolve: Resolver): AgentResult {
  const text = input.trim();
  const lower = text.toLowerCase();

  // Try to pull a person out of the sentence: "... to/for/my <name> ...".
  const nameMatch =
    lower.match(/(?:call|phone|ring)\s+(?:my\s+)?([a-z ]+?)(?:\s+(?:and|now|please)|[.?!]|$)/) ||
    lower.match(/(?:to|for|my)\s+([a-z ]+?)(?:\s+(?:that|saying|and|now)|[,.?!]|$)/);
  const who = nameMatch ? resolve(nameMatch[1].trim()) : undefined;

  // Call
  if (/\b(call|phone|ring|dial)\b/.test(lower)) {
    if (who) {
      return {
        say: `Calling ${who.name} now. Is that right?`,
        action: { type: 'call', contactId: who.id },
        needsConfirm: true,
      };
    }
    return { say: 'Who would you like to call?', action: { type: 'none' }, needsConfirm: false };
  }

  // Send a message: "tell/text/message X that ...", "send X ..."
  const sendMatch =
    text.match(/(?:tell|text|message|send)\s+(?:a message to\s+|to\s+|my\s+)?([A-Za-z ]+?)(?:\s+(?:that|saying|:)\s+|,\s+)(.+)/i);
  if (sendMatch) {
    const target = resolve(sendMatch[1].trim());
    const body = sendMatch[2].trim();
    if (target && body) {
      return {
        say: `I'll send "${body}" to ${target.name}. Shall I send it?`,
        action: { type: 'send_message', contactId: target.id, text: body },
        needsConfirm: true,
      };
    }
  }
  if (/\b(send|text|message|tell|write)\b/.test(lower) && who) {
    return {
      say: `What would you like to say to ${who.name}?`,
      action: { type: 'open_chat', contactId: who.id },
      needsConfirm: false,
    };
  }

  // Read messages
  if (/\b(read|catch me up|what did|new messages|any messages)\b/.test(lower)) {
    if (who) {
      return {
        say: `Here are your latest messages from ${who.name}.`,
        action: { type: 'read_messages', contactId: who.id },
        needsConfirm: false,
      };
    }
  }

  // Open / show a conversation
  if (/\b(open|show|talk to|chat with|see)\b/.test(lower) && who) {
    return {
      say: `Opening your chat with ${who.name}.`,
      action: { type: 'open_chat', contactId: who.id },
      needsConfirm: false,
    };
  }

  // Just a name on its own → open their chat.
  const bareName = resolve(text);
  if (bareName) {
    return {
      say: `Opening your chat with ${bareName.name}.`,
      action: { type: 'open_chat', contactId: bareName.id },
      needsConfirm: false,
    };
  }

  return {
    say: "I can help you call someone or send a message. For example, say \"Call Mary\" or \"Tell Tom I'll be late\".",
    action: { type: 'none' },
    needsConfirm: false,
  };
}

// ---------------------------------------------------------------------------
// Shared
// ---------------------------------------------------------------------------

function buildResult(
  action: AgentAction['type'],
  contactName: string,
  messageText: string,
  say: string,
  resolve: Resolver
): AgentResult {
  const contact = contactName ? resolve(contactName) : undefined;

  if (action !== 'none' && !contact) {
    return {
      say: `I couldn't find "${contactName}" in your contacts. Who did you mean?`,
      action: { type: 'none' },
      needsConfirm: false,
    };
  }

  switch (action) {
    case 'send_message':
      if (!contact || !messageText.trim()) {
        return { say: say || 'What would you like to say?', action: { type: 'none' }, needsConfirm: false };
      }
      return {
        say: say || `Send "${messageText}" to ${contact.name}?`,
        action: { type: 'send_message', contactId: contact.id, text: messageText.trim() },
        needsConfirm: true,
      };
    case 'call':
      return {
        say: say || `Call ${contact!.name}?`,
        action: { type: 'call', contactId: contact!.id },
        needsConfirm: true,
      };
    case 'read_messages':
      return {
        say: say || `Reading your messages from ${contact!.name}.`,
        action: { type: 'read_messages', contactId: contact!.id },
        needsConfirm: false,
      };
    case 'open_chat':
      return {
        say: say || `Opening your chat with ${contact!.name}.`,
        action: { type: 'open_chat', contactId: contact!.id },
        needsConfirm: false,
      };
    default:
      return { say: say || 'How can I help?', action: { type: 'none' }, needsConfirm: false };
  }
}

/** Whether a real AI key is configured (affects the on-screen hint only). */
export function aiConfigured(): boolean {
  return getConfig().apiKey.length > 0;
}

/**
 * Main entry point. Resolves a spoken/typed request into an action.
 * Falls back to the local parser if the AI call is unavailable or fails.
 */
export async function runAgent(
  input: string,
  contacts: Contact[],
  resolve: Resolver
): Promise<AgentResult> {
  if (!input.trim()) {
    return { say: 'Please tell me what you would like to do.', action: { type: 'none' }, needsConfirm: false };
  }
  if (aiConfigured()) {
    try {
      return await runWithClaude(input, contacts, resolve);
    } catch {
      // Network / key problem — quietly fall back so the user is never stuck.
      return runLocally(input, resolve);
    }
  }
  return runLocally(input, resolve);
}
