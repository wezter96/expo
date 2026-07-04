export type Contact = {
  id: string;
  name: string;
  /** "Daughter", "Son", "Friend", "Doctor" — shown under the name so it's obvious who this is. */
  relation: string;
  phone: string;
  /** Optional group membership (a group is just a special contact with isGroup = true). */
  isGroup?: boolean;
  memberNames?: string[];
};

export type Message = {
  id: string;
  contactId: string;
  text: string;
  /** true = sent by the app's user, false = received. */
  mine: boolean;
  /** epoch millis */
  at: number;
};

export type Conversation = {
  contact: Contact;
  messages: Message[];
  lastAt: number;
};
