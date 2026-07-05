import AsyncStorage from '@react-native-async-storage/async-storage';
import PocketBase, { type RecordModel } from 'pocketbase';
import './eventsource'; // installs the realtime EventSource polyfill on native
import type { AgentResult } from '../ai/agent';
import type { Contact, Message } from '../types';

/**
 * PocketBase backend for Kinly (apps/pocketbase).
 *
 * When EXPO_PUBLIC_PB_URL is set the app talks to a real, multi-user backend
 * (accounts, membership-scoped conversations, realtime). When it is unset the
 * app runs fully offline against its local AsyncStorage store, so every call
 * here is best-effort and callers fall back gracefully.
 */
const PB_URL = process.env.EXPO_PUBLIC_PB_URL;
const AUTH_KEY = 'kinly.pb_auth.v1';

export const pb = PB_URL ? new PocketBase(PB_URL) : null;

export function serverEnabled(): boolean {
  return !!PB_URL;
}

// Persist auth across launches.
if (pb) {
  pb.authStore.onChange(() => {
    if (pb.authStore.isValid) {
      AsyncStorage.setItem(
        AUTH_KEY,
        JSON.stringify({ token: pb.authStore.token, record: pb.authStore.record })
      ).catch(() => {});
    } else {
      AsyncStorage.removeItem(AUTH_KEY).catch(() => {});
    }
  });
}

/** Rehydrate the saved session (call once at startup). */
export async function loadStoredAuth(): Promise<void> {
  if (!pb) return;
  try {
    const raw = await AsyncStorage.getItem(AUTH_KEY);
    if (raw) {
      const { token, record } = JSON.parse(raw) as { token: string; record: RecordModel };
      pb.authStore.save(token, record);
    }
  } catch {
    // ignore — user just signs in again
  }
}

export function currentUserId(): string | null {
  return pb?.authStore.record?.id ?? null;
}

/** URL of the signed-in user's own profile photo, if any. */
export function myAvatarUrl(): string | undefined {
  const r = pb?.authStore.record;
  if (!r || !r.avatar) return undefined;
  return `${PB_URL}/api/files/users/${r.id}/${r.avatar as string}`;
}

/** Update the signed-in user's display name and (optionally) profile photo. */
export async function updateProfile(name: string, imageUri?: string): Promise<void> {
  if (!pb || !pb.authStore.record) return;
  const id = pb.authStore.record.id;
  const form = new FormData();
  form.append('name', name.trim());
  if (imageUri) {
    const filename = imageUri.split('/').pop() || 'avatar.jpg';
    const ext = (filename.split('.').pop() || 'jpg').toLowerCase();
    // React Native FormData file shape:
    form.append('avatar', { uri: imageUri, name: filename, type: `image/${ext === 'jpg' ? 'jpeg' : ext}` } as unknown as Blob);
  }
  await pb.collection('users').update(id, form);
  await pb.collection('users').authRefresh();
}

/** Save this device's Expo push token to the user's record. */
export async function savePushToken(token: string): Promise<void> {
  if (!pb || !pb.authStore.record) return;
  try {
    await pb.collection('users').update(pb.authStore.record.id, { pushToken: token });
  } catch {
    // non-fatal
  }
}

// --- mappers --------------------------------------------------------------

type MemberDTO = { id: string; name: string; avatar: string };
type ConversationDTO = {
  id: string;
  name: string;
  relation: string;
  phone: string;
  isGroup: boolean;
  memberNames: string[];
  members: MemberDTO[];
};

/** Build a public file URL for a PocketBase record file field. */
function fileUrl(collection: string, recordId: string, filename: string): string | undefined {
  if (!filename || !PB_URL) return undefined;
  return `${PB_URL}/api/files/${collection}/${recordId}/${filename}`;
}

function toContact(c: ConversationDTO): Contact {
  const members = (c.members ?? []).map((m) => ({
    id: m.id,
    name: m.name,
    avatar: fileUrl('users', m.id, m.avatar),
  }));
  return {
    id: c.id,
    name: c.name,
    relation: c.relation,
    phone: c.phone,
    isGroup: c.isGroup,
    memberNames: c.memberNames,
    avatar: c.isGroup ? undefined : members[0]?.avatar,
    members,
  };
}

function toMessage(r: RecordModel, meId: string | null): Message {
  return {
    id: r.id,
    contactId: r.conversation as string,
    text: r.text as string,
    mine: !!meId && r.author === meId,
    authorId: r.author as string,
    at: r.created ? Date.parse(r.created as string) : Date.now(),
  };
}

// --- people ---------------------------------------------------------------

export type KnownPerson = { id: string; name: string; phone: string; avatar?: string };

/** All conversations for the signed-in user, mapped for the UI. */
export async function fetchContacts(): Promise<Contact[] | null> {
  if (!pb || !pb.authStore.isValid) return null;
  try {
    const rows = await pb.send<ConversationDTO[]>('/api/kinly/conversations', { method: 'GET' });
    return rows.map(toContact);
  } catch {
    return null;
  }
}

/** People the user already chats with (for building a group). */
export async function fetchKnownPeople(): Promise<KnownPerson[]> {
  if (!pb || !pb.authStore.isValid) return [];
  try {
    const rows = await pb.send<{ id: string; name: string; phone: string; avatar: string }[]>(
      '/api/kinly/contacts',
      { method: 'GET' }
    );
    return rows.map((r) => ({ id: r.id, name: r.name, phone: r.phone, avatar: fileUrl('users', r.id, r.avatar) }));
  } catch {
    return [];
  }
}

/** Look up a person by phone number. Throws with a friendly message if not found. */
export async function findPerson(phone: string): Promise<{ id: string; name: string }> {
  if (!pb) throw new Error('Not connected to a server.');
  return pb.send('/api/kinly/find-user', { method: 'POST', body: { phone } });
}

/** Start (or reuse) a 1:1 chat with a person by phone. Returns the conversation id. */
export async function startDirectChat(phone: string): Promise<string> {
  if (!pb) throw new Error('Not connected to a server.');
  const res = await pb.send<{ id: string }>('/api/kinly/direct', { method: 'POST', body: { phone } });
  return res.id;
}

/** Create a group conversation. Returns the conversation id. */
export async function createGroup(title: string, memberIds: string[]): Promise<string | null> {
  if (!pb || !pb.authStore.record) return null;
  const me = pb.authStore.record.id;
  const members = Array.from(new Set([me, ...memberIds]));
  const rec = await pb.collection('conversations').create({ title, isGroup: true, members, createdBy: me });
  return rec.id;
}

// --- messages -------------------------------------------------------------

export async function fetchMessages(contactId: string): Promise<Message[] | null> {
  if (!pb || !pb.authStore.isValid) return null;
  try {
    const meId = currentUserId();
    const rows = await pb.collection('messages').getFullList({
      filter: pb.filter('conversation = {:id}', { id: contactId }),
      sort: 'created',
    });
    return rows.map((r) => toMessage(r, meId));
  } catch {
    return null;
  }
}

export async function pushMessage(contactId: string, text: string): Promise<void> {
  if (!pb || !pb.authStore.record) return;
  try {
    await pb.collection('messages').create({
      conversation: contactId,
      author: pb.authStore.record.id,
      text: text.trim(),
    });
  } catch {
    // offline — the local store already holds the message
  }
}

/** Subscribe to new/changed messages in the user's conversations. */
export async function subscribeMessages(onChange: (message: Message) => void): Promise<() => void> {
  if (!pb || !pb.authStore.isValid || typeof globalThis.EventSource === 'undefined') return () => {};
  const meId = currentUserId();
  try {
    await pb.collection('messages').subscribe('*', (e) => {
      if (e.action === 'create' || e.action === 'update') onChange(toMessage(e.record, meId));
    });
    return () => {
      pb.collection('messages').unsubscribe('*').catch(() => {});
    };
  } catch {
    return () => {};
  }
}

// --- assistant ------------------------------------------------------------

export async function askServerAssistant(text: string): Promise<AgentResult | null> {
  if (!pb || !pb.authStore.isValid) return null;
  try {
    return await pb.send('/api/kinly/assistant', { method: 'POST', body: { text } });
  } catch {
    return null;
  }
}

// --- video calls ----------------------------------------------------------

export type VideoToken = { token: string; url: string };

export async function fetchVideoToken(room: string): Promise<VideoToken | null> {
  if (!pb || !pb.authStore.record) return null;
  try {
    const me = pb.authStore.record;
    return await pb.send('/api/kinly/video-token', {
      method: 'POST',
      body: { room, identity: me.id, name: (me.name as string) || 'Guest' },
    });
  } catch {
    return null;
  }
}
