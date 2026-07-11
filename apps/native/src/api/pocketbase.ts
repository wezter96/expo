import AsyncStorage from '@react-native-async-storage/async-storage';
import PocketBase, { type RecordModel } from 'pocketbase';
import './eventsource'; // installs the realtime EventSource polyfill on native
import type { AgentResult } from '../ai/agent';
import * as e2ee from '../e2ee';
import type { Contact, Message, MessageKind } from '../types';

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

type MemberDTO = { id: string; name: string; avatar: string; lastSeen?: string; identityKey?: string };
type ConversationDTO = {
  id: string;
  name: string;
  relation: string;
  phone: string;
  isGroup: boolean;
  memberNames: string[];
  members: MemberDTO[];
  disappearTimer?: number;
  pinnedMessage?: string;
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
    lastSeen: m.lastSeen,
    identityKey: m.identityKey,
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
    disappearTimer: c.disappearTimer ?? 0,
    pinnedMessage: c.pinnedMessage || undefined,
  };
}

function toMessage(r: RecordModel, meId: string | null): Message {
  const kind = ((r.kind as string) || 'text') as MessageKind;
  return {
    id: r.id,
    contactId: r.conversation as string,
    text: (r.text as string) ?? '',
    kind,
    imageUrl: r.image ? fileUrl('messages', r.id, r.image as string) : undefined,
    audioUrl: r.audio ? fileUrl('messages', r.id, r.audio as string) : undefined,
    duration: typeof r.duration === 'number' ? (r.duration as number) : undefined,
    mine: !!meId && r.author === meId,
    authorId: r.author as string,
    encrypted: !!r.enc,
    replyTo: (r.replyTo as string) || undefined,
    edited: !!r.edited,
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

/** Look up a person by @username or phone. Throws with a friendly message if not found. */
export async function findPerson(handle: string): Promise<{ id: string; name: string; username?: string }> {
  if (!pb) throw new Error('Not connected to a server.');
  return pb.send('/api/kinly/find-user', { method: 'POST', body: { handle } });
}

/** Start (or reuse) a 1:1 chat by @username or phone. Returns the conversation id. */
export async function startDirectChat(handle: string): Promise<string> {
  if (!pb) throw new Error('Not connected to a server.');
  const res = await pb.send<{ id: string }>('/api/kinly/direct', { method: 'POST', body: { handle } });
  return res.id;
}

/** Set (or change) the signed-in user's public username. Lowercased; 3–30 chars. */
export async function updateUsername(username: string): Promise<void> {
  if (!pb || !pb.authStore.record) return;
  const clean = username.trim().toLowerCase().replace(/^@/, '');
  await pb.collection('users').update(pb.authStore.record.id, { username: clean });
  await pb.collection('users').authRefresh();
}

/** The signed-in user's username, if set. */
export function currentUsername(): string {
  return (pb?.authStore.record?.username as string) ?? '';
}

// --- family check-in -------------------------------------------------------

/** Record that the user is OK right now. */
export async function checkIn(): Promise<void> {
  if (!pb || !pb.authStore.record) return;
  await pb.collection('users').update(pb.authStore.record.id, { lastCheckIn: new Date().toISOString() });
  await pb.collection('users').authRefresh();
}

/** Set (or clear) the caregiver who is alerted if you miss a check-in. */
export async function setCaregiver(userId: string | null): Promise<void> {
  if (!pb || !pb.authStore.record) return;
  await pb.collection('users').update(pb.authStore.record.id, { caregiver: userId ?? '' });
  await pb.collection('users').authRefresh();
}

export function caregiverId(): string {
  return (pb?.authStore.record?.caregiver as string) ?? '';
}

/** Epoch millis of the last check-in, or 0. */
export function lastCheckInAt(): number {
  const v = pb?.authStore.record?.lastCheckIn as string | undefined;
  return v ? Date.parse(v) : 0;
}

// --- reminders (medication & appointments) ---------------------------------

export type ReminderKind = 'medication' | 'appointment';
export type Reminder = {
  id: string;
  kind: ReminderKind;
  title: string;
  /** Local time-of-day, "HH:MM". */
  time: string;
  /** "YYYY-MM-DD" for appointments; empty for daily medication. */
  date?: string;
  enabled: boolean;
  notifyCaregiver: boolean;
  lastDoneAt?: number;
};

function toReminder(r: RecordModel): Reminder {
  return {
    id: r.id,
    kind: ((r.kind as string) || 'medication') as ReminderKind,
    title: (r.title as string) || '',
    time: (r.time as string) || '',
    date: (r.date as string) || undefined,
    enabled: !!r.enabled,
    notifyCaregiver: !!r.notifyCaregiver,
    lastDoneAt: r.lastDoneAt ? Date.parse(r.lastDoneAt as string) : undefined,
  };
}

/** The current user's reminders, soonest time first. */
export async function fetchReminders(): Promise<Reminder[]> {
  if (!pb || !pb.authStore.record) return [];
  try {
    const rows = await pb.collection('reminders').getFullList({
      filter: pb.filter('user = {:u}', { u: pb.authStore.record.id }),
      sort: 'time',
    });
    return rows.map(toReminder);
  } catch {
    return [];
  }
}

/** Create a reminder and return it (with its server id). */
export async function createReminder(input: Omit<Reminder, 'id' | 'lastDoneAt'>): Promise<Reminder | null> {
  if (!pb || !pb.authStore.record) return null;
  try {
    const rec = await pb.collection('reminders').create({
      user: pb.authStore.record.id,
      kind: input.kind,
      title: input.title,
      time: input.time,
      date: input.date ?? '',
      enabled: input.enabled,
      notifyCaregiver: input.notifyCaregiver,
    });
    return toReminder(rec);
  } catch {
    return null;
  }
}

/** Mark a reminder acknowledged now ("taken" / "done"). */
export async function markReminderDone(id: string): Promise<void> {
  if (!pb) return;
  try {
    await pb.collection('reminders').update(id, { lastDoneAt: new Date().toISOString() });
  } catch {
    // best-effort
  }
}

export async function deleteReminder(id: string): Promise<void> {
  if (!pb) return;
  try {
    await pb.collection('reminders').delete(id);
  } catch {
    // best-effort
  }
}

// --- guardianships (trusted helpers) ---------------------------------------

/** The other person's role relative to me: they help me ('guardian') or I help
 *  them ('ward'). */
export type GuardianRole = 'guardian' | 'ward';
export type Guardian = {
  id: string;
  role: GuardianRole;
  status: 'pending' | 'active';
  needsMyResponse: boolean;
  person: { id: string; name: string; avatar?: string; phone?: string; username?: string };
  /** Wellbeing of the ward (only present when I am the guardian). */
  ward?: { lastCheckIn: number; lastSeen: number; missedMeds: number; medsTotal: number } | null;
};

type GuardianDTO = {
  id: string;
  role: GuardianRole;
  status: 'pending' | 'active';
  needsMyResponse: boolean;
  person: { id: string; name: string; avatar?: string; phone?: string; username?: string };
  ward?: { lastCheckIn?: string; lastSeen?: string; missedMeds?: number; medsTotal?: number } | null;
};

/** My guardianships — people who help me and people I help. */
export async function fetchGuardians(): Promise<Guardian[]> {
  if (!pb || !pb.authStore.isValid) return [];
  try {
    const rows = await pb.send<GuardianDTO[]>('/api/kinly/guardians', { method: 'GET' });
    return rows.map((r) => ({
      id: r.id,
      role: r.role,
      status: r.status,
      needsMyResponse: r.needsMyResponse,
      person: {
        id: r.person.id,
        name: r.person.name,
        avatar: fileUrl('users', r.person.id, (r.person as { avatar?: string }).avatar ?? ''),
        phone: r.person.phone || undefined,
        username: r.person.username || undefined,
      },
      ward: r.ward
        ? {
            lastCheckIn: r.ward.lastCheckIn ? Date.parse(r.ward.lastCheckIn) : 0,
            lastSeen: r.ward.lastSeen ? Date.parse(r.ward.lastSeen) : 0,
            missedMeds: r.ward.missedMeds ?? 0,
            medsTotal: r.ward.medsTotal ?? 0,
          }
        : null,
    }));
  } catch {
    return [];
  }
}

/** Ask to form a guardianship. `role` is the other person's role: 'guardian'
 *  (they will help me) or 'ward' (I will help them). */
export async function requestGuardian(userId: string, role: GuardianRole): Promise<void> {
  if (!pb) throw new Error('Not connected to a server.');
  await pb.send('/api/kinly/guardian/request', { method: 'POST', body: { userId, role } });
}

export async function respondGuardian(id: string, accept: boolean): Promise<void> {
  if (!pb) throw new Error('Not connected to a server.');
  await pb.send('/api/kinly/guardian/respond', { method: 'POST', body: { id, accept } });
}

export async function removeGuardian(id: string): Promise<void> {
  if (!pb) return;
  try {
    await pb.send('/api/kinly/guardian/remove', { method: 'POST', body: { id } });
  } catch {
    // best-effort
  }
}

type WardReminderDTO = {
  id: string;
  kind: ReminderKind;
  title: string;
  time: string;
  date: string;
  enabled: boolean;
  notifyCaregiver: boolean;
  lastDoneAt: string;
};

function dtoToReminder(r: WardReminderDTO): Reminder {
  return {
    id: r.id,
    kind: r.kind || 'medication',
    title: r.title,
    time: r.time,
    date: r.date || undefined,
    enabled: r.enabled,
    notifyCaregiver: r.notifyCaregiver,
    lastDoneAt: r.lastDoneAt ? Date.parse(r.lastDoneAt) : undefined,
  };
}

/** A ward's reminders (guardian view). */
export async function fetchWardReminders(wardId: string): Promise<Reminder[]> {
  if (!pb) return [];
  try {
    const rows = await pb.send<WardReminderDTO[]>(`/api/kinly/ward/reminders?wardId=${encodeURIComponent(wardId)}`, {
      method: 'GET',
    });
    return rows.map(dtoToReminder);
  } catch {
    return [];
  }
}

/** Create a reminder for a ward (guardian). */
export async function createWardReminder(
  wardId: string,
  input: Omit<Reminder, 'id' | 'lastDoneAt'>
): Promise<Reminder | null> {
  if (!pb) return null;
  try {
    const r = await pb.send<WardReminderDTO>('/api/kinly/ward/reminders', {
      method: 'POST',
      body: { wardId, ...input, date: input.date ?? '' },
    });
    return dtoToReminder(r);
  } catch {
    return null;
  }
}

export async function deleteWardReminder(wardId: string, id: string): Promise<void> {
  if (!pb) return;
  try {
    await pb.send('/api/kinly/ward/reminders/delete', { method: 'POST', body: { wardId, id } });
  } catch {
    // best-effort
  }
}

export type RemotePrefs = { textSize?: 'normal' | 'large' | 'xlarge'; mode?: 'light' | 'dark' | 'auto'; updatedAt?: string };

/** Set a ward's display prefs (guardian, or yourself). */
export async function setWardPrefs(wardId: string, prefs: { textSize?: string; mode?: string }): Promise<void> {
  if (!pb) throw new Error('Not connected to a server.');
  await pb.send('/api/kinly/ward/prefs', { method: 'POST', body: { wardId, ...prefs } });
}

/** The signed-in user's own server-synced prefs (refreshed from the server). */
export async function fetchMyPrefs(): Promise<RemotePrefs | null> {
  if (!pb || !pb.authStore.record) return null;
  try {
    await pb.collection('users').authRefresh();
    const raw = (pb.authStore.record?.prefs as string) || '';
    return raw ? (JSON.parse(raw) as RemotePrefs) : null;
  } catch {
    return null;
  }
}

/** Add a contact for a ward by phone/@username (guardian). Returns the
 *  conversation id. Throws with a friendly message on failure. */
export async function addWardContact(wardId: string, handle: string): Promise<string> {
  if (!pb) throw new Error('Not connected to a server.');
  const res = await pb.send<{ id: string }>('/api/kinly/ward/contacts', { method: 'POST', body: { wardId, handle } });
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

/** Rename a group. */
export async function renameGroup(conversationId: string, title: string): Promise<void> {
  if (!pb) return;
  await pb.collection('conversations').update(conversationId, { title: title.trim() });
}

/** Replace a group's member list (add / remove / leave). Rotates the
 *  conversation key so a removed member can't read future messages. */
export async function updateGroupMembers(conversationId: string, memberIds: string[]): Promise<void> {
  if (!pb) return;
  await pb.collection('conversations').update(conversationId, { members: Array.from(new Set(memberIds)) });
  await rotateConvKey(conversationId);
}

/** Fetch (creating on first use) a group's shareable invite code. */
export async function getGroupInvite(conversationId: string): Promise<string | null> {
  if (!pb) return null;
  const res = await pb.send<{ code: string }>('/api/kinly/group/invite', {
    method: 'POST',
    body: { conversationId },
  });
  return res.code ?? null;
}

/** Join a group by its invite code. Returns the conversation id on success. */
export async function joinGroupByCode(code: string): Promise<string | null> {
  if (!pb) return null;
  const res = await pb.send<{ id: string }>('/api/kinly/group/join', {
    method: 'POST',
    body: { code: code.trim().toUpperCase() },
  });
  return res.id ?? null;
}

// --- end-to-end encryption -------------------------------------------------

/** Publish this device's E2EE public keys (call after sign-in). Idempotent. */
export async function publishE2EEKeys(): Promise<void> {
  if (!pb || !pb.authStore.record) return;
  try {
    const bundle = await e2ee.e2eePublicBundle();
    if (!bundle) return; // web / unsupported
    const rec = pb.authStore.record;
    if (rec.identityKey === bundle.identity && rec.prekeyKey === bundle.prekey && rec.kemKey === bundle.kem) return;
    await pb.collection('users').update(rec.id, { identityKey: bundle.identity, prekeyKey: bundle.prekey, kemKey: bundle.kem });
    await pb.collection('users').authRefresh();
  } catch {
    // non-fatal; messages fall back to plaintext until keys publish
  }
}

// In-memory cache of unwrapped conversation keys, keyed by `${convId}:${epoch}`.
const convKeyCache = new Map<string, Uint8Array>();

async function unwrapRow(row: RecordModel): Promise<Uint8Array | null> {
  const wrappedBy = (row.expand as { wrappedBy?: RecordModel } | undefined)?.wrappedBy;
  const identity = wrappedBy?.identityKey as string | undefined;
  if (!row.wrappedKey || !identity) return null;
  return e2ee.unwrapConvKey(row.wrappedKey as string, identity);
}

/** The conversation key for a specific epoch (older messages use older keys). */
async function convKeyForEpoch(conversationId: string, epoch: number): Promise<Uint8Array | null> {
  if (!pb || !pb.authStore.record || !e2ee.e2eeSupported) return null;
  const cacheKey = `${conversationId}:${epoch}`;
  const cached = convKeyCache.get(cacheKey);
  if (cached) return cached;
  try {
    const row = await pb
      .collection('conversation_keys')
      .getFirstListItem(
        pb.filter('conversation = {:c} && member = {:m} && epoch = {:e}', { c: conversationId, m: pb.authStore.record.id, e: epoch }),
        { expand: 'wrappedBy' }
      );
    const key = await unwrapRow(row);
    if (key) convKeyCache.set(cacheKey, key);
    return key;
  } catch {
    return null;
  }
}

/** My latest conversation key + its epoch, if one has been published for me. */
async function latestConvKey(conversationId: string): Promise<{ key: Uint8Array; epoch: number } | null> {
  if (!pb || !pb.authStore.record || !e2ee.e2eeSupported) return null;
  try {
    const row = await pb
      .collection('conversation_keys')
      .getFirstListItem(pb.filter('conversation = {:c} && member = {:m}', { c: conversationId, m: pb.authStore.record.id }), {
        sort: '-epoch',
        expand: 'wrappedBy',
      });
    const key = await unwrapRow(row);
    if (!key) return null;
    const epoch = (row.epoch as number) ?? 0;
    convKeyCache.set(`${conversationId}:${epoch}`, key);
    return { key, epoch };
  } catch {
    return null;
  }
}

/** Generate + distribute a new conversation key at `epoch`, wrapped per member. */
async function distributeKey(conversationId: string, members: RecordModel[], epoch: number): Promise<Uint8Array> {
  const key = e2ee.newConvKey();
  for (const m of members) {
    const wrapped = await e2ee.wrapConvKeyFor(m.identityKey as string, m.kemKey as string, key);
    await pb!
      .collection('conversation_keys')
      .create({ conversation: conversationId, member: m.id, wrappedBy: pb!.authStore.record!.id, epoch, wrappedKey: wrapped });
  }
  convKeyCache.set(`${conversationId}:${epoch}`, key);
  return key;
}

/**
 * Get the current conversation key + epoch, creating one at epoch 0 if none
 * exists and all members can do E2EE. Returns null when E2EE isn't possible
 * (unsupported, or a member has no key yet) — callers fall back to plaintext.
 */
async function ensureConvKey(conversationId: string): Promise<{ key: Uint8Array; epoch: number } | null> {
  const existing = await latestConvKey(conversationId);
  if (existing) return existing;
  if (!pb || !pb.authStore.record || !e2ee.e2eeSupported) return null;
  try {
    const conv = await pb.collection('conversations').getOne(conversationId, { expand: 'members' });
    const members = ((conv.expand as { members?: RecordModel[] } | undefined)?.members ?? []) as RecordModel[];
    if (!members.length || members.some((m) => !m.identityKey || !m.kemKey)) return null;
    const key = await distributeKey(conversationId, members, 0);
    return { key, epoch: 0 };
  } catch {
    return latestConvKey(conversationId); // a concurrent creator may have won
  }
}

/**
 * Rotate the conversation key (forward secrecy): mint a new key at the next
 * epoch for the current member set. Call after someone leaves/joins so past
 * keys — and anyone removed — can't read future messages.
 */
export async function rotateConvKey(conversationId: string): Promise<void> {
  if (!pb || !pb.authStore.record || !e2ee.e2eeSupported) return;
  try {
    const latest = await latestConvKey(conversationId);
    const nextEpoch = (latest?.epoch ?? -1) + 1;
    const conv = await pb.collection('conversations').getOne(conversationId, { expand: 'members' });
    const members = ((conv.expand as { members?: RecordModel[] } | undefined)?.members ?? []) as RecordModel[];
    if (!members.length || members.some((m) => !m.identityKey || !m.kemKey)) return;
    await distributeKey(conversationId, members, nextEpoch);
  } catch {
    // best-effort; next send will still use the existing key
  }
}

/** Decrypt an encrypted message record (best-effort; never throws). Returns the
 *  plaintext text and, for media, the per-file key used to decrypt the blob. */
async function decryptMessage(r: RecordModel): Promise<{ text: string; mediaKey?: string }> {
  if (!r.enc) return { text: (r.text as string) ?? '' };
  try {
    const key = await convKeyForEpoch(r.conversation as string, (r.keyEpoch as number) ?? 0);
    if (!key) return { text: '🔒 Encrypted — unlock on your other device' };
    const p = e2ee.openPayload(key, r.cipher as string);
    return { text: p.t, mediaKey: p.m?.key };
  } catch {
    return { text: '🔒 Could not decrypt this message' };
  }
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
    const out: Message[] = [];
    for (const r of rows) {
      const m = toMessage(r, meId);
      if (r.enc) {
        const d = await decryptMessage(r);
        m.text = d.text;
        m.mediaKey = d.mediaKey;
      }
      out.push(m);
    }
    return out;
  } catch {
    return null;
  }
}

const ID_CHARS = 'abcdefghijklmnopqrstuvwxyz0123456789';
/** A PocketBase-compatible 15-char record id, generated client-side so an
 *  optimistic message and its realtime echo share the same id (dedupe). */
export function newId(): string {
  let s = '';
  for (let i = 0; i < 15; i++) s += ID_CHARS[Math.floor(Math.random() * ID_CHARS.length)];
  return s;
}

/** Send a text message with a client-provided id. Returns true on success.
 *  Sealed end-to-end when the conversation has E2EE keys; plaintext otherwise. */
export async function pushMessage(id: string, contactId: string, text: string, replyTo?: string): Promise<boolean> {
  if (!pb || !pb.authStore.record) return false;
  try {
    const base: Record<string, unknown> = { id, conversation: contactId, author: pb.authStore.record.id, kind: 'text' };
    if (replyTo) base.replyTo = replyTo;
    const ck = await ensureConvKey(contactId);
    if (ck) {
      await pb
        .collection('messages')
        .create({ ...base, enc: true, text: '', keyEpoch: ck.epoch, cipher: e2ee.sealPayload(ck.key, { t: text.trim() }) });
    } else {
      await pb.collection('messages').create({ ...base, text: text.trim() });
    }
    return true;
  } catch {
    return false;
  }
}

/** Edit one of my own text messages. Re-seals when encrypted. */
export async function editMessage(messageId: string, contactId: string, text: string): Promise<boolean> {
  if (!pb || !pb.authStore.record) return false;
  try {
    const ck = await ensureConvKey(contactId);
    if (ck) {
      await pb
        .collection('messages')
        .update(messageId, { edited: true, enc: true, text: '', keyEpoch: ck.epoch, cipher: e2ee.sealPayload(ck.key, { t: text.trim() }) });
    } else {
      await pb.collection('messages').update(messageId, { edited: true, text: text.trim() });
    }
    return true;
  } catch {
    return false;
  }
}

function fileField(uri: string, field: string, fallbackName: string, mime: string): FormData {
  const name = uri.split('/').pop() || fallbackName;
  const form = new FormData();
  form.append(field, { uri, name, type: mime } as unknown as Blob);
  return form;
}

/** Send a photo message. Encrypted (file + caption) when the conversation has
 *  E2EE keys; plaintext otherwise. Returns true on success. */
export async function pushPhoto(id: string, contactId: string, uri: string, caption = ''): Promise<boolean> {
  if (!pb || !pb.authStore.record) return false;
  try {
    const author = pb.authStore.record.id;
    const ck = await ensureConvKey(contactId);
    if (ck) {
      const { encUri, keyB64 } = await e2ee.encryptFileToTemp(uri);
      const form = fileField(encUri, 'image', 'photo.enc', 'application/octet-stream');
      form.append('id', id);
      form.append('conversation', contactId);
      form.append('author', author);
      form.append('kind', 'photo');
      form.append('enc', 'true');
      form.append('text', '');
      form.append('keyEpoch', String(ck.epoch));
      form.append('cipher', e2ee.sealPayload(ck.key, { t: caption.trim(), m: { key: keyB64, kind: 'photo' } }));
      await pb.collection('messages').create(form);
    } else {
      const form = fileField(uri, 'image', 'photo.jpg', 'image/jpeg');
      form.append('id', id);
      form.append('conversation', contactId);
      form.append('author', author);
      form.append('kind', 'photo');
      form.append('text', caption.trim());
      await pb.collection('messages').create(form);
    }
    return true;
  } catch {
    return false;
  }
}

/** Send a voice message. Encrypted when the conversation has E2EE keys. */
export async function pushVoice(id: string, contactId: string, uri: string, duration: number): Promise<boolean> {
  if (!pb || !pb.authStore.record) return false;
  try {
    const author = pb.authStore.record.id;
    const ck = await ensureConvKey(contactId);
    if (ck) {
      const { encUri, keyB64 } = await e2ee.encryptFileToTemp(uri);
      const form = fileField(encUri, 'audio', 'voice.enc', 'application/octet-stream');
      form.append('id', id);
      form.append('conversation', contactId);
      form.append('author', author);
      form.append('kind', 'voice');
      form.append('enc', 'true');
      form.append('text', '');
      form.append('duration', String(Math.round(duration)));
      form.append('keyEpoch', String(ck.epoch));
      form.append('cipher', e2ee.sealPayload(ck.key, { t: '', m: { key: keyB64, kind: 'voice', duration: Math.round(duration) } }));
      await pb.collection('messages').create(form);
    } else {
      const form = fileField(uri, 'audio', 'voice.m4a', 'audio/m4a');
      form.append('id', id);
      form.append('conversation', contactId);
      form.append('author', author);
      form.append('kind', 'voice');
      form.append('text', '');
      form.append('duration', String(Math.round(duration)));
      await pb.collection('messages').create(form);
    }
    return true;
  } catch {
    return false;
  }
}

/** Set a conversation's disappearing-messages timer (seconds; 0 = off). */
export async function setDisappearTimer(conversationId: string, seconds: number): Promise<void> {
  if (!pb) return;
  await pb.collection('conversations').update(conversationId, { disappearTimer: Math.max(0, Math.round(seconds)) });
}

/** Pin (or, with an empty id, unpin) a message for everyone in a conversation. */
export async function setPinnedMessage(conversationId: string, messageId: string): Promise<void> {
  if (!pb) return;
  await pb.collection('conversations').update(conversationId, { pinnedMessage: messageId });
}

/** Delete (unsend) a message. Only the author may; realtime removes it for everyone. */
export async function deleteMessage(id: string): Promise<boolean> {
  if (!pb || !pb.authStore.isValid) return false;
  try {
    await pb.collection('messages').delete(id);
    return true;
  } catch {
    return false;
  }
}

// --- blocking & reporting (safety) ----------------------------------------

/** The ids the signed-in user has blocked. */
export function blockedIds(): string[] {
  const r = pb?.authStore.record;
  const list = r?.blocked;
  return Array.isArray(list) ? (list as string[]) : [];
}

export function isBlocked(userId: string): boolean {
  return blockedIds().includes(userId);
}

/** Block or unblock a person. Persists on the current user's record. */
async function setBlocked(userId: string, blocked: boolean): Promise<void> {
  if (!pb || !pb.authStore.record) return;
  const me = pb.authStore.record.id;
  const next = blocked
    ? Array.from(new Set([...blockedIds(), userId]))
    : blockedIds().filter((x) => x !== userId);
  await pb.collection('users').update(me, { blocked: next });
  await pb.collection('users').authRefresh();
}

export function blockUser(userId: string): Promise<void> {
  return setBlocked(userId, true);
}
export function unblockUser(userId: string): Promise<void> {
  return setBlocked(userId, false);
}

/** File a report about a person (goes to the admins, not visible in-app). */
export async function reportUser(input: {
  reportedUserId: string;
  conversationId?: string;
  reason?: string;
}): Promise<boolean> {
  if (!pb || !pb.authStore.record) return false;
  try {
    await pb.collection('reports').create({
      reporter: pb.authStore.record.id,
      reportedUser: input.reportedUserId,
      conversation: input.conversationId,
      reason: (input.reason ?? '').slice(0, 1000),
    });
    return true;
  } catch {
    return false;
  }
}

// --- password reset -------------------------------------------------------

/** Send a password-reset email (requires SMTP configured in PocketBase). */
export async function requestPasswordReset(email: string): Promise<void> {
  if (!pb) throw new Error('Not connected to a server.');
  await pb.collection('users').requestPasswordReset(email.trim());
}

/** Subscribe to new/changed/deleted messages in the user's conversations. */
export async function subscribeMessages(
  onChange: (message: Message) => void,
  onDelete?: (id: string) => void
): Promise<() => void> {
  if (!pb || !pb.authStore.isValid || typeof globalThis.EventSource === 'undefined') return () => {};
  const meId = currentUserId();
  try {
    await pb.collection('messages').subscribe('*', (e) => {
      if (e.action === 'create' || e.action === 'update') {
        const rec = e.record;
        if (rec.enc) {
          decryptMessage(rec).then((d) => onChange({ ...toMessage(rec, meId), text: d.text, mediaKey: d.mediaKey }));
        } else {
          onChange(toMessage(rec, meId));
        }
      } else if (e.action === 'delete') {
        onDelete?.(e.record.id);
      }
    });
    return () => {
      pb.collection('messages').unsubscribe('*').catch(() => {});
    };
  } catch {
    return () => {};
  }
}

// --- reactions ------------------------------------------------------------

export type Reaction = { id: string; messageId: string; userId: string; emoji: string };

export async function fetchReactions(conversationId: string): Promise<Reaction[]> {
  if (!pb || !pb.authStore.isValid) return [];
  try {
    const rows = await pb.collection('reactions').getFullList({
      filter: pb.filter('message.conversation = {:c}', { c: conversationId }),
    });
    return rows.map((r) => ({ id: r.id, messageId: r.message as string, userId: r.user as string, emoji: r.emoji as string }));
  } catch {
    return [];
  }
}

/** Toggle the current user's reaction on a message. */
export async function setReaction(messageId: string, emoji: string, existing?: Reaction): Promise<void> {
  if (!pb || !pb.authStore.record) return;
  try {
    if (existing) {
      if (existing.emoji === emoji) await pb.collection('reactions').delete(existing.id);
      else await pb.collection('reactions').update(existing.id, { emoji });
    } else {
      await pb.collection('reactions').create({ message: messageId, user: pb.authStore.record.id, emoji });
    }
  } catch {
    // best-effort
  }
}

// --- read receipts --------------------------------------------------------

export type Read = { userId: string; at: number };

export async function fetchReads(conversationId: string): Promise<Read[]> {
  if (!pb || !pb.authStore.isValid) return [];
  try {
    const rows = await pb.collection('reads').getFullList({
      filter: pb.filter('conversation = {:c}', { c: conversationId }),
    });
    return rows.map((r) => ({ userId: r.user as string, at: r.lastReadAt ? Date.parse(r.lastReadAt as string) : 0 }));
  } catch {
    return [];
  }
}

/** Record that the current user has read a conversation up to now (server-side, for "Seen"). */
export async function markConversationRead(conversationId: string): Promise<void> {
  if (!pb || !pb.authStore.record) return;
  const me = pb.authStore.record.id;
  const now = new Date().toISOString();
  try {
    const existing = await pb
      .collection('reads')
      .getFirstListItem(pb.filter('conversation = {:c} && user = {:u}', { c: conversationId, u: me }));
    await pb.collection('reads').update(existing.id, { lastReadAt: now });
  } catch {
    try {
      await pb.collection('reads').create({ conversation: conversationId, user: me, lastReadAt: now });
    } catch {
      // best-effort
    }
  }
}

export type Typing = { userId: string; at: number };

/** Who is currently typing in a conversation (raw rows; the caller decides
 *  how recent counts as "still typing"). Excludes the current user. */
export async function fetchTyping(conversationId: string): Promise<Typing[]> {
  if (!pb || !pb.authStore.record) return [];
  const me = pb.authStore.record.id;
  try {
    const rows = await pb.collection('typing').getFullList({
      filter: pb.filter('conversation = {:c}', { c: conversationId }),
    });
    return rows
      .filter((r) => r.user !== me)
      .map((r) => ({ userId: r.user as string, at: r.updated ? Date.parse(r.updated as string) : 0 }));
  } catch {
    return [];
  }
}

/** Signal that the current user is typing in a conversation (upsert, bumps the
 *  row's updated time). Callers should throttle this. */
export async function pingTyping(conversationId: string): Promise<void> {
  if (!pb || !pb.authStore.record) return;
  const me = pb.authStore.record.id;
  try {
    const existing = await pb
      .collection('typing')
      .getFirstListItem(pb.filter('conversation = {:c} && user = {:u}', { c: conversationId, u: me }));
    // A no-op field write still bumps the autodate `updated` column.
    await pb.collection('typing').update(existing.id, { user: me });
  } catch {
    try {
      await pb.collection('typing').create({ conversation: conversationId, user: me });
    } catch {
      // best-effort
    }
  }
}

/** Subscribe to a collection's changes (reactions / reads), calling back on any event. */
export async function subscribeCollection(collection: string, onChange: () => void): Promise<() => void> {
  if (!pb || !pb.authStore.isValid || typeof globalThis.EventSource === 'undefined') return () => {};
  try {
    await pb.collection(collection).subscribe('*', () => onChange());
    return () => {
      pb.collection(collection).unsubscribe('*').catch(() => {});
    };
  } catch {
    return () => {};
  }
}

// --- presence -------------------------------------------------------------

/** Update the current user's "last seen" timestamp (call periodically while active). */
export async function heartbeat(): Promise<void> {
  if (!pb || !pb.authStore.record) return;
  try {
    await pb.collection('users').update(pb.authStore.record.id, { lastSeen: new Date().toISOString() });
  } catch {
    // best-effort
  }
}

// --- calls (ring signaling) -----------------------------------------------

export type CallMode = 'voice' | 'video';
export type IncomingCall = { id: string; conversationId: string; callerId: string; mode: CallMode; at: number };

/** Ring the other members of a conversation. */
export async function startCall(conversationId: string, mode: CallMode): Promise<void> {
  if (!pb || !pb.authStore.record) return;
  try {
    await pb.collection('calls').create({
      conversation: conversationId,
      caller: pb.authStore.record.id,
      mode,
      status: 'ringing',
    });
  } catch {
    // best-effort; the call screen still opens
  }
}

export async function respondCall(callId: string, status: 'accepted' | 'declined' | 'ended'): Promise<void> {
  if (!pb) return;
  try {
    await pb.collection('calls').update(callId, { status });
  } catch {
    // best-effort
  }
}

/** Subscribe to incoming calls (ringing, from someone else, within the last 30s). */
export async function subscribeCalls(onCall: (c: IncomingCall) => void): Promise<() => void> {
  if (!pb || !pb.authStore.isValid || typeof globalThis.EventSource === 'undefined') return () => {};
  const me = currentUserId();
  try {
    await pb.collection('calls').subscribe('*', (e) => {
      if (e.action !== 'create') return;
      const r = e.record;
      if (r.status !== 'ringing' || r.caller === me) return;
      const at = r.created ? Date.parse(r.created as string) : Date.now();
      if (Date.now() - at > 30000) return;
      onCall({
        id: r.id,
        conversationId: r.conversation as string,
        callerId: r.caller as string,
        mode: (r.mode as string) === 'video' ? 'video' : 'voice',
        at,
      });
    });
    return () => {
      pb.collection('calls').unsubscribe('*').catch(() => {});
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
