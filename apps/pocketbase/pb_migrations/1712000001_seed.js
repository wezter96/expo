/// <reference path="../pb_data/types.d.ts" />

/** First-run sample family so the app is usable immediately. */
migrate(
  (app) => {
    const conversations = app.findCollectionByNameOrId('conversations');
    const messages = app.findCollectionByNameOrId('messages');

    function conv(title, relation, phone, isGroup, memberNames) {
      const r = new Record(conversations);
      r.set('title', title);
      r.set('relation', relation);
      r.set('phone', phone || '');
      r.set('isGroup', !!isGroup);
      if (memberNames) r.set('memberNames', memberNames);
      app.save(r);
      return r;
    }

    function msg(conv, text, mine) {
      const m = new Record(messages);
      m.set('conversation', conv.id);
      m.set('text', text);
      m.set('mine', !!mine);
      app.save(m);
    }

    const mary = conv('Mary Johnson', 'Daughter', '+15550101', false, null);
    const tom = conv('Tom Johnson', 'Son', '+15550102', false, null);
    const ellen = conv('Ellen Brooks', 'Friend', '+15550103', false, null);
    conv('Dr. David Reed', 'Doctor', '+15550104', false, null);
    const family = conv('Family', 'Group', '', true, ['Mary', 'Tom', 'Ellen']);

    msg(mary, 'Hi Mom! How are you feeling today?', false);
    msg(mary, 'Much better, thank you dear.', true);
    msg(mary, 'I will pop by on Sunday with the kids.', false);
    msg(family, 'Dinner at ours this weekend?', false);
    msg(family, 'Sounds lovely!', true);
    msg(ellen, 'Are we still on for cards Thursday?', false);
    void tom;
  },
  (app) => {
    // rollback: remove seeded rows
    for (const name of ['messages', 'conversations']) {
      const rows = app.findAllRecords(name);
      for (const r of rows) app.delete(r);
    }
  },
);
