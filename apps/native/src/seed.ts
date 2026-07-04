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

export const seedMessages: Message[] = [
  { id: 'm1', contactId: 'c_mary', text: 'Hi Mom! How are you feeling today?', mine: false, at: now - 40 * min },
  { id: 'm2', contactId: 'c_mary', text: 'Much better, thank you dear.', mine: true, at: now - 38 * min },
  { id: 'm3', contactId: 'c_mary', text: 'I will pop by on Sunday with the kids.', mine: false, at: now - 20 * min },

  { id: 'm4', contactId: 'g_family', text: 'Dinner at ours this weekend?', mine: false, at: now - 3 * 60 * min },
  { id: 'm5', contactId: 'g_family', text: 'Sounds lovely!', mine: true, at: now - 2 * 60 * min },

  { id: 'm6', contactId: 'c_ellen', text: 'Are we still on for cards Thursday?', mine: false, at: now - 26 * 60 * min },
];
