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
    // id of the pinned message ('' = none).
    pinnedMessage: conv.getString('pinnedMessage') || '',
    // group admin user ids ([] = legacy group, everyone may manage)
    admins: conv.get('admins') || [],
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

// Unambiguous invite-code alphabet (no 0/O/1/I/L) so codes are easy to read
// aloud and retype. Not security-sensitive on its own — the code only grants
// group membership, and joins are logged as member changes.
const INVITE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
function makeInviteCode() {
  let s = '';
  for (let i = 0; i < 8; i++) s += INVITE_ALPHABET[Math.floor(Math.random() * INVITE_ALPHABET.length)];
  return s;
}

/** Return (creating if needed) a group's shareable invite code. Members only.
 *  POST /api/kinly/group/invite { conversationId } */
routerAdd('POST', '/api/kinly/group/invite', (e) => {
  const auth = e.auth;
  if (!auth) return e.json(401, { error: 'Please sign in.' });
  const info = e.requestInfo();
  const convId = String((info.body && info.body.conversationId) || '').trim();
  if (!convId) return e.json(400, { error: 'Missing group.' });

  let conv;
  try {
    conv = $app.findRecordById('conversations', convId);
  } catch (_) {
    return e.json(404, { error: 'Group not found.' });
  }
  if (!conv.getBool('isGroup')) return e.json(400, { error: 'Only groups have invite links.' });
  const members = conv.get('members') || [];
  if (members.indexOf(auth.id) === -1) return e.json(403, { error: 'Only members can share this group.' });

  let code = conv.getString('inviteCode');
  if (!code) {
    code = makeInviteCode();
    conv.set('inviteCode', code);
    $app.save(conv);
  }
  return e.json(200, { code: code });
});

/** Join a group by its invite code. Adds the caller as a member.
 *  POST /api/kinly/group/join { code } */
routerAdd('POST', '/api/kinly/group/join', (e) => {
  const auth = e.auth;
  if (!auth) return e.json(401, { error: 'Please sign in.' });
  if (rateLimited(auth.id, 30, 60 * 60 * 1000)) {
    return e.json(429, { error: 'Too many attempts. Please wait a little while and try again.' });
  }
  const info = e.requestInfo();
  const code = String((info.body && info.body.code) || '').trim().toUpperCase();
  if (!code) return e.json(400, { error: 'Enter an invite code.' });

  let conv;
  try {
    conv = $app.findFirstRecordByFilter('conversations', 'inviteCode = {:c} && isGroup = true', { c: code });
  } catch (_) {
    return e.json(404, { error: 'That invite code is not valid. Please check it and try again.' });
  }
  const members = conv.get('members') || [];
  if (members.indexOf(auth.id) !== -1) return e.json(200, { id: conv.id });
  if (members.length >= 50) return e.json(400, { error: 'This group is full.' });

  conv.set('members', members.concat([auth.id]));
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

// ===========================================================================
// Guardianships — a consent-based "trusted helper" relationship.
// ===========================================================================

function pushOne(token, title, body, data) {
  if (!token) return;
  try {
    $http.send({
      url: 'https://exp.host/--/api/v2/push/send',
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify([{ to: token, title: title, body: body, sound: 'default', data: data || {} }]),
      timeout: 20,
    });
  } catch (_) {}
}

/** Invite/ask to form a guardianship. POST /api/kinly/guardian/request
 *  { userId, role } — role is the OTHER person's role: 'guardian' (they will
 *  help me; I am the ward) or 'ward' (I will help them; I am the guardian). */
routerAdd('POST', '/api/kinly/guardian/request', (e) => {
  const auth = e.auth;
  if (!auth) return e.json(401, { error: 'Please sign in.' });
  const info = e.requestInfo();
  const otherId = String((info.body && info.body.userId) || '').trim();
  const role = String((info.body && info.body.role) || '').trim();
  if (!otherId || (role !== 'guardian' && role !== 'ward')) return e.json(400, { error: 'Missing details.' });
  if (otherId === auth.id) return e.json(400, { error: 'That is you!' });

  let other;
  try {
    other = $app.findRecordById('users', otherId);
  } catch (_) {
    return e.json(404, { error: 'That person could not be found.' });
  }
  if (blockedPair(auth.id, otherId)) return e.json(403, { error: 'This is not available.' });

  const wardId = role === 'guardian' ? auth.id : otherId;
  const guardianId = role === 'guardian' ? otherId : auth.id;
  const invitedBy = role === 'guardian' ? 'ward' : 'guardian';

  // Reuse an existing pair if there is one.
  try {
    const existing = $app.findFirstRecordByFilter(
      'guardianships',
      'ward = {:w} && guardian = {:g}',
      { w: wardId, g: guardianId }
    );
    return e.json(200, { id: existing.id, status: existing.getString('status') });
  } catch (_) {}

  const col = $app.findCollectionByNameOrId('guardianships');
  const g = new Record(col);
  g.set('ward', wardId);
  g.set('guardian', guardianId);
  g.set('status', 'pending');
  g.set('invitedBy', invitedBy);
  $app.save(g);

  const meName = other && auth.get('name') ? auth.getString('name') : 'Someone';
  const body =
    invitedBy === 'ward'
      ? meName + ' would like you to be their guardian on Kinly.'
      : meName + ' offered to help look after you on Kinly.';
  pushOne(other.getString('pushToken'), 'Guardian request', body, { guardianship: g.id });

  return e.json(200, { id: g.id, status: 'pending' });
});

/** Accept or decline a pending guardianship. POST /api/kinly/guardian/respond
 *  { id, accept } — only the party who did NOT send the invite may respond. */
routerAdd('POST', '/api/kinly/guardian/respond', (e) => {
  const auth = e.auth;
  if (!auth) return e.json(401, { error: 'Please sign in.' });
  const info = e.requestInfo();
  const id = String((info.body && info.body.id) || '').trim();
  const accept = !!(info.body && info.body.accept);

  let g;
  try {
    g = $app.findRecordById('guardianships', id);
  } catch (_) {
    return e.json(404, { error: 'Request not found.' });
  }
  if (g.getString('status') !== 'pending') return e.json(400, { error: 'This request is no longer pending.' });

  // The accepting party is whoever did not invite.
  const mustAccept = g.getString('invitedBy') === 'ward' ? g.getString('guardian') : g.getString('ward');
  if (auth.id !== mustAccept) return e.json(403, { error: 'This request is not yours to answer.' });

  if (!accept) {
    $app.delete(g);
    return e.json(200, { status: 'declined' });
  }
  g.set('status', 'active');
  $app.save(g);

  // Let the inviter know it was accepted.
  const inviterId = g.getString('invitedBy') === 'ward' ? g.getString('ward') : g.getString('guardian');
  try {
    const inviter = $app.findRecordById('users', inviterId);
    pushOne(inviter.getString('pushToken'), 'Guardian request accepted', (auth.getString('name') || 'They') + ' accepted.', {});
  } catch (_) {}

  return e.json(200, { status: 'active' });
});

/** Remove a guardianship (either party). POST /api/kinly/guardian/remove { id } */
routerAdd('POST', '/api/kinly/guardian/remove', (e) => {
  const auth = e.auth;
  if (!auth) return e.json(401, { error: 'Please sign in.' });
  const info = e.requestInfo();
  const id = String((info.body && info.body.id) || '').trim();
  let g;
  try {
    g = $app.findRecordById('guardianships', id);
  } catch (_) {
    return e.json(200, { ok: true });
  }
  if (auth.id !== g.getString('ward') && auth.id !== g.getString('guardian')) {
    return e.json(403, { error: 'Not allowed.' });
  }
  $app.delete(g);
  return e.json(200, { ok: true });
});

/** The caller's guardianships, split into who helps me and who I help.
 *  GET /api/kinly/guardians */
routerAdd('GET', '/api/kinly/guardians', (e) => {
  const auth = e.auth;
  if (!auth) return e.json(401, { error: 'Please sign in.' });
  const rows = $app.findRecordsByFilter(
    'guardianships',
    'ward = {:me} || guardian = {:me}',
    '-created',
    500,
    0,
    { me: auth.id }
  );
  const out = [];
  for (const g of rows) {
    const iAmWard = g.getString('ward') === auth.id;
    const otherId = iAmWard ? g.getString('guardian') : g.getString('ward');
    const status = g.getString('status');
    const mustAccept = g.getString('invitedBy') === 'ward' ? g.getString('guardian') : g.getString('ward');
    out.push({
      id: g.id,
      // role of the OTHER person relative to me
      role: iAmWard ? 'guardian' : 'ward',
      status: status,
      needsMyResponse: status === 'pending' && mustAccept === auth.id,
      person: userBrief(otherId),
      // wellbeing shown to guardians about their wards
      ward: iAmWard ? null : (function () {
        try {
          const w = $app.findRecordById('users', otherId);
          // Medication reminders that look missed (mirrors reminder_sweep).
          let missedMeds = 0;
          let medsTotal = 0;
          if (status === 'active') {
            try {
              const staleCut = new Date(Date.now() - 26 * 60 * 60 * 1000).toISOString().replace('T', ' ');
              const meds = $app.findRecordsByFilter(
                'reminders',
                "user = {:u} && kind = 'medication' && enabled = true",
                '',
                100,
                0,
                { u: otherId }
              );
              medsTotal = meds.length;
              for (const m of meds) {
                const doneAt = m.getString('lastDoneAt');
                if (!doneAt || doneAt < staleCut) missedMeds++;
              }
            } catch (_) {}
          }
          return {
            lastCheckIn: w.getString('lastCheckIn') || '',
            lastSeen: w.getString('lastSeen') || '',
            missedMeds: missedMeds,
            medsTotal: medsTotal,
          };
        } catch (_) {
          return null;
        }
      })(),
    });
  }
  return e.json(200, out);
});

/** True if `callerId` is an active guardian of `wardId`. */
function isActiveGuardian(callerId, wardId) {
  try {
    $app.findFirstRecordByFilter('guardianships', "ward = {:w} && guardian = {:g} && status = 'active'", {
      w: wardId,
      g: callerId,
    });
    return true;
  } catch (_) {
    return false;
  }
}

function reminderJSON(r) {
  return {
    id: r.id,
    kind: r.getString('kind') || 'medication',
    title: r.getString('title') || '',
    time: r.getString('time') || '',
    date: r.getString('date') || '',
    enabled: r.getBool('enabled'),
    notifyCaregiver: r.getBool('notifyCaregiver'),
    lastDoneAt: r.getString('lastDoneAt') || '',
  };
}

/** A ward's reminders, for an active guardian. GET /api/kinly/ward/reminders?wardId= */
routerAdd('GET', '/api/kinly/ward/reminders', (e) => {
  const auth = e.auth;
  if (!auth) return e.json(401, { error: 'Please sign in.' });
  const info = e.requestInfo();
  const wardId = String((info.query && info.query.wardId) || '').trim();
  if (!wardId || !isActiveGuardian(auth.id, wardId)) return e.json(403, { error: 'Not allowed.' });
  const rows = $app.findRecordsByFilter('reminders', 'user = {:u}', 'time', 200, 0, { u: wardId });
  return e.json(200, rows.map(reminderJSON));
});

/** Create a reminder on a ward's behalf. POST /api/kinly/ward/reminders */
routerAdd('POST', '/api/kinly/ward/reminders', (e) => {
  const auth = e.auth;
  if (!auth) return e.json(401, { error: 'Please sign in.' });
  const info = e.requestInfo();
  const b = info.body || {};
  const wardId = String(b.wardId || '').trim();
  if (!wardId || !isActiveGuardian(auth.id, wardId)) return e.json(403, { error: 'Not allowed.' });
  if (!String(b.title || '').trim()) return e.json(400, { error: 'A name is required.' });

  const col = $app.findCollectionByNameOrId('reminders');
  const r = new Record(col);
  r.set('user', wardId);
  r.set('kind', b.kind === 'appointment' ? 'appointment' : 'medication');
  r.set('title', String(b.title).trim());
  r.set('time', String(b.time || ''));
  r.set('date', String(b.date || ''));
  r.set('enabled', b.enabled !== false);
  r.set('notifyCaregiver', !!b.notifyCaregiver);
  $app.save(r);
  return e.json(200, reminderJSON(r));
});

/** Delete a ward's reminder. POST /api/kinly/ward/reminders/delete { wardId, id } */
routerAdd('POST', '/api/kinly/ward/reminders/delete', (e) => {
  const auth = e.auth;
  if (!auth) return e.json(401, { error: 'Please sign in.' });
  const info = e.requestInfo();
  const wardId = String((info.body && info.body.wardId) || '').trim();
  const id = String((info.body && info.body.id) || '').trim();
  if (!wardId || !isActiveGuardian(auth.id, wardId)) return e.json(403, { error: 'Not allowed.' });
  try {
    const r = $app.findRecordById('reminders', id);
    if (r.getString('user') !== wardId) return e.json(403, { error: 'Not allowed.' });
    $app.delete(r);
  } catch (_) {}
  return e.json(200, { ok: true });
});

/** Set a ward's display prefs (text size / theme). Owner-or-guardian.
 *  POST /api/kinly/ward/prefs { wardId, textSize?, mode? } */
routerAdd('POST', '/api/kinly/ward/prefs', (e) => {
  const auth = e.auth;
  if (!auth) return e.json(401, { error: 'Please sign in.' });
  const info = e.requestInfo();
  const b = info.body || {};
  const wardId = String(b.wardId || '').trim();
  if (!wardId || (wardId !== auth.id && !isActiveGuardian(auth.id, wardId))) {
    return e.json(403, { error: 'Not allowed.' });
  }
  const textSize = String(b.textSize || '');
  const mode = String(b.mode || '');
  if (textSize && ['normal', 'large', 'xlarge'].indexOf(textSize) === -1) return e.json(400, { error: 'Bad text size.' });
  if (mode && ['light', 'dark', 'auto'].indexOf(mode) === -1) return e.json(400, { error: 'Bad mode.' });

  let ward;
  try {
    ward = $app.findRecordById('users', wardId);
  } catch (_) {
    return e.json(404, { error: 'Not found.' });
  }
  let prefs = {};
  try {
    prefs = JSON.parse(ward.getString('prefs') || '{}');
  } catch (_) {}
  if (textSize) prefs.textSize = textSize;
  if (mode) prefs.mode = mode;
  prefs.updatedAt = new Date().toISOString();
  ward.set('prefs', JSON.stringify(prefs));
  $app.save(ward);

  if (wardId !== auth.id) {
    pushOne(
      ward.getString('pushToken'),
      'Kinly settings updated',
      (auth.getString('name') || 'Your guardian') + ' adjusted your display settings to help you read more easily.',
      {}
    );
  }
  return e.json(200, { prefs: prefs });
});

/** Add a contact for a ward: starts (or reuses) a 1:1 between the ward and the
 *  person at `handle`. Guardian only. POST /api/kinly/ward/contacts */
routerAdd('POST', '/api/kinly/ward/contacts', (e) => {
  const auth = e.auth;
  if (!auth) return e.json(401, { error: 'Please sign in.' });
  if (rateLimited(auth.id, 20, 60 * 60 * 1000)) {
    return e.json(429, { error: 'Too many lookups. Please wait a little while and try again.' });
  }
  const info = e.requestInfo();
  const wardId = String((info.body && info.body.wardId) || '').trim();
  const handle = String((info.body && info.body.handle) || '').trim();
  if (!wardId || !isActiveGuardian(auth.id, wardId)) return e.json(403, { error: 'Not allowed.' });
  if (!handle) return e.json(400, { error: 'Enter a username or phone number.' });

  const other = resolvePerson(handle);
  if (!other) return e.json(404, { error: 'No one with that username or number has joined Kinly yet.' });
  if (other.id === wardId) return e.json(400, { error: 'That is already them!' });
  if (blockedPair(wardId, other.id)) {
    return e.json(403, { error: 'This conversation is not available.' });
  }

  // Reuse an existing 1:1 if there is one (same shape as /api/kinly/direct).
  const existing = $app.findRecordsByFilter(
    'conversations',
    'isGroup = false && members.id ?= {:me} && members.id ?= {:other}',
    '-updated',
    20,
    0,
    { me: wardId, other: other.id },
  );
  for (const c of existing) {
    const ids = c.get('members') || [];
    if (ids.length === 2) return e.json(200, { id: c.id });
  }

  const col = $app.findCollectionByNameOrId('conversations');
  const conv = new Record(col);
  conv.set('isGroup', false);
  conv.set('title', '');
  conv.set('members', [wardId, other.id]);
  conv.set('createdBy', wardId);
  $app.save(conv);

  // Tell the ward someone new is in their list (content-free beyond names).
  try {
    const ward = $app.findRecordById('users', wardId);
    pushOne(
      ward.getString('pushToken'),
      'New contact added',
      (auth.getString('name') || 'Your guardian') + ' added ' + (other.getString('name') || 'someone') + ' to your contacts.',
      { conversationId: conv.id }
    );
  } catch (_) {}

  return e.json(200, { id: conv.id });
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
// Group governance — only admins may rename a group or change its member or
// admin lists. The collection updateRule stays open to all members because
// member-level fields (pinnedMessage, disappearTimer) must remain writable;
// this hook narrows just the governance fields. A member may always remove
// themself (leave). Legacy groups with no admins keep the old free-for-all.
// ===========================================================================

onRecordUpdateRequest((e) => {
  const rec = e.record;
  if (!rec.getBool('isGroup') || !e.auth) {
    e.next();
    return;
  }
  let old;
  try {
    old = $app.findRecordById('conversations', rec.id);
  } catch (_) {
    e.next();
    return;
  }
  const sorted = (v) => (v || []).slice().sort().join(',');
  const oldMembers = sorted(old.get('members'));
  const newMembers = sorted(rec.get('members'));
  const membersChanged = oldMembers !== newMembers;
  const titleChanged = old.getString('title') !== rec.getString('title');
  const adminsChanged = sorted(old.get('admins')) !== sorted(rec.get('admins'));
  if (!membersChanged && !titleChanged && !adminsChanged) {
    e.next();
    return;
  }

  const admins = old.get('admins') || [];
  const isAdmin = admins.length === 0 || admins.indexOf(e.auth.id) !== -1;

  // Leaving: the only change is the caller's own removal from members.
  const oldArr = (old.get('members') || []).slice();
  const newArr = (rec.get('members') || []).slice();
  const removedSelf =
    membersChanged &&
    !titleChanged &&
    !adminsChanged &&
    newArr.length === oldArr.length - 1 &&
    oldArr.indexOf(e.auth.id) !== -1 &&
    newArr.indexOf(e.auth.id) === -1 &&
    newArr.every((id) => oldArr.indexOf(id) !== -1);

  if (!isAdmin && !removedSelf) {
    throw new ForbiddenError('Only group admins can change this.');
  }
  e.next();
}, 'conversations');

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

    // Skip members who muted this conversation (until empty = forever).
    const nowStamp = new Date().toISOString().replace('T', ' ');
    const isMuted = (userId) => {
      try {
        const m = $app.findFirstRecordByFilter('mutes', 'conversation = {:c} && user = {:u}', {
          c: conv.id,
          u: userId,
        });
        const until = m.getString('until');
        return !until || until > nowStamp;
      } catch (_) {
        return false;
      }
    };

    const memberIds = conv.get('members') || [];
    const messages = [];
    for (const id of memberIds) {
      if (id === authorId || isMuted(id)) continue;
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

/** Push-token lookup by user id (''-safe). */
function tokenFor(userId) {
  try {
    return $app.findRecordById('users', userId).getString('pushToken');
  } catch (_) {
    return '';
  }
}

/** Active guardian user ids for a ward. */
function activeGuardiansOf(wardId) {
  try {
    const rows = $app.findRecordsByFilter('guardianships', "ward = {:w} && status = 'active'", '', 100, 0, { w: wardId });
    return rows.map((g) => g.getString('guardian'));
  } catch (_) {
    return [];
  }
}

// Family check-in: once an hour, if someone hasn't checked in for ~30h, push
// the people looking after them — their legacy caregiver and any active
// guardians — so a family member can look in on them.
cronAdd('checkin_sweep', '0 * * * *', () => {
  try {
    const cutoff = new Date(Date.now() - 30 * 60 * 60 * 1000).toISOString().replace('T', ' ');
    // ward id -> set of recipient user ids
    const recipients = {};
    const add = (wardId, rid) => {
      if (!wardId || !rid || rid === wardId) return;
      (recipients[wardId] = recipients[wardId] || {})[rid] = true;
    };
    const withCg = $app.findRecordsByFilter('users', "caregiver != ''", '', 1000, 0);
    for (const u of withCg) add(u.id, u.getString('caregiver'));
    const gs = $app.findRecordsByFilter('guardianships', "status = 'active'", '', 2000, 0);
    for (const g of gs) add(g.getString('ward'), g.getString('guardian'));

    const messages = [];
    for (const wardId in recipients) {
      let ward;
      try {
        ward = $app.findRecordById('users', wardId);
      } catch (_) {
        continue;
      }
      const last = ward.getString('lastCheckIn');
      if (last && last >= cutoff) continue; // checked in recently
      const name = ward.getString('name') || 'your family member';
      for (const rid in recipients[wardId]) {
        const token = tokenFor(rid);
        if (token) {
          messages.push({
            to: token,
            title: 'Check in on ' + name,
            body: (ward.getString('name') || 'They') + " hasn't checked in on Kinly today. A quick call might be nice.",
            sound: 'default',
            data: { conversationId: '' },
          });
        }
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
    $app.logger().error('check-in sweep failed', 'error', String(err));
  }
});

// Medication safety net: once an hour, if a daily medication reminder that
// opted into caregiver alerts hasn't been acknowledged for over a day, push
// the caregiver. lastAlertedAt throttles this to at most ~once/20h per item.
cronAdd('reminder_sweep', '0 * * * *', () => {
  try {
    const now = Date.now();
    const staleCut = new Date(now - 26 * 60 * 60 * 1000).toISOString().replace('T', ' ');
    const alertCut = new Date(now - 20 * 60 * 60 * 1000).toISOString().replace('T', ' ');
    const due = $app.findRecordsByFilter(
      'reminders',
      "kind = 'medication' && enabled = true && notifyCaregiver = true && (lastDoneAt = '' || lastDoneAt < {:s}) && (lastAlertedAt = '' || lastAlertedAt < {:a})",
      '',
      500,
      0,
      { s: staleCut, a: alertCut }
    );
    const messages = [];
    const stamp = new Date().toISOString().replace('T', ' ');
    for (const r of due) {
      let owner;
      try {
        owner = $app.findRecordById('users', r.getString('user'));
      } catch (_) {
        continue;
      }
      // Notify the owner's legacy caregiver and any active guardians.
      const recipientIds = {};
      const cg = owner.getString('caregiver');
      if (cg) recipientIds[cg] = true;
      for (const gid of activeGuardiansOf(owner.id)) recipientIds[gid] = true;
      let notified = false;
      for (const rid in recipientIds) {
        const token = tokenFor(rid);
        if (token) {
          notified = true;
          messages.push({
            to: token,
            title: 'Medication reminder',
            body: (owner.getString('name') || 'Your family member') + ' may have missed: ' + r.getString('title'),
            sound: 'default',
            data: {},
          });
        }
      }
      if (!notified) continue;
      r.set('lastAlertedAt', stamp);
      try {
        $app.save(r);
      } catch (_) {}
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
    $app.logger().error('reminder sweep failed', 'error', String(err));
  }
});

// Scheduled messages: every minute, move due rows into `messages` (which
// also fires the normal push-notification hook) and delete them.
cronAdd('scheduled_send', '* * * * *', () => {
  try {
    const now = new Date().toISOString().replace('T', ' ');
    const due = $app.findRecordsByFilter('scheduled_messages', 'sendAt <= {:t}', 'sendAt', 200, 0, { t: now });
    if (!due.length) return;
    const msgCol = $app.findCollectionByNameOrId('messages');
    for (const s of due) {
      try {
        const m = new Record(msgCol);
        m.set('conversation', s.getString('conversation'));
        m.set('author', s.getString('user'));
        m.set('kind', 'text');
        m.set('text', s.getString('text'));
        m.set('enc', s.getBool('enc'));
        m.set('cipher', s.getString('cipher'));
        m.set('keyEpoch', s.getInt('keyEpoch'));
        $app.save(m);
      } catch (err) {
        $app.logger().error('scheduled send failed', 'error', String(err));
      }
      try {
        $app.delete(s);
      } catch (_) {}
    }
  } catch (err) {
    $app.logger().error('scheduled sweep failed', 'error', String(err));
  }
});

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
