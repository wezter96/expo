/// <reference path="../pb_data/types.d.ts" />

// ===========================================================================
// Shared helpers
// ===========================================================================

function userBrief(id) {
  try {
    const u = $app.findRecordById('users', id);
    return { id: u.id, name: u.getString('name') || u.getString('email') || 'Someone', phone: u.getString('phone') || '' };
  } catch (_) {
    return { id: id, name: 'Someone', phone: '' };
  }
}

/** Map a conversation record to the shape the app's UI expects. */
function mapConversation(conv, meId) {
  const isGroup = conv.getBool('isGroup');
  const memberIds = conv.get('members') || [];
  const others = memberIds.filter((id) => id !== meId).map((id) => userBrief(id));
  let name;
  let phone = '';
  if (isGroup) {
    name = conv.getString('title') || 'Group';
  } else {
    const o = others[0];
    name = o ? o.name : 'Chat';
    phone = o ? o.phone : '';
  }
  return {
    id: conv.id,
    name: name,
    relation: isGroup ? 'Group' : '',
    phone: phone,
    isGroup: isGroup,
    memberNames: others.map((o) => o.name),
  };
}

function callerConversations(meId) {
  return $app.findRecordsByFilter('conversations', 'members.id ?= {:uid}', '-updated', 200, 0, { uid: meId });
}

// ===========================================================================
// People
// ===========================================================================

/** Find a user by phone number. POST /api/kinly/find-user { phone } */
routerAdd('POST', '/api/kinly/find-user', (e) => {
  if (!e.auth) return e.json(401, { error: 'Please sign in.' });
  const info = e.requestInfo();
  const phone = String((info.body && info.body.phone) || '').trim();
  if (!phone) return e.json(400, { error: 'A phone number is required.' });
  try {
    const u = $app.findFirstRecordByFilter('users', 'phone = {:p}', { p: phone });
    return e.json(200, { id: u.id, name: u.getString('name') || u.getString('email') });
  } catch (_) {
    return e.json(404, { error: 'No one with that phone number has joined Kinly yet.' });
  }
});

/** Start (or reuse) a 1:1 chat with a person by phone. POST /api/kinly/direct { phone } */
routerAdd('POST', '/api/kinly/direct', (e) => {
  const auth = e.auth;
  if (!auth) return e.json(401, { error: 'Please sign in.' });
  const info = e.requestInfo();
  const phone = String((info.body && info.body.phone) || '').trim();
  if (!phone) return e.json(400, { error: 'A phone number is required.' });

  let other;
  try {
    other = $app.findFirstRecordByFilter('users', 'phone = {:p}', { p: phone });
  } catch (_) {
    return e.json(404, { error: 'No one with that phone number has joined Kinly yet.' });
  }
  if (other.id === auth.id) return e.json(400, { error: 'That is your own number.' });

  // Reuse an existing 1:1 if there is one.
  const existing = $app.findRecordsByFilter(
    'conversations',
    'isGroup = false && members.id ?= {:me} && members.id ?= {:other}',
    '-updated',
    20,
    0,
    { me: auth.id, other: other.id },
  );
  for (const c of existing) {
    const ids = c.get('members') || [];
    if (ids.length === 2) return e.json(200, { id: c.id });
  }

  const col = $app.findCollectionByNameOrId('conversations');
  const conv = new Record(col);
  conv.set('isGroup', false);
  conv.set('title', '');
  conv.set('members', [auth.id, other.id]);
  conv.set('createdBy', auth.id);
  $app.save(conv);
  return e.json(200, { id: conv.id });
});

/** The caller's conversations, mapped for display. GET /api/kinly/conversations */
routerAdd('GET', '/api/kinly/conversations', (e) => {
  const auth = e.auth;
  if (!auth) return e.json(401, { error: 'Please sign in.' });
  const convs = callerConversations(auth.id);
  return e.json(
    200,
    convs.map((c) => mapConversation(c, auth.id)),
  );
});

/** People the caller already knows (for building groups). GET /api/kinly/contacts */
routerAdd('GET', '/api/kinly/contacts', (e) => {
  const auth = e.auth;
  if (!auth) return e.json(401, { error: 'Please sign in.' });
  const convs = callerConversations(auth.id);
  const seen = {};
  const out = [];
  for (const c of convs) {
    const ids = c.get('members') || [];
    for (const id of ids) {
      if (id !== auth.id && !seen[id]) {
        seen[id] = true;
        out.push(userBrief(id));
      }
    }
  }
  return e.json(200, out);
});

// ===========================================================================
// Assistant  (POST /api/kinly/assistant { text })
// ===========================================================================

routerAdd('POST', '/api/kinly/assistant', (e) => {
  const auth = e.auth;
  if (!auth) return e.json(401, { error: 'Please sign in.' });

  const info = e.requestInfo();
  const input = String((info.body && info.body.text) || '').trim();

  const convs = callerConversations(auth.id);
  const contacts = convs.map((c) => {
    const m = mapConversation(c, auth.id);
    return { id: m.id, name: m.name, relation: m.relation, isGroup: m.isGroup };
  });

  if (!input) {
    return e.json(200, { say: 'Please tell me what you would like to do.', action: { type: 'none' }, needsConfirm: false });
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

  function resolve(query) {
    const q = String(query || '').trim().toLowerCase();
    if (!q) return null;
    return (
      contacts.find((c) => c.name.toLowerCase() === q) ||
      contacts.find((c) => c.name.toLowerCase().indexOf(q) === 0) ||
      contacts.find((c) => c.name.toLowerCase().indexOf(q) !== -1) ||
      contacts.find((c) => c.relation.toLowerCase() === q) ||
      null
    );
  }

  function runLocally(text) {
    const lower = text.toLowerCase();
    const m =
      lower.match(/(?:call|phone|ring)\s+(?:my\s+)?([a-z ]+?)(?:\s+(?:and|now|please)|[.?!]|$)/) ||
      lower.match(/(?:to|for|my)\s+([a-z ]+?)(?:\s+(?:that|saying|and|now)|[,.?!]|$)/);
    const who = m ? resolve(m[1].trim()) : null;

    if (/\b(call|phone|ring|dial|video)\b/.test(lower)) {
      if (who) return { say: 'Calling ' + who.name + ' now. Is that right?', action: { type: 'call', contactId: who.id }, needsConfirm: true };
      return { say: 'Who would you like to call?', action: { type: 'none' }, needsConfirm: false };
    }
    const send = text.match(/(?:tell|text|message|send)\s+(?:a message to\s+|to\s+|my\s+)?([A-Za-z ]+?)(?:\s+(?:that|saying|:)\s+|,\s+)(.+)/i);
    if (send) {
      const target = resolve(send[1].trim());
      const body = send[2].trim();
      if (target && body) return { say: 'I\'ll send "' + body + '" to ' + target.name + '. Shall I send it?', action: { type: 'send_message', contactId: target.id, text: body }, needsConfirm: true };
    }
    if (/\b(send|text|message|tell|write)\b/.test(lower) && who) return { say: 'What would you like to say to ' + who.name + '?', action: { type: 'open_chat', contactId: who.id }, needsConfirm: false };
    if (/\b(read|catch me up|what did|new messages|any messages)\b/.test(lower) && who) return { say: 'Here are your latest messages from ' + who.name + '.', action: { type: 'read_messages', contactId: who.id }, needsConfirm: false };
    if (/\b(open|show|talk to|chat with|see)\b/.test(lower) && who) return { say: 'Opening your chat with ' + who.name + '.', action: { type: 'open_chat', contactId: who.id }, needsConfirm: false };
    const bare = resolve(text);
    if (bare) return { say: 'Opening your chat with ' + bare.name + '.', action: { type: 'open_chat', contactId: bare.id }, needsConfirm: false };
    return { say: 'I can help you call someone or send a message. For example, say "Call Mary" or "Tell Tom I\'ll be late".', action: { type: 'none' }, needsConfirm: false };
  }

  function runWithClaude(text, roster, key, modelId) {
    const rosterText = roster.map((c) => '- ' + c.name + ' (' + (c.relation || 'contact') + ')' + (c.isGroup ? ' [group]' : '')).join('\n');
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
      body: JSON.stringify({ model: modelId, max_tokens: 400, system: system, tools: [tool], tool_choice: { type: 'tool', name: 'perform_action' }, messages: [{ role: 'user', content: text }] }),
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
    if (action !== 'none' && !contact) return { say: 'I couldn\'t find "' + contactName + '" in your contacts. Who did you mean?', action: { type: 'none' }, needsConfirm: false };
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

// ===========================================================================
// Video call token  (POST /api/kinly/video-token { room, identity, name })
// ===========================================================================

routerAdd('POST', '/api/kinly/video-token', (e) => {
  if (!e.auth) return e.json(401, { error: 'Please sign in.' });
  const info = e.requestInfo();
  const body = info.body || {};
  const room = String(body.room || '').trim();
  const identity = String(body.identity || e.auth.id).trim();
  const name = String(body.name || e.auth.getString('name') || identity).trim();

  const url = $os.getenv('LIVEKIT_URL');
  const apiKey = $os.getenv('LIVEKIT_API_KEY');
  const apiSecret = $os.getenv('LIVEKIT_API_SECRET');
  if (!url || !apiKey || !apiSecret) return e.json(503, { error: 'Video calling is not configured on the server.' });
  if (!room) return e.json(400, { error: 'room is required.' });

  const now = Math.floor(Date.now() / 1000);
  const payload = {
    iss: apiKey,
    sub: identity,
    name: name,
    nbf: now,
    video: { room: room, roomJoin: true, canPublish: true, canSubscribe: true, canPublishData: true },
  };
  const token = $security.createJWT(payload, apiSecret, 60 * 60 * 4);
  return e.json(200, { token: token, url: url });
});
