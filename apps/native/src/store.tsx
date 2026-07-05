import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import {
  fetchContacts,
  fetchMessages,
  pushMessage,
  pushPhoto,
  pushVoice,
  serverEnabled,
  subscribeMessages,
} from './api/pocketbase';
import { useAuth } from './auth/AuthContext';
import { seedContacts, seedMessages } from './seed';
import { Contact, Conversation, Message } from './types';

const STORAGE_KEY = 'kinly.state.v1';
const READS_KEY = 'kinly.reads.v1';

type State = {
  contacts: Contact[];
  messages: Message[];
};

type Store = {
  ready: boolean;
  contacts: Contact[];
  conversations: Conversation[];
  getContact: (id: string) => Contact | undefined;
  findContact: (query: string) => Contact | undefined;
  messagesFor: (contactId: string) => Message[];
  sendMessage: (contactId: string, text: string) => void;
  sendPhoto: (contactId: string, uri: string, caption?: string) => void;
  sendVoice: (contactId: string, uri: string, duration: number) => void;
  /** Simulate an incoming reply (used to make the demo feel alive). */
  receiveMessage: (contactId: string, text: string) => Message;
  /** Re-pull conversations & messages from the server (after adding a person/group). */
  refresh: () => Promise<void>;
  /** Number of unread (received) messages in a conversation. */
  unreadCount: (contactId: string) => number;
  /** Total unread across all conversations. */
  totalUnread: number;
  /** Mark a conversation as read up to now. */
  markRead: (contactId: string) => void;
};

const StoreContext = createContext<Store | null>(null);

let counter = 0;
function nextId(prefix: string): string {
  counter += 1;
  return `${prefix}_${Date.now().toString(36)}_${counter}`;
}

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const uid = user?.id ?? null;
  const online = serverEnabled();

  const [state, setState] = useState<State>({ contacts: [], messages: [] });
  const [ready, setReady] = useState(false);
  // Per-conversation "read up to" timestamps (epoch millis), persisted locally.
  const [reads, setReads] = useState<Record<string, number>>({});

  useEffect(() => {
    AsyncStorage.getItem(READS_KEY)
      .then((raw) => raw && setReads(JSON.parse(raw)))
      .catch(() => {});
  }, []);

  const markRead = useCallback((contactId: string) => {
    setReads((r) => {
      const next = { ...r, [contactId]: Date.now() };
      AsyncStorage.setItem(READS_KEY, JSON.stringify(next)).catch(() => {});
      return next;
    });
  }, []);

  // Pull the full picture from the server (contacts + their messages).
  const hydrateFromServer = useCallback(async (): Promise<boolean> => {
    const remoteContacts = await fetchContacts();
    if (!remoteContacts) return false;
    const all: Message[] = [];
    for (const c of remoteContacts) {
      const ms = await fetchMessages(c.id);
      if (ms) all.push(...ms);
    }
    setState({ contacts: remoteContacts, messages: all });
    return true;
  }, []);

  const refresh = useCallback(async () => {
    if (online && uid) await hydrateFromServer();
  }, [online, uid, hydrateFromServer]);

  // Load data. Re-runs when the signed-in user changes (login / logout).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (online) {
          // Real backend: the server is the source of truth (no local demo data).
          if (uid) {
            await hydrateFromServer();
          } else if (!cancelled) {
            setState({ contacts: [], messages: [] });
          }
        } else {
          // Offline demo: local sample data, persisted on the device.
          const raw = await AsyncStorage.getItem(STORAGE_KEY);
          if (raw) {
            if (!cancelled) setState(JSON.parse(raw) as State);
          } else {
            const seeded = { contacts: seedContacts, messages: seedMessages };
            if (!cancelled) setState(seeded);
            await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(seeded));
          }
        }
      } catch {
        if (!cancelled && !online) setState({ contacts: seedContacts, messages: seedMessages });
      } finally {
        if (!cancelled) setReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [online, uid, hydrateFromServer]);

  // Persist offline demo data on every change.
  useEffect(() => {
    if (!ready || online) return;
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(state)).catch(() => {});
  }, [state, ready, online]);

  // Live updates: when signed in, new messages stream in over PocketBase
  // realtime and are merged in (deduped by id).
  useEffect(() => {
    if (!ready || !online || !uid) return;
    let unsub = () => {};
    let active = true;
    subscribeMessages((msg) => {
      setState((s) => {
        if (s.messages.some((m) => m.id === msg.id)) {
          return { ...s, messages: s.messages.map((m) => (m.id === msg.id ? msg : m)) };
        }
        return { ...s, messages: [...s.messages, msg] };
      });
    }).then((fn) => {
      if (active) unsub = fn;
      else fn();
    });
    return () => {
      active = false;
      unsub();
    };
  }, [ready, online, uid]);

  const getContact = useCallback(
    (id: string) => state.contacts.find((c) => c.id === id),
    [state.contacts]
  );

  const findContact = useCallback(
    (query: string) => {
      const q = query.trim().toLowerCase();
      if (!q) return undefined;
      // Exact-ish match first, then first-name / relation contains.
      return (
        state.contacts.find((c) => c.name.toLowerCase() === q) ||
        state.contacts.find((c) => c.name.toLowerCase().startsWith(q)) ||
        state.contacts.find((c) => c.name.toLowerCase().includes(q)) ||
        state.contacts.find((c) => c.relation.toLowerCase() === q) ||
        state.contacts.find((c) => c.relation.toLowerCase().includes(q))
      );
    },
    [state.contacts]
  );

  const messagesFor = useCallback(
    (contactId: string) =>
      state.messages.filter((m) => m.contactId === contactId).sort((a, b) => a.at - b.at),
    [state.messages]
  );

  // Add a message to the local store (offline mode, or an incoming demo message).
  const addLocal = useCallback(
    (contactId: string, partial: Partial<Message> & { mine: boolean }): Message => {
      const msg: Message = {
        id: nextId('m'),
        contactId,
        text: '',
        kind: 'text',
        at: Date.now(),
        authorId: uid ?? 'me',
        ...partial,
      };
      setState((s) => ({ ...s, messages: [...s.messages, msg] }));
      return msg;
    },
    [uid]
  );

  // When online, we DON'T add locally — PocketBase realtime echoes the message
  // back (to the sender too), which avoids duplicates. Offline, we add locally.
  const sendMessage = useCallback(
    (contactId: string, text: string) => {
      if (online && uid) void pushMessage(contactId, text);
      else addLocal(contactId, { text: text.trim(), kind: 'text', mine: true });
    },
    [online, uid, addLocal]
  );

  const sendPhoto = useCallback(
    (contactId: string, uri: string, caption = '') => {
      if (online && uid) void pushPhoto(contactId, uri, caption);
      else addLocal(contactId, { text: caption, kind: 'photo', mine: true, imageUrl: uri });
    },
    [online, uid, addLocal]
  );

  const sendVoice = useCallback(
    (contactId: string, uri: string, duration: number) => {
      if (online && uid) void pushVoice(contactId, uri, duration);
      else addLocal(contactId, { kind: 'voice', mine: true, audioUrl: uri, duration });
    },
    [online, uid, addLocal]
  );

  const receiveMessage = useCallback(
    (contactId: string, text: string) => addLocal(contactId, { text, kind: 'text', mine: false }),
    [addLocal]
  );

  const unreadCount = useCallback(
    (contactId: string) => {
      const since = reads[contactId] ?? 0;
      return state.messages.filter((m) => m.contactId === contactId && !m.mine && m.at > since).length;
    },
    [state.messages, reads]
  );

  const conversations = useMemo<Conversation[]>(() => {
    return state.contacts
      .map((contact) => {
        const messages = state.messages
          .filter((m) => m.contactId === contact.id)
          .sort((a, b) => a.at - b.at);
        const lastAt = messages.length ? messages[messages.length - 1].at : 0;
        return { contact, messages, lastAt };
      })
      .sort((a, b) => b.lastAt - a.lastAt);
  }, [state.contacts, state.messages]);

  const totalUnread = useMemo(
    () => state.contacts.reduce((sum, c) => sum + unreadCount(c.id), 0),
    [state.contacts, unreadCount]
  );

  const value: Store = {
    ready,
    contacts: state.contacts,
    conversations,
    getContact,
    findContact,
    messagesFor,
    sendMessage,
    sendPhoto,
    sendVoice,
    receiveMessage,
    refresh,
    unreadCount,
    totalUnread,
    markRead,
  };

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore(): Store {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error('useStore must be used inside <StoreProvider>');
  return ctx;
}
