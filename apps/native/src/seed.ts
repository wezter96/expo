import { Contact, Message } from './types';

/**
 * First-run sample data so the app is immediately usable and demonstrable.
 * On a real device you would replace this with the user's own contacts.
 */
export const seedContacts: Contact[] = [
  { id: 'c_mary', name: 'Mary Johnson', relation: 'Daughter', phone: '+15550101' },
  { id: 'c_tom', name: 'Tom Johnson', relation: 'Son', phone: '+15550102' },
  { id: 'c_ellen', name: 'Ellen Brooks', relation: 'Friend', phone: '+15550103' },
  { id: 'c_david', name: 'Dr. David Reed', relation: 'Doctor', phone: '+15550104' },
  {
    id: 'g_family',
    name: 'Family',
    relation: 'Group',
    phone: '',
    isGroup: true,
    memberNames: ['Mary', 'Tom', 'Ellen'],
  },
];

const now = Date.now();
const min = 60 * 1000;

const t = (id: string, contactId: string, text: string, mine: boolean, at: number): Message => ({
  id,
  contactId,
  text,
  kind: 'text',
  mine,
  at,
});

export const seedMessages: Message[] = [
  t('m1', 'c_mary', 'Hi Mom! How are you feeling today?', false, now - 40 * min),
  t('m2', 'c_mary', 'Much better, thank you dear.', true, now - 38 * min),
  t('m3', 'c_mary', 'I will pop by on Sunday with the kids.', false, now - 20 * min),
  t('m4', 'g_family', 'Dinner at ours this weekend?', false, now - 3 * 60 * min),
  t('m5', 'g_family', 'Sounds lovely!', true, now - 2 * 60 * min),
  t('m6', 'c_ellen', 'Are we still on for cards Thursday?', false, now - 26 * 60 * min),
];
