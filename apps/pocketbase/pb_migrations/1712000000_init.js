/// <reference path="../pb_data/types.d.ts" />

/**
 * Kinly multi-user schema.
 *
 *   users (built-in auth) — extended with a `phone` so family can add you
 *   conversations         — a 1:1 or group chat; `members` are its participants
 *   messages              — a message authored by a user (realtime-enabled)
 *
 * Access is scoped to membership: you only see conversations you're a member
 * of, and their messages. Server-side hooks (pb_hooks/main.pb.js) handle
 * finding people by phone and mapping conversations to display data.
 */
migrate(
  (app) => {
    // --- users: add phone + push token; let people view each other ------
    const users = app.findCollectionByNameOrId('users');
    users.fields.add(new Field({ type: 'text', name: 'phone', max: 40 }));
    // Public username so people can add you WITHOUT sharing a phone number.
    users.fields.add(new Field({ type: 'text', name: 'username', max: 30, pattern: '^[a-z0-9_.]{3,30}$' }));
    users.fields.add(new Field({ type: 'text', name: 'pushToken', max: 300 }));
    users.fields.add(new Field({ type: 'date', name: 'lastSeen' }));
    // People this user has blocked (they can't start chats or message each other).
    users.fields.add(
      new Field({ type: 'relation', name: 'blocked', collectionId: users.id, cascadeDelete: false, maxSelect: 200 }),
    );
    // End-to-end encryption public keys (base64). Private keys never leave the
    // device. identityKey = long-term X25519; prekeyKey = initial ratchet key.
    users.fields.add(new Field({ type: 'text', name: 'identityKey', max: 100 }));
    users.fields.add(new Field({ type: 'text', name: 'prekeyKey', max: 100 }));
    // Post-quantum public key (ML-KEM-768, base64 ≈ 1580 chars) for hybrid wrap.
    users.fields.add(new Field({ type: 'text', name: 'kemKey', max: 2000 }));
    // Family check-in: last time the user tapped "I'm OK", and the caregiver who
    // is alerted if they miss a day.
    users.fields.add(new Field({ type: 'date', name: 'lastCheckIn' }));
    users.fields.add(
      new Field({ type: 'relation', name: 'caregiver', collectionId: users.id, cascadeDelete: false, maxSelect: 1 })
    );
    // Server-synced display prefs (JSON: { textSize, mode, updatedAt }) so an
    // active guardian can adjust them remotely; the owner's device applies
    // newer server prefs on launch (see /api/kinly/ward/prefs).
    users.fields.add(new Field({ type: 'text', name: 'prefs', max: 500 }));
    // Quiet hours ("HH:MM" local, empty = off) + the device's UTC offset in
    // minutes, so the push hook can evaluate the window in the user's time.
    users.fields.add(new Field({ type: 'text', name: 'quietStart', max: 5 }));
    users.fields.add(new Field({ type: 'text', name: 'quietEnd', max: 5 }));
    users.fields.add(new Field({ type: 'number', name: 'quietTz' }));
    users.indexes.push("CREATE UNIQUE INDEX idx_users_phone ON users (phone) WHERE phone != ''");
    users.indexes.push("CREATE UNIQUE INDEX idx_users_username ON users (username) WHERE username != ''");
    // Any signed-in user can view a user record (needed to show names & photos
    // of the people you chat with). You can only change — or delete — your own
    // record (in-app account deletion is a store/GDPR requirement).
    users.viewRule = '@request.auth.id != ""';
    users.updateRule = 'id = @request.auth.id';
    users.deleteRule = 'id = @request.auth.id';
    app.save(users);

    // --- conversations --------------------------------------------------
    const conversations = new Collection({
      type: 'base',
      name: 'conversations',
      // Only members can see / write; only the creator can delete.
      listRule: '@request.auth.id != "" && members.id ?= @request.auth.id',
      viewRule: '@request.auth.id != "" && members.id ?= @request.auth.id',
      createRule: '@request.auth.id != "" && members.id ?= @request.auth.id',
      updateRule: '@request.auth.id != "" && members.id ?= @request.auth.id',
      deleteRule: '@request.auth.id != "" && createdBy.id ?= @request.auth.id',
      fields: [
        { type: 'text', name: 'title', max: 120 },
        { type: 'bool', name: 'isGroup' },
        // Disappearing messages: seconds after which a message is auto-deleted
        // (0 / empty = off). Swept by a cron hook; clients also hide expired
        // messages immediately.
        { type: 'number', name: 'disappearTimer', min: 0 },
        // id of the currently pinned message (empty = none). Stored as text
        // rather than a relation because messages is defined after this
        // collection; any member may pin/unpin (guarded by updateRule).
        { type: 'text', name: 'pinnedMessage', max: 40 },
        // Shareable group invite code (empty = no active link). Redeemed via
        // the /api/kinly/group/join route, which adds the caller as a member.
        { type: 'text', name: 'inviteCode', max: 24 },
        // Group photo (any member may set it, like the group name pre-admins).
        { type: 'file', name: 'photo', maxSelect: 1, maxSize: 10485760, mimeTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/heic'] },
        // Message requests (1:1 only): members who accepted this conversation.
        // The initiator is auto-accepted; the other side sees a request until
        // they accept. Members may only add/remove THEMSELVES (hook-enforced).
        {
          type: 'relation',
          name: 'accepted',
          collectionId: users.id,
          cascadeDelete: false,
          maxSelect: 50,
        },
        {
          type: 'relation',
          name: 'members',
          required: true,
          collectionId: users.id,
          cascadeDelete: false,
          minSelect: 1,
          maxSelect: 50,
        },
        {
          type: 'relation',
          name: 'createdBy',
          collectionId: users.id,
          cascadeDelete: false,
          maxSelect: 1,
        },
        // Group admins (defaults to the creator). Only admins may rename the
        // group or change its member list / admin list — enforced by the
        // onRecordUpdateRequest hook, since the updateRule must stay open for
        // member-level fields (pinnedMessage, disappearTimer).
        {
          type: 'relation',
          name: 'admins',
          collectionId: users.id,
          cascadeDelete: false,
          maxSelect: 10,
        },
        { type: 'autodate', name: 'created', onCreate: true },
        { type: 'autodate', name: 'updated', onCreate: true, onUpdate: true },
      ],
    });
    app.save(conversations);

    // --- messages -------------------------------------------------------
    const messages = new Collection({
      type: 'base',
      name: 'messages',
      listRule: '@request.auth.id != "" && conversation.members.id ?= @request.auth.id',
      viewRule: '@request.auth.id != "" && conversation.members.id ?= @request.auth.id',
      createRule:
        '@request.auth.id != "" && author.id ?= @request.auth.id && conversation.members.id ?= @request.auth.id',
      updateRule: null,
      // The author can delete (unsend) their own message.
      deleteRule: '@request.auth.id != "" && author.id ?= @request.auth.id',
      fields: [
        {
          type: 'relation',
          name: 'conversation',
          required: true,
          cascadeDelete: true,
          minSelect: 0,
          maxSelect: 1,
          collectionId: conversations.id,
        },
        {
          type: 'relation',
          name: 'author',
          required: true,
          cascadeDelete: false,
          maxSelect: 1,
          collectionId: users.id,
        },
        // "text" (default), "photo", "voice", or "video"
        { type: 'text', name: 'kind', max: 20 },
        // Group @mentions (user ids). Deliberate metadata trade-off: exposing
        // WHO was mentioned lets the push hook ring them through a mute, but
        // the mention itself stays inside the encrypted text.
        { type: 'relation', name: 'mentions', cascadeDelete: false, maxSelect: 20, collectionId: users.id },
        // caption / body text (not required — photo & voice messages may have none)
        { type: 'text', name: 'text', max: 2000 },
        // End-to-end encryption: when enc = true, `text` is empty and the real
        // content (and any media key) is inside `cipher` (base64 AEAD). Media
        // files in image/audio are then ciphertext blobs. keyEpoch records which
        // conversation-key epoch sealed it (keys rotate on membership change).
        { type: 'bool', name: 'enc' },
        { type: 'text', name: 'cipher', max: 30000 },
        { type: 'number', name: 'keyEpoch', min: 0 },
        // No mimeTypes restriction: E2EE media uploads are encrypted blobs
        // (application/octet-stream), which a mime allowlist would reject.
        { type: 'file', name: 'image', maxSelect: 1, maxSize: 10485760 },
        { type: 'file', name: 'audio', maxSelect: 1, maxSize: 10485760 },
        // short video clips (≤ 60s enforced by the picker; encrypted blobs pass
        // as octet-stream, so mime types are not restricted here)
        { type: 'file', name: 'video', maxSelect: 1, maxSize: 52428800 },
        // voice message length in seconds
        { type: 'number', name: 'duration' },
        { type: 'autodate', name: 'created', onCreate: true },
      ],
      indexes: ['CREATE INDEX idx_messages_conversation ON messages (conversation, created)'],
    });
    // Reply-to: a self-referential relation (added after creation so it can
    // point at the messages collection itself). Also allow the author to edit
    // their own message (updateRule) and mark it edited.
    messages.fields.add(
      new Field({ type: 'relation', name: 'replyTo', maxSelect: 1, cascadeDelete: false, collectionId: messages.id })
    );
    messages.fields.add(new Field({ type: 'bool', name: 'edited' }));
    messages.updateRule = '@request.auth.id != "" && author.id ?= @request.auth.id';
    app.save(messages);

    // --- reactions (one emoji per user per message) ---------------------
    const reactions = new Collection({
      type: 'base',
      name: 'reactions',
      listRule: '@request.auth.id != "" && message.conversation.members.id ?= @request.auth.id',
      viewRule: '@request.auth.id != "" && message.conversation.members.id ?= @request.auth.id',
      createRule: '@request.auth.id != "" && user.id ?= @request.auth.id && message.conversation.members.id ?= @request.auth.id',
      updateRule: '@request.auth.id != "" && user.id ?= @request.auth.id',
      deleteRule: '@request.auth.id != "" && user.id ?= @request.auth.id',
      fields: [
        { type: 'relation', name: 'message', required: true, cascadeDelete: true, maxSelect: 1, collectionId: messages.id },
        { type: 'relation', name: 'user', required: true, cascadeDelete: true, maxSelect: 1, collectionId: users.id },
        { type: 'text', name: 'emoji', required: true, max: 8 },
        { type: 'autodate', name: 'created', onCreate: true },
      ],
      indexes: ['CREATE UNIQUE INDEX idx_reactions_msg_user ON reactions (message, user)'],
    });
    app.save(reactions);

    // --- reads (per-user last-read time, for "Seen") --------------------
    const reads = new Collection({
      type: 'base',
      name: 'reads',
      listRule: '@request.auth.id != "" && conversation.members.id ?= @request.auth.id',
      viewRule: '@request.auth.id != "" && conversation.members.id ?= @request.auth.id',
      createRule: '@request.auth.id != "" && user.id ?= @request.auth.id && conversation.members.id ?= @request.auth.id',
      updateRule: '@request.auth.id != "" && user.id ?= @request.auth.id',
      deleteRule: null,
      fields: [
        { type: 'relation', name: 'conversation', required: true, cascadeDelete: true, maxSelect: 1, collectionId: conversations.id },
        { type: 'relation', name: 'user', required: true, cascadeDelete: true, maxSelect: 1, collectionId: users.id },
        { type: 'date', name: 'lastReadAt' },
      ],
      indexes: ['CREATE UNIQUE INDEX idx_reads_conv_user ON reads (conversation, user)'],
    });
    app.save(reads);

    // --- typing (ephemeral "X is typing…" signal) -----------------------
    // One row per (conversation, user); the client bumps `updated` while the
    // person types and treats rows older than a few seconds as "stopped".
    const typing = new Collection({
      type: 'base',
      name: 'typing',
      listRule: '@request.auth.id != "" && conversation.members.id ?= @request.auth.id',
      viewRule: '@request.auth.id != "" && conversation.members.id ?= @request.auth.id',
      createRule: '@request.auth.id != "" && user.id ?= @request.auth.id && conversation.members.id ?= @request.auth.id',
      updateRule: '@request.auth.id != "" && user.id ?= @request.auth.id',
      deleteRule: null,
      fields: [
        { type: 'relation', name: 'conversation', required: true, cascadeDelete: true, maxSelect: 1, collectionId: conversations.id },
        { type: 'relation', name: 'user', required: true, cascadeDelete: true, maxSelect: 1, collectionId: users.id },
        { type: 'autodate', name: 'updated', onCreate: true, onUpdate: true },
      ],
      indexes: ['CREATE UNIQUE INDEX idx_typing_conv_user ON typing (conversation, user)'],
    });
    app.save(typing);

    // --- mutes (per-user conversation mute) ------------------------------
    // One row per (conversation, user) silences message pushes for that user
    // until `until` (empty = muted until unmuted). Checked by the push hook.
    const mutes = new Collection({
      type: 'base',
      name: 'mutes',
      listRule: '@request.auth.id != "" && user.id ?= @request.auth.id',
      viewRule: '@request.auth.id != "" && user.id ?= @request.auth.id',
      createRule:
        '@request.auth.id != "" && user.id ?= @request.auth.id && conversation.members.id ?= @request.auth.id',
      updateRule: '@request.auth.id != "" && user.id ?= @request.auth.id',
      deleteRule: '@request.auth.id != "" && user.id ?= @request.auth.id',
      fields: [
        { type: 'relation', name: 'conversation', required: true, cascadeDelete: true, maxSelect: 1, collectionId: conversations.id },
        { type: 'relation', name: 'user', required: true, cascadeDelete: true, maxSelect: 1, collectionId: users.id },
        { type: 'date', name: 'until' },
      ],
      indexes: ['CREATE UNIQUE INDEX idx_mutes_conv_user ON mutes (conversation, user)'],
    });
    app.save(mutes);

    // --- reminders (medication & appointment) ---------------------------
    // Private to the owner. Local notifications fire on the device; the
    // server copy lets a caregiver be alerted if a daily medication reminder
    // goes un-acknowledged (see the reminder_sweep cron).
    const reminders = new Collection({
      type: 'base',
      name: 'reminders',
      listRule: '@request.auth.id != "" && user.id ?= @request.auth.id',
      viewRule: '@request.auth.id != "" && user.id ?= @request.auth.id',
      createRule: '@request.auth.id != "" && user.id ?= @request.auth.id',
      updateRule: '@request.auth.id != "" && user.id ?= @request.auth.id',
      deleteRule: '@request.auth.id != "" && user.id ?= @request.auth.id',
      fields: [
        { type: 'relation', name: 'user', required: true, cascadeDelete: true, maxSelect: 1, collectionId: users.id },
        // "medication" (repeats daily) | "appointment" (one-time on `date`)
        { type: 'text', name: 'kind', max: 20 },
        { type: 'text', name: 'title', required: true, max: 120 },
        // Local time-of-day, "HH:MM".
        { type: 'text', name: 'time', max: 5 },
        // "YYYY-MM-DD" for appointments (empty for daily medication).
        { type: 'text', name: 'date', max: 10 },
        { type: 'bool', name: 'enabled' },
        // Alert the owner's caregiver if a medication reminder is missed.
        { type: 'bool', name: 'notifyCaregiver' },
        // When the owner last acknowledged ("taken" / "done").
        { type: 'date', name: 'lastDoneAt' },
        // When we last pushed the caregiver about this reminder (anti-spam).
        { type: 'date', name: 'lastAlertedAt' },
        { type: 'autodate', name: 'created', onCreate: true },
        { type: 'autodate', name: 'updated', onCreate: true, onUpdate: true },
      ],
      indexes: ['CREATE INDEX idx_reminders_user ON reminders (user)'],
    });
    app.save(reminders);

    // --- guardianships (a trusted helper relationship) ------------------
    // Links a `ward` (the person being helped) with a `guardian` (the helper).
    // Requires consent: created 'pending' by either side and becomes 'active'
    // only when the other party accepts. Mutations go through /api/kinly/
    // guardian/* routes; rows are readable by the two people involved.
    const guardianships = new Collection({
      type: 'base',
      name: 'guardianships',
      listRule: '@request.auth.id != "" && (ward.id ?= @request.auth.id || guardian.id ?= @request.auth.id)',
      viewRule: '@request.auth.id != "" && (ward.id ?= @request.auth.id || guardian.id ?= @request.auth.id)',
      createRule: null,
      updateRule: null,
      deleteRule: null,
      fields: [
        { type: 'relation', name: 'ward', required: true, cascadeDelete: true, maxSelect: 1, collectionId: users.id },
        { type: 'relation', name: 'guardian', required: true, cascadeDelete: true, maxSelect: 1, collectionId: users.id },
        // 'pending' | 'active'
        { type: 'text', name: 'status', max: 10 },
        // which side sent the invite: 'ward' | 'guardian' (the other accepts)
        { type: 'text', name: 'invitedBy', max: 10 },
        { type: 'autodate', name: 'created', onCreate: true },
        { type: 'autodate', name: 'updated', onCreate: true, onUpdate: true },
      ],
      indexes: ['CREATE UNIQUE INDEX idx_guardianships_pair ON guardianships (ward, guardian)'],
    });
    app.save(guardianships);

    // --- scheduled_messages (send later) ---------------------------------
    // Private to the author until they fire. Encrypted conversations store
    // the ciphertext (sealed on the device at scheduling time with the
    // conversation key) — the server never sees the text. A minute cron
    // moves due rows into `messages` and deletes them.
    const scheduledMessages = new Collection({
      type: 'base',
      name: 'scheduled_messages',
      listRule: '@request.auth.id != "" && user.id ?= @request.auth.id',
      viewRule: '@request.auth.id != "" && user.id ?= @request.auth.id',
      createRule:
        '@request.auth.id != "" && user.id ?= @request.auth.id && conversation.members.id ?= @request.auth.id',
      updateRule: null,
      deleteRule: '@request.auth.id != "" && user.id ?= @request.auth.id',
      fields: [
        { type: 'relation', name: 'user', required: true, cascadeDelete: true, maxSelect: 1, collectionId: users.id },
        { type: 'relation', name: 'conversation', required: true, cascadeDelete: true, maxSelect: 1, collectionId: conversations.id },
        { type: 'text', name: 'text', max: 4000 },
        { type: 'bool', name: 'enc' },
        { type: 'text', name: 'cipher', max: 30000 },
        { type: 'number', name: 'keyEpoch', min: 0 },
        { type: 'date', name: 'sendAt', required: true },
        { type: 'autodate', name: 'created', onCreate: true },
      ],
      indexes: ['CREATE INDEX idx_scheduled_due ON scheduled_messages (sendAt)'],
    });
    app.save(scheduledMessages);

    // --- calls (ring signaling) -----------------------------------------
    const calls = new Collection({
      type: 'base',
      name: 'calls',
      listRule: '@request.auth.id != "" && conversation.members.id ?= @request.auth.id',
      viewRule: '@request.auth.id != "" && conversation.members.id ?= @request.auth.id',
      createRule: '@request.auth.id != "" && caller.id ?= @request.auth.id && conversation.members.id ?= @request.auth.id',
      updateRule: '@request.auth.id != "" && conversation.members.id ?= @request.auth.id',
      deleteRule: null,
      fields: [
        { type: 'relation', name: 'conversation', required: true, cascadeDelete: true, maxSelect: 1, collectionId: conversations.id },
        { type: 'relation', name: 'caller', required: true, cascadeDelete: true, maxSelect: 1, collectionId: users.id },
        // "voice" or "video"
        { type: 'text', name: 'mode', max: 10 },
        // "ringing" | "accepted" | "declined" | "ended"
        { type: 'text', name: 'status', max: 12 },
        { type: 'autodate', name: 'created', onCreate: true },
        { type: 'autodate', name: 'updated', onCreate: true, onUpdate: true },
      ],
      indexes: ['CREATE INDEX idx_calls_conversation ON calls (conversation, created)'],
    });
    app.save(calls);

    // --- reports (safety: report a person to the admins) ----------------
    const reports = new Collection({
      type: 'base',
      name: 'reports',
      // Private to the admins — a reporter can file one but nobody reads them in-app.
      listRule: null,
      viewRule: null,
      createRule: '@request.auth.id != "" && reporter.id ?= @request.auth.id',
      updateRule: null,
      deleteRule: null,
      fields: [
        { type: 'relation', name: 'reporter', required: true, cascadeDelete: true, maxSelect: 1, collectionId: users.id },
        { type: 'relation', name: 'reportedUser', required: true, cascadeDelete: true, maxSelect: 1, collectionId: users.id },
        { type: 'relation', name: 'conversation', cascadeDelete: true, maxSelect: 1, collectionId: conversations.id },
        { type: 'text', name: 'reason', max: 1000 },
        { type: 'autodate', name: 'created', onCreate: true },
      ],
      indexes: ['CREATE INDEX idx_reports_reported ON reports (reportedUser, created)'],
    });
    app.save(reports);

    // --- conversation_keys (E2EE: each member's wrapped conversation key) ---
    // The conversation's symmetric key, encrypted ("wrapped") separately for
    // each member with that member's identity key. The server stores only the
    // wrapped (unreadable) blob; only the member's device can unwrap it.
    const conversationKeys = new Collection({
      type: 'base',
      name: 'conversation_keys',
      // You may only read the rows wrapped for *you*.
      listRule: '@request.auth.id != "" && member.id ?= @request.auth.id',
      viewRule: '@request.auth.id != "" && member.id ?= @request.auth.id',
      // Any member of the conversation may publish wrapped keys for members.
      createRule: '@request.auth.id != "" && conversation.members.id ?= @request.auth.id',
      updateRule: null,
      deleteRule: '@request.auth.id != "" && conversation.members.id ?= @request.auth.id',
      fields: [
        { type: 'relation', name: 'conversation', required: true, cascadeDelete: true, maxSelect: 1, collectionId: conversations.id },
        { type: 'relation', name: 'member', required: true, cascadeDelete: true, maxSelect: 1, collectionId: users.id },
        { type: 'relation', name: 'wrappedBy', cascadeDelete: false, maxSelect: 1, collectionId: users.id },
        { type: 'number', name: 'epoch', min: 0 },
        { type: 'text', name: 'wrappedKey', required: true, max: 4000 },
        { type: 'autodate', name: 'created', onCreate: true },
      ],
      indexes: ['CREATE UNIQUE INDEX idx_convkeys_member_epoch ON conversation_keys (conversation, member, epoch)'],
    });
    app.save(conversationKeys);
  },
  (app) => {
    for (const name of ['mutes', 'scheduled_messages', 'guardianships', 'reminders', 'conversation_keys', 'reports', 'calls', 'reactions', 'typing', 'reads', 'messages', 'conversations']) {
      try {
        app.delete(app.findCollectionByNameOrId(name));
      } catch (_) {
        // already gone
      }
    }
    try {
      const users = app.findCollectionByNameOrId('users');
      for (const f of ['phone', 'username', 'pushToken', 'lastSeen', 'blocked', 'identityKey', 'prekeyKey', 'kemKey', 'lastCheckIn', 'caregiver', 'prefs', 'quietStart', 'quietEnd', 'quietTz']) {
        if (users.fields.getByName(f)) users.fields.removeByName(f);
      }
      app.save(users);
    } catch (_) {
      // ignore
    }
  },
);
