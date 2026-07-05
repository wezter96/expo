import PocketBase, { type RecordModel } from 'pocketbase';
import type { AgentResult } from '../ai/agent';
import type { Contact, Message } from '../types';

/**
 * PocketBase backend for Kinly (apps/pocketbase).
 *
 * PocketBase is a single open-source Go binary that bundles auth, a realtime
 * database, file storage and JS hooks — which keeps hosting dirt cheap (a $5
 * VPS), the target for the $4.99 / 10-member plan.
 *
 * The server URL comes from EXPO_PUBLIC_PB_URL. When it is unset the app runs
 * fully offline against its local AsyncStorage store, so every call here is
 * best-effort and callers fall back gracefully.
 */
const PB_URL = process.env.EXPO_PUBLIC_PB_URL;

export const pb = PB_URL ? new PocketBase(PB_URL) : null;

export function serverEnabled(): boolean {
  return !!PB_URL;
}

// --- record → app-type mappers -------------------------------------------

function toContact(r: RecordModel): Contact {
  return {
    id: r.id,
    name: r.title as string,
    relation: (r.relation as string) ?? '',
    phone: (r.phone as string) ?? '',
    isGroup: !!r.isGroup,
    memberNames: Array.isArray(r.memberNames) ? (r.memberNames as string[]) : undefined,
  };
}

function toMessage(r: RecordModel): Message {
  return {
    id: r.id,
    contactId: r.conversation as string,
    text: r.text as string,
    mine: !!r.mine,
    // PocketBase stores an ISO string in `created`; the app works in epoch millis.
    at: r.created ? Date.parse(r.created as string) : Date.now(),
  };
}

// --- reads ----------------------------------------------------------------

/** Load all conversations (contacts + groups), or null if unavailable. */
export async function fetchContacts(): Promise<Contact[] | null> {
  if (!pb) return null;
  try {
    const rows = await pb.collection('conversations').getFullList({ sort: 'created' });
    return rows.map(toContact);
  } catch {
    return null;
  }
}

/** Load messages for one conversation, oldest first, or null if unavailable. */
export async function fetchMessages(contactId: string): Promise<Message[] | null> {
  if (!pb) return null;
  try {
    const rows = await pb.collection('messages').getFullList({
      filter: pb.filter('conversation = {:id}', { id: contactId }),
      sort: 'created',
    });
    return rows.map(toMessage);
  } catch {
    return null;
  }
}

// --- writes ---------------------------------------------------------------

/** Persist a sent message (best-effort). */
export async function pushMessage(contactId: string, text: string): Promise<void> {
  if (!pb) return;
  try {
    await pb.collection('messages').create({ conversation: contactId, text: text.trim(), mine: true });
  } catch {
    // offline — the local store already holds the message
  }
}

// --- realtime -------------------------------------------------------------

/**
 * Subscribe to new/changed messages across all conversations. Returns an
 * unsubscribe function (a no-op when realtime is unavailable).
 *
 * Note: PocketBase realtime uses Server-Sent Events. On a real device this
 * needs an EventSource polyfill (e.g. `react-native-sse`); on web it works out
 * of the box. We guard it so a missing EventSource never breaks the app.
 */
export async function subscribeMessages(onChange: (message: Message) => void): Promise<() => void> {
  if (!pb || typeof globalThis.EventSource === 'undefined') return () => {};
  try {
    await pb.collection('messages').subscribe('*', (e) => {
      if (e.action === 'create' || e.action === 'update') onChange(toMessage(e.record));
    });
    return () => {
      pb.collection('messages').unsubscribe('*').catch(() => {});
    };
  } catch {
    return () => {};
  }
}

// --- assistant (server-side AI hook) --------------------------------------

/**
 * Ask the server-side assistant (a PocketBase JS hook at /api/kinly/assistant).
 * Keeps any Anthropic key on the server. Returns null if unavailable so the
 * caller can fall back to on-device parsing.
 */
export async function askServerAssistant(text: string): Promise<AgentResult | null> {
  if (!pb) return null;
  try {
    return await pb.send('/api/kinly/assistant', {
      method: 'POST',
      body: { text },
    });
  } catch {
    return null;
  }
}
