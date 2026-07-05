/// <reference path="../pb_data/types.d.ts" />

/**
 * Server-side assistant endpoint: POST /api/kinly/assistant  { text }
 *
 * Turns a plain-language request ("Call Mary", "Tell Tom I'll be late") into an
 * app action. Runs a built-in rule-based parser; if ANTHROPIC_API_KEY is set in
 * the PocketBase environment it uses Claude tool-calling instead. Either way the
 * key stays on the server, never on the device.
 *
 * Returns: { say: string, action: {...}, needsConfirm: boolean }
 */
routerAdd('POST', '/api/kinly/assistant', (e) => {
  const info = e.requestInfo();
  const input = String((info.body && info.body.text) || '').trim();

  // Load the roster from the database.
  const records = $app.findAllRecords('conversations');
  const contacts = records.map((r) => ({
    id: r.id,
    name: r.getString('title'),
    relation: r.getString('relation'),
    isGroup: r.getBool('isGroup'),
  }));

  if (!input) {
    return e.json(200, {
      say: 'Please tell me what you would like to do.',
      action: { type: 'none' },
      needsConfirm: false,
    });
  }

  const apiKey = $os.getenv('ANTHROPIC_API_KEY');
  const model = $os.getenv('AI_MODEL') || 'claude-haiku-4-5-20251001';

  let result;
  if (apiKey) {
    try {
      result = runWithClaude(input, contacts, apiKey, model);
    } catch (err) {
      result = runLocally(input, contacts);
    }
  } else {
    result = runLocally(input, contacts);
  }
  return e.json(200, result);

  // --- helpers ------------------------------------------------------------

  function resolve(query) {
    const q = String(query || '').trim().toLowerCase();
    if (!q) return null;
    return (
      contacts.find((c) => c.name.toLowerCase() === q) ||
      contacts.find((c) => c.name.toLowerCase().indexOf(q) === 0) ||
      contacts.find((c) => c.name.toLowerCase().indexOf(q) !== -1) ||
      contacts.find((c) => c.relation.toLowerCase() === q) ||
      contacts.find((c) => c.relation.toLowerCase().indexOf(q) !== -1) ||
      null
    );
  }

  function runLocally(text, _roster) {
    const lower = text.toLowerCase();
    let m =
      lower.match(/(?:call|phone|ring)\s+(?:my\s+)?([a-z ]+?)(?:\s+(?:and|now|please)|[.?!]|$)/) ||
      lower.match(/(?:to|for|my)\s+([a-z ]+?)(?:\s+(?:that|saying|and|now)|[,.?!]|$)/);
    const who = m ? resolve(m[1].trim()) : null;

    if (/\b(call|phone|ring|dial)\b/.test(lower)) {
      if (who) return { say: 'Calling ' + who.name + ' now. Is that right?', action: { type: 'call', contactId: who.id }, needsConfirm: true };
      return { say: 'Who would you like to call?', action: { type: 'none' }, needsConfirm: false };
    }

    const send = text.match(/(?:tell|text|message|send)\s+(?:a message to\s+|to\s+|my\s+)?([A-Za-z ]+?)(?:\s+(?:that|saying|:)\s+|,\s+)(.+)/i);
    if (send) {
      const target = resolve(send[1].trim());
      const body = send[2].trim();
      if (target && body) {
        return { say: 'I\'ll send "' + body + '" to ' + target.name + '. Shall I send it?', action: { type: 'send_message', contactId: target.id, text: body }, needsConfirm: true };
      }
    }
    if (/\b(send|text|message|tell|write)\b/.test(lower) && who) {
      return { say: 'What would you like to say to ' + who.name + '?', action: { type: 'open_chat', contactId: who.id }, needsConfirm: false };
    }
    if (/\b(read|catch me up|what did|new messages|any messages)\b/.test(lower) && who) {
      return { say: 'Here are your latest messages from ' + who.name + '.', action: { type: 'read_messages', contactId: who.id }, needsConfirm: false };
    }
    if (/\b(open|show|talk to|chat with|see)\b/.test(lower) && who) {
      return { say: 'Opening your chat with ' + who.name + '.', action: { type: 'open_chat', contactId: who.id }, needsConfirm: false };
    }
    const bare = resolve(text);
    if (bare) return { say: 'Opening your chat with ' + bare.name + '.', action: { type: 'open_chat', contactId: bare.id }, needsConfirm: false };

    return {
      say: 'I can help you call someone or send a message. For example, say "Call Mary" or "Tell Tom I\'ll be late".',
      action: { type: 'none' },
      needsConfirm: false,
    };
  }

  function runWithClaude(text, roster, key, modelId) {
    const rosterText = roster.map((c) => '- ' + c.name + ' (' + c.relation + ')' + (c.isGroup ? ' [group]' : '')).join('\n');
    const system =
      'You are the friendly voice assistant inside "Kinly", a very simple messaging app for older adults. ' +
      'Always be warm and use short, plain sentences. Choose exactly one action with the perform_action tool. ' +
      'Match the person to this contact list:\n' + rosterText +
      '\nIf unsure, use action "none" and ask a gentle clarifying question in "say".';

    const tool = {
      name: 'perform_action',
      description: 'Decide what the user wants to do and reply warmly.',
      input_schema: {
        type: 'object',
        properties: {
          action: { type: 'string', enum: ['send_message', 'call', 'open_chat', 'read_messages', 'none'] },
          contact_name: { type: 'string' },
          message_text: { type: 'string' },
          say: { type: 'string' },
        },
        required: ['action', 'contact_name', 'message_text', 'say'],
      },
    };

    const res = $http.send({
      url: 'https://api.anthropic.com/v1/messages',
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: modelId,
        max_tokens: 400,
        system: system,
        tools: [tool],
        tool_choice: { type: 'tool', name: 'perform_action' },
        messages: [{ role: 'user', content: text }],
      }),
      timeout: 30,
    });
    if (res.statusCode !== 200) throw new Error('AI request failed: ' + res.statusCode);

    const content = (res.json && res.json.content) || [];
    const block = content.find((b) => b.type === 'tool_use');
    if (!block || !block.input) throw new Error('No structured response');
    const a = block.input;
    return buildResult(a.action, a.contact_name, a.message_text, a.say);
  }

  function buildResult(action, contactName, messageText, say) {
    const contact = contactName ? resolve(contactName) : null;
    if (action !== 'none' && !contact) {
      return { say: 'I couldn\'t find "' + contactName + '" in your contacts. Who did you mean?', action: { type: 'none' }, needsConfirm: false };
    }
    switch (action) {
      case 'send_message':
        if (!contact || !String(messageText || '').trim()) return { say: say || 'What would you like to say?', action: { type: 'none' }, needsConfirm: false };
        return { say: say || 'Send "' + messageText + '" to ' + contact.name + '?', action: { type: 'send_message', contactId: contact.id, text: String(messageText).trim() }, needsConfirm: true };
      case 'call':
        return { say: say || 'Call ' + contact.name + '?', action: { type: 'call', contactId: contact.id }, needsConfirm: true };
      case 'read_messages':
        return { say: say || 'Reading your messages from ' + contact.name + '.', action: { type: 'read_messages', contactId: contact.id }, needsConfirm: false };
      case 'open_chat':
        return { say: say || 'Opening your chat with ' + contact.name + '.', action: { type: 'open_chat', contactId: contact.id }, needsConfirm: false };
      default:
        return { say: say || 'How can I help?', action: { type: 'none' }, needsConfirm: false };
    }
  }
});
