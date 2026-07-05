/// <reference path="../pb_data/types.d.ts" />

/**
 * Kinly schema:
 *   conversations — a person or group you can message/call
 *   messages      — a message inside a conversation (realtime-enabled)
 *
 * Rules are left public ("") so the demo works out of the box. For production
 * you would gate these on membership/auth (see apps/pocketbase/README.md).
 */
migrate(
  (app) => {
    const conversations = new Collection({
      type: 'base',
      name: 'conversations',
      listRule: '',
      viewRule: '',
      createRule: '',
      updateRule: '',
      deleteRule: null,
      fields: [
        { type: 'text', name: 'title', required: true, max: 120 },
        { type: 'text', name: 'relation', max: 60 },
        { type: 'text', name: 'phone', max: 40 },
        { type: 'bool', name: 'isGroup' },
        { type: 'json', name: 'memberNames', maxSize: 20000 },
        { type: 'autodate', name: 'created', onCreate: true },
        { type: 'autodate', name: 'updated', onCreate: true, onUpdate: true },
      ],
    });
    app.save(conversations);

    const messages = new Collection({
      type: 'base',
      name: 'messages',
      listRule: '',
      viewRule: '',
      createRule: '',
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
        { type: 'text', name: 'text', required: true, max: 2000 },
        { type: 'bool', name: 'mine' },
        { type: 'autodate', name: 'created', onCreate: true },
      ],
      indexes: ['CREATE INDEX idx_messages_conversation ON messages (conversation, created)'],
    });
    app.save(messages);
  },
  (app) => {
    // rollback (delete children first)
    for (const name of ['messages', 'conversations']) {
      try {
        app.delete(app.findCollectionByNameOrId(name));
      } catch (_) {
        // already gone
      }
    }
  },
);
