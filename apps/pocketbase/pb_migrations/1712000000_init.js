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
    users.fields.add(new Field({ type: 'text', name: 'pushToken', max: 300 }));
    users.indexes.push("CREATE UNIQUE INDEX idx_users_phone ON users (phone) WHERE phone != ''");
    // Any signed-in user can view a user record (needed to show names & photos
    // of the people you chat with). You can only change your own record.
    users.viewRule = '@request.auth.id != ""';
    users.updateRule = 'id = @request.auth.id';
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
      deleteRule: null,
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
        // "text" (default), "photo", or "voice"
        { type: 'text', name: 'kind', max: 20 },
        // caption / body text (not required — photo & voice messages may have none)
        { type: 'text', name: 'text', max: 2000 },
        { type: 'file', name: 'image', maxSelect: 1, maxSize: 10485760, mimeTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/heic'] },
        { type: 'file', name: 'audio', maxSelect: 1, maxSize: 10485760, mimeTypes: ['audio/mp4', 'audio/m4a', 'audio/mpeg', 'audio/aac', 'audio/webm'] },
        // voice message length in seconds
        { type: 'number', name: 'duration' },
        { type: 'autodate', name: 'created', onCreate: true },
      ],
      indexes: ['CREATE INDEX idx_messages_conversation ON messages (conversation, created)'],
    });
    app.save(messages);
  },
  (app) => {
    for (const name of ['messages', 'conversations']) {
      try {
        app.delete(app.findCollectionByNameOrId(name));
      } catch (_) {
        // already gone
      }
    }
    try {
      const users = app.findCollectionByNameOrId('users');
      const phone = users.fields.getByName('phone');
      if (phone) users.fields.removeByName('phone');
      app.save(users);
    } catch (_) {
      // ignore
    }
  },
);
