import type { AppRouter } from '@kinly/api/routers/index';
import { createTRPCClient, httpBatchLink } from '@trpc/client';
import type { AgentResult } from '../ai/agent';
import type { Contact, Message } from '../types';

/**
 * Type-safe tRPC client for the Kinly backend (apps/server).
 *
 * The server URL comes from EXPO_PUBLIC_SERVER_URL. When it is not set, the
 * app runs fully offline against its local AsyncStorage store — every call
 * here is best-effort and callers fall back gracefully. Because we only
 * `import type { AppRouter }`, no server code is ever bundled into the app;
 * we just get end-to-end type safety over plain HTTP.
 */
const SERVER_URL = process.env.EXPO_PUBLIC_SERVER_URL;

export function serverEnabled(): boolean {
  return !!SERVER_URL;
}

export const trpc = SERVER_URL
  ? createTRPCClient<AppRouter>({
      links: [httpBatchLink({ url: `${SERVER_URL}/trpc` })],
    })
  : null;

/** Row shapes coming back from the server use snake_case-free camelCase already. */
function toContact(row: {
  id: string;
  name: string;
  relation: string;
  phone: string;
  isGroup: boolean;
  memberNames: string | null;
}): Contact {
  return {
    id: row.id,
    name: row.name,
    relation: row.relation,
    phone: row.phone,
    isGroup: row.isGroup,
    memberNames: row.memberNames ? (JSON.parse(row.memberNames) as string[]) : undefined,
  };
}

function toMessage(row: { id: string; contactId: string; text: string; mine: boolean; at: number }): Message {
  return { id: row.id, contactId: row.contactId, text: row.text, mine: row.mine, at: row.at };
}

/** Load all contacts from the server, or null if unavailable. */
export async function fetchContacts(): Promise<Contact[] | null> {
  if (!trpc) return null;
  try {
    const rows = await trpc.contacts.list.query();
    return rows.map(toContact);
  } catch {
    return null;
  }
}

/** Load messages for one contact from the server, or null if unavailable. */
export async function fetchMessages(contactId: string): Promise<Message[] | null> {
  if (!trpc) return null;
  try {
    const rows = await trpc.messages.list.query({ contactId });
    return rows.map(toMessage);
  } catch {
    return null;
  }
}

/** Persist a sent message on the server (best-effort). */
export async function pushMessage(contactId: string, text: string): Promise<void> {
  if (!trpc) return;
  try {
    await trpc.messages.send.mutate({ contactId, text });
  } catch {
    // offline — the local store already holds the message
  }
}

/** Ask the server-side assistant. Returns null if unavailable (caller falls back to on-device parsing). */
export async function askServerAssistant(text: string): Promise<AgentResult | null> {
  if (!trpc) return null;
  try {
    return (await trpc.assistant.run.mutate({ text })) as AgentResult;
  } catch {
    return null;
  }
}
