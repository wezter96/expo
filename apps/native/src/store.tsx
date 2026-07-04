import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { fetchContacts, fetchMessages, pushMessage } from './api/client';
import { seedContacts, seedMessages } from './seed';
import { Contact, Conversation, Message } from './types';

const STORAGE_KEY = 'kinly.state.v1';

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
  sendMessage: (contactId: string, text: string) => Message;
  /** Simulate an incoming reply (used to make the demo feel alive). */
  receiveMessage: (contactId: string, text: string) => Message;
};

const StoreContext = createContext<Store | null>(null);

let counter = 0;
function nextId(prefix: string): string {
  counter += 1;
  return `${prefix}_${Date.now().toString(36)}_${counter}`;
}

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<State>({ contacts: [], messages: [] });
  const [ready, setReady] = useState(false);

  // Load persisted state (or seed on first run).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        if (raw) {
          const parsed = JSON.parse(raw) as State;
          if (!cancelled) setState(parsed);
        } else {
          const seeded = { contacts: seedContacts, messages: seedMessages };
          if (!cancelled) setState(seeded);
          await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(seeded));
        }

        // If a Kinly server is configured, hydrate from it (source of truth).
        // Any failure leaves the local data in place — the app stays usable offline.
        const remoteContacts = await fetchContacts();
        if (remoteContacts && remoteContacts.length && !cancelled) {
          const all: Message[] = [];
          for (const c of remoteContacts) {
            const ms = await fetchMessages(c.id);
            if (ms) all.push(...ms);
          }
          if (!cancelled) setState({ contacts: remoteContacts, messages: all });
        }
      } catch {
        if (!cancelled) setState({ contacts: seedContacts, messages: seedMessages });
      } finally {
        if (!cancelled) setReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Persist on every change (after initial load).
  useEffect(() => {
    if (!ready) return;
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(state)).catch(() => {});
  }, [state, ready]);

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

  const addMessage = useCallback((contactId: string, text: string, mine: boolean): Message => {
    const msg: Message = { id: nextId('m'), contactId, text: text.trim(), mine, at: Date.now() };
    setState((s) => ({ ...s, messages: [...s.messages, msg] }));
    return msg;
  }, []);

  const sendMessage = useCallback(
    (contactId: string, text: string) => {
      const msg = addMessage(contactId, text, true);
      void pushMessage(contactId, text); // best-effort sync; no-op when offline
      return msg;
    },
    [addMessage]
  );
  const receiveMessage = useCallback((contactId: string, text: string) => addMessage(contactId, text, false), [addMessage]);

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

  const value: Store = {
    ready,
    contacts: state.contacts,
    conversations,
    getContact,
    findContact,
    messagesFor,
    sendMessage,
    receiveMessage,
  };

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore(): Store {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error('useStore must be used inside <StoreProvider>');
  return ctx;
}
