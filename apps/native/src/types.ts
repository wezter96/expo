export type Member = { id: string; name: string; avatar?: string; lastSeen?: string; identityKey?: string };

export type Contact = {
  id: string;
  name: string;
  /** "Daughter", "Son", "Friend", "Doctor" — shown under the name so it's obvious who this is. */
  relation: string;
  phone: string;
  /** Optional group membership (a group is just a special contact with isGroup = true). */
  isGroup?: boolean;
  memberNames?: string[];
  /** Profile photo URL (the other person, for 1:1 chats). */
  avatar?: string;
  /** The other members (for resolving group sender names/photos). */
  members?: Member[];
  /** Disappearing-messages timer in seconds (0 / undefined = off). */
  disappearTimer?: number;
};

export type MessageKind = 'text' | 'photo' | 'voice';

export type Message = {
  id: string;
  contactId: string;
  text: string;
  kind: MessageKind;
  /** Photo URL (kind === 'photo'). */
  imageUrl?: string;
  /** Audio URL (kind === 'voice'). */
  audioUrl?: string;
  /** Voice message length in seconds. */
  duration?: number;
  /** true = sent by the app's user, false = received. */
  mine: boolean;
  /** Delivery state for messages the user sent (online mode). */
  status?: 'sending' | 'sent' | 'failed';
  /** id of the sender (used to label who spoke in group chats). */
  authorId?: string;
  /** true if this message was end-to-end encrypted on the server. */
  encrypted?: boolean;
  /** base64 per-file media key (encrypted messages only) — used to decrypt the file for display. */
  mediaKey?: string;
  /** epoch millis */
  at: number;
};

export type Conversation = {
  contact: Contact;
  messages: Message[];
  lastAt: number;
};
