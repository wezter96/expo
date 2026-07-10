/// <reference path="../pb_data/types.d.ts" />

// ===========================================================================
// Shared helpers
// ===========================================================================

function userBrief(id) {
  try {
    const u = $app.findRecordById('users', id);
    return {
      id: u.id,
      name: u.getString('name') || u.getString('email') || 'Someone',
      phone: u.getString('phone') || '',
      username: u.getString('username') || '',
      avatar: u.getString('avatar') || '',
      lastSeen: u.getString('lastSeen') || '',
      identityKey: u.getString('identityKey') || '',
      prekeyKey: u.getString('prekeyKey') || '',
      kemKey: u.getString('kemKey') || '',
    };
  } catch (_) {
    return { id: id, name: 'Someone', phone: '', username: '', avatar: '', lastSeen: '', identityKey: '', prekeyKey: '', kemKey: '' };
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
    // { id, name, avatar-filename } for each of the OTHER members
    members: others,
    // Disappearing-messages timer (seconds; 0 = off).
    disappearTimer: conv.getInt('disappearTimer') || 0,
  };
}

function callerConversations(meId) {
  return $app.findRecordsByFilter('conversations', 'members.id ?= {:uid}', '-updated', 200, 0, { uid: meId });
}

// Soft per-user rate limit for phone lookups, to deter enumerating who is on
// Kinly. In-memory within each hooks VM (not shared across pooled VMs), so it's
// a deterrent, not a guarantee — put real rate limiting at your proxy/CDN too.
const lookupHits = {};
function rateLimited(uid, max, windowMs) {
  const now = Date.now();
  const arr = (lookupHits[uid] || []).filter((t) => now - t < windowMs);
  arr.push(now);
  lookupHits[uid] = arr;
  return arr.length > max;
}

/** Resolve a person by handle: an @username or a phone number. Returns the
 *  user record, or null if not found. */
function resolvePerson(handle) {
  const h = String(handle || '').trim();
  if (!h) return null;
  const uname = h.replace(/^@/, '').toLowerCase();
  // Try username first (if it looks like one), then phone.
  if (/^[a-z0-9_.]{3,30}$/.test(uname)) {
    try {
      return $app.findFirstRecordByFilter('users', 'username = {:u}', { u: uname });
    } catch (_) {}
  }
  try {
    return $app.findFirstRecordByFilter('users', 'phone = {:p}', { p: h });
  } catch (_) {
    return null;
  }
}

/** True if either user has blocked the other. */
function blockedPair(aId, bId) {
  try {
    const a = $app.findRecordById('users', aId);
    if ((a.get('blocked') || []).indexOf(bId) !== -1) return true;
  } catch (_) {}
  try {
    const b = $app.findRecordById('users', bId);
    if ((b.get('blocked') || []).indexOf(aId) !== -1) return true;
  } catch (_) {}
  return false;
}

// ===========================================================================
// People
// ===========================================================================

/** Find a user by @username or phone. POST /api/kinly/find-user { handle } */
routerAdd('POST', '/api/kinly/find-user', (e) => {
  if (!e.auth) return e.json(401, { error: 'Please sign in.' });
  if (rateLimited(e.auth.id, 20, 60 * 60 * 1000)) {
    return e.json(429, { error: 'Too many lookups. Please wait a little while and try again.' });
  }
  const info = e.requestInfo();
  const handle = String((info.body && (info.body.handle || info.body.phone)) || '').trim();
  if (!handle) return e.json(400, { error: 'Enter a username or phone number.' });
  const u = resolvePerson(handle);
  if (!u) return e.json(404, { error: 'No one with that username or number has joined Kinly yet.' });
  return e.json(200, { id: u.id, name: u.getString('name') || u.getString('email'), username: u.getString('username') || '' });
});

/** Start (or reuse) a 1:1 chat by @username or phone. POST /api/kinly/direct { handle } */
routerAdd('POST', '/api/kinly/direct', (e) => {
  const auth = e.auth;
  if (!auth) return e.json(401, { error: 'Please sign in.' });
  if (rateLimited(auth.id, 20, 60 * 60 * 1000)) {
    return e.json(429, { error: 'Too many lookups. Please wait a little while and try again.' });
  }
  const info = e.requestInfo();
  const handle = String((info.body && (info.body.handle || info.body.phone)) || '').trim();
  if (!handle) return e.json(400, { error: 'Enter a username or phone number.' });

  const other = resolvePerson(handle);
  if (!other) {
    return e.json(404, { error: 'No one with that username or number has joined Kinly yet.' });
  }
  if (other.id === auth.id) return e.json(400, { error: 'That is you!' });
  if (blockedPair(auth.id, other.id)) {
    return e.json(403, { error: 'This conversation is not available. You may have blocked this person, or they blocked you.' });
  }

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

// ===========================================================================
// Safety — refuse to create a 1:1 message when either party has blocked the
// other. (Groups aren't gated; leave/remove is the group-level control.)
// ===========================================================================

onRecordCreateRequest((e) => {
  try {
    const msg = e.record;
    const conv = $app.findRecordById('conversations', msg.getString('conversation'));
    if (!conv.getBool('isGroup')) {
      const authorId = msg.getString('author');
      const memberIds = conv.get('members') || [];
      for (const id of memberIds) {
        if (id !== authorId && blockedPair(authorId, id)) {
          throw new BadRequestError('This conversation is not available.');
        }
      }
    }
  } catch (err) {
    if (err instanceof BadRequestError) throw err;
    // Any lookup failure: fall through and let normal rules decide.
  }
  e.next();
}, 'messages');

// ===========================================================================
// Push notifications — when a message is created, notify the other members
// via Expo's push service. Requires each user to have registered a pushToken.
// ===========================================================================

onRecordAfterCreateSuccess((e) => {
  try {
    const msg = e.record;
    const conv = $app.findRecordById('conversations', msg.getString('conversation'));
    const isGroup = conv.getBool('isGroup');
    const authorId = msg.getString('author');
    let authorName = 'Someone';
    try {
      authorName = $app.findRecordById('users', authorId).getString('name') || authorName;
    } catch (_) {}

    // Privacy: never put message *content* in the push payload — it transits
    // Apple/Google push servers. Reveal only who and the message kind; the app
    // fetches and shows the real content after the device unlocks it.
    const kind = msg.getString('kind');
    let summary = 'sent you a message';
    if (kind === 'photo') summary = 'sent a photo';
    else if (kind === 'voice') summary = 'sent a voice message';

    const title = isGroup ? conv.getString('title') || 'Kinly' : authorName;
    const body = isGroup ? authorName + ' ' + summary : summary;

    const memberIds = conv.get('members') || [];
    const messages = [];
    for (const id of memberIds) {
      if (id === authorId) continue;
      let token = '';
      try {
        token = $app.findRecordById('users', id).getString('pushToken');
      } catch (_) {}
      if (token) {
        messages.push({
          to: token,
          title: title,
          body: body,
          sound: 'default',
          data: { conversationId: conv.id },
        });
      }
    }

    if (messages.length > 0) {
      $http.send({
        url: 'https://exp.host/--/api/v2/push/send',
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify(messages),
        timeout: 20,
      });
    }
  } catch (err) {
    $app.logger().error('push notify failed', 'error', String(err));
  }

  e.next();
}, 'messages');

// When a call starts (ringing), push "X is calling" to the other members.
onRecordAfterCreateSuccess((e) => {
  try {
    const call = e.record;
    if (call.getString('status') !== 'ringing') {
      e.next();
      return;
    }
    const conv = $app.findRecordById('conversations', call.getString('conversation'));
    const callerId = call.getString('caller');
    let callerName = 'Someone';
    try {
      callerName = $app.findRecordById('users', callerId).getString('name') || callerName;
    } catch (_) {}

    const mode = call.getString('mode') === 'video' ? 'video' : 'voice';
    const isGroup = conv.getBool('isGroup');
    const title = isGroup ? conv.getString('title') || 'Incoming call' : callerName;
    const body = '📞 ' + callerName + ' is calling (' + mode + ')';

    const memberIds = conv.get('members') || [];
    const messages = [];
    for (const id of memberIds) {
      if (id === callerId) continue;
      let token = '';
      try {
        token = $app.findRecordById('users', id).getString('pushToken');
      } catch (_) {}
      if (token) {
        messages.push({
          to: token,
          title: title,
          body: body,
          sound: 'default',
          priority: 'high',
          data: { conversationId: conv.id, callId: call.id, mode: mode, incomingCall: true },
        });
      }
    }
    if (messages.length > 0) {
      $http.send({
        url: 'https://exp.host/--/api/v2/push/send',
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify(messages),
        timeout: 20,
      });
    }
  } catch (err) {
    $app.logger().error('call notify failed', 'error', String(err));
  }
  e.next();
}, 'calls');

// ===========================================================================
// Disappearing messages — every 15 min, delete messages older than their
// conversation's timer. Deletes stream to clients over realtime; clients also
// hide expired messages immediately so they don't linger until the sweep.
// ===========================================================================

cronAdd('disappearing_sweep', '*/15 * * * *', () => {
  try {
    const convs = $app.findRecordsByFilter('conversations', 'disappearTimer > 0', '', 1000, 0);
    const now = Date.now();
    for (const c of convs) {
      const secs = c.getInt('disappearTimer');
      if (!secs) continue;
      const cutoff = new Date(now - secs * 1000).toISOString().replace('T', ' ');
      const old = $app.findRecordsByFilter(
        'messages',
        'conversation = {:c} && created < {:t}',
        'created',
        500,
        0,
        { c: c.id, t: cutoff },
      );
      for (const m of old) {
        try {
          $app.delete(m);
        } catch (_) {}
      }
    }
  } catch (err) {
    $app.logger().error('disappearing sweep failed', 'error', String(err));
  }
});
