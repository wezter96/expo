import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import {
  blockUser,
  deleteMessage as deleteMessageRemote,
  editMessage as editMessageRemote,
  fetchContacts,
  fetchMessages,
  isBlocked as isBlockedRemote,
  newId,
  pushMessage,
  pushPhoto,
  pushVoice,
  reportUser,
  serverEnabled,
  setDisappearTimer,
  subscribeMessages,
  unblockUser,
} from './api/pocketbase';
import { useAuth } from './auth/AuthContext';
import { seedContacts, seedMessages } from './seed';
import { Contact, Conversation, Message } from './types';

const STORAGE_KEY = 'kinly.state.v1';
const READS_KEY = 'kinly.reads.v1';
const SOS_KEY = 'kinly.sos.v1';
const FAV_KEY = 'kinly.favorites.v1';

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
  sendMessage: (contactId: string, text: string, replyTo?: string) => void;
  /** Edit one of my own text messages. */
  editMessage: (id: string, contactId: string, text: string) => void;
  sendPhoto: (contactId: string, uri: string, caption?: string) => void;
  sendVoice: (contactId: string, uri: string, duration: number) => void;
  /** Retry a message that failed to send. */
  retryMessage: (id: string) => void;
  /** Delete (unsend) one of my own messages for everyone. */
  deleteMessage: (id: string) => void;
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
  /** The designated emergency (SOS) contact id, if any. */
  emergencyId: string | null;
  setEmergency: (contactId: string | null) => void;
  /** Pinned favorites (shown first). */
  isFavorite: (contactId: string) => boolean;
  toggleFavorite: (contactId: string) => void;
  /** Safety: block / unblock / report a person (by their user id). */
  isBlocked: (userId: string) => boolean;
  blockContact: (userId: string) => Promise<void>;
  unblockContact: (userId: string) => Promise<void>;
  reportContact: (input: { reportedUserId: string; conversationId?: string; reason?: string }) => Promise<boolean>;
  /** Disappearing messages: current timer (seconds) and setter for a conversation. */
  disappearTimerFor: (contactId: string) => number;
  setDisappearing: (contactId: string, seconds: number) => Promise<void>;
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
  // Live view of messages for callbacks that shouldn't re-bind on every change.
  const messagesRef = useRef(state.messages);
  messagesRef.current = state.messages;
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

  // Designated emergency (SOS) contact.
  const [emergencyId, setEmergencyIdState] = useState<string | null>(null);
  useEffect(() => {
    AsyncStorage.getItem(SOS_KEY)
      .then((v) => v && setEmergencyIdState(v))
      .catch(() => {});
  }, []);
  const setEmergency = useCallback((contactId: string | null) => {
    setEmergencyIdState(contactId);
    if (contactId) AsyncStorage.setItem(SOS_KEY, contactId).catch(() => {});
    else AsyncStorage.removeItem(SOS_KEY).catch(() => {});
  }, []);

  // Favorites (pinned to the top of Messages).
  const [favorites, setFavorites] = useState<string[]>([]);
  useEffect(() => {
    AsyncStorage.getItem(FAV_KEY)
      .then((v) => v && setFavorites(JSON.parse(v)))
      .catch(() => {});
  }, []);
  const isFavorite = useCallback((contactId: string) => favorites.includes(contactId), [favorites]);
  const toggleFavorite = useCallback((contactId: string) => {
    setFavorites((f) => {
      const next = f.includes(contactId) ? f.filter((x) => x !== contactId) : [...f, contactId];
      AsyncStorage.setItem(FAV_KEY, JSON.stringify(next)).catch(() => {});
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
    subscribeMessages(
      (msg) => {
        setState((s) => {
          if (s.messages.some((m) => m.id === msg.id)) {
            return { ...s, messages: s.messages.map((m) => (m.id === msg.id ? msg : m)) };
          }
          return { ...s, messages: [...s.messages, msg] };
        });
      },
      (deletedId) => {
        setState((s) => ({ ...s, messages: s.messages.filter((m) => m.id !== deletedId) }));
      }
    ).then((fn) => {
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
    (contactId: string) => {
      const timer = state.contacts.find((c) => c.id === contactId)?.disappearTimer ?? 0;
      // Hide messages past the disappearing timer immediately (the server cron
      // deletes them for good shortly after).
      const cutoff = timer > 0 ? Date.now() - timer * 1000 : 0;
      return state.messages
        .filter((m) => m.contactId === contactId && (!cutoff || m.at >= cutoff))
        .sort((a, b) => a.at - b.at);
    },
    [state.messages, state.contacts]
  );

  const disappearTimerFor = useCallback(
    (contactId: string) => state.contacts.find((c) => c.id === contactId)?.disappearTimer ?? 0,
    [state.contacts]
  );

  const setDisappearing = useCallback(
    async (contactId: string, seconds: number) => {
      // Optimistically reflect the new timer, then persist + refresh.
      setState((s) => ({
        ...s,
        contacts: s.contacts.map((c) => (c.id === contactId ? { ...c, disappearTimer: seconds } : c)),
      }));
      if (online && uid) {
        await setDisappearTimer(contactId, seconds);
        await hydrateFromServer();
      }
    },
    [online, uid, hydrateFromServer]
  );

  // Add a message to the local store (accepts an explicit id so an optimistic
  // send and its realtime echo share the same id and dedupe).
  const addLocal = useCallback(
    (contactId: string, partial: Partial<Message> & { mine: boolean }): Message => {
      const { id: pid, ...rest } = partial;
      const msg: Message = {
        id: pid ?? nextId('m'),
        contactId,
        text: '',
        kind: 'text',
        at: Date.now(),
        authorId: uid ?? 'me',
        ...rest,
      };
      setState((s) => ({ ...s, messages: [...s.messages, msg] }));
      return msg;
    },
    [uid]
  );

  const setMessageStatus = useCallback((id: string, status: Message['status']) => {
    setState((s) => ({ ...s, messages: s.messages.map((m) => (m.id === id ? { ...m, status } : m)) }));
  }, []);

  // Optimistic send: add the message immediately (so it appears instantly),
  // then push to the server. On failure it's marked "failed" (tap to retry).
  // Online: a client id is used so the realtime echo replaces the optimistic
  // copy by id. Offline: it just lives in the local store.
  const dispatchSend = useCallback(
    (contactId: string, partial: Partial<Message>, push: (id: string) => Promise<boolean>) => {
      const wired = online && uid;
      const id = wired ? newId() : nextId('m');
      addLocal(contactId, { ...partial, id, mine: true, status: wired ? 'sending' : undefined });
      if (wired) {
        push(id).then((ok) => {
          if (!ok) setMessageStatus(id, 'failed');
        });
      }
    },
    [online, uid, addLocal, setMessageStatus]
  );

  const sendMessage = useCallback(
    (contactId: string, text: string, replyTo?: string) => {
      const body = text.trim();
      dispatchSend(contactId, { text: body, kind: 'text', replyTo }, (id) => pushMessage(id, contactId, body, replyTo));
    },
    [dispatchSend]
  );

  const editMessage = useCallback(
    (id: string, contactId: string, text: string) => {
      const body = text.trim();
      setState((s) => ({ ...s, messages: s.messages.map((m) => (m.id === id ? { ...m, text: body, edited: true } : m)) }));
      if (online && uid) {
        editMessageRemote(id, contactId, body).then((ok) => {
          if (!ok) void hydrateFromServer();
        });
      }
    },
    [online, uid, hydrateFromServer]
  );

  const sendPhoto = useCallback(
    (contactId: string, uri: string, caption = '') => {
      dispatchSend(contactId, { text: caption, kind: 'photo', imageUrl: uri }, (id) =>
        pushPhoto(id, contactId, uri, caption)
      );
    },
    [dispatchSend]
  );

  const sendVoice = useCallback(
    (contactId: string, uri: string, duration: number) => {
      dispatchSend(contactId, { kind: 'voice', audioUrl: uri, duration }, (id) =>
        pushVoice(id, contactId, uri, duration)
      );
    },
    [dispatchSend]
  );

  const retryMessage = useCallback(
    (id: string) => {
      if (!(online && uid)) return;
      const m = messagesRef.current.find((x) => x.id === id);
      if (!m) return;
      setMessageStatus(id, 'sending');
      const push =
        m.kind === 'photo' && m.imageUrl
          ? pushPhoto(id, m.contactId, m.imageUrl, m.text)
          : m.kind === 'voice' && m.audioUrl
            ? pushVoice(id, m.contactId, m.audioUrl, m.duration ?? 0)
            : pushMessage(id, m.contactId, m.text);
      push.then((ok) => {
        if (!ok) setMessageStatus(id, 'failed');
      });
    },
    [online, uid, setMessageStatus]
  );

  // Unsend: remove locally right away, then delete on the server. If the
  // server delete fails, re-pull so the message reappears.
  const deleteMessage = useCallback(
    (id: string) => {
      setState((s) => ({ ...s, messages: s.messages.filter((m) => m.id !== id) }));
      if (online && uid) {
        deleteMessageRemote(id).then((ok) => {
          if (!ok) void hydrateFromServer();
        });
      }
    },
    [online, uid, hydrateFromServer]
  );

  const isBlocked = useCallback((userId: string) => (online ? isBlockedRemote(userId) : false), [online]);

  const [, forceTick] = useState(0);
  const blockContact = useCallback(
    async (userId: string) => {
      await blockUser(userId);
      forceTick((n) => n + 1); // reflect the new blocked state
      await refresh();
    },
    [refresh]
  );
  const unblockContact = useCallback(
    async (userId: string) => {
      await unblockUser(userId);
      forceTick((n) => n + 1);
      await refresh();
    },
    [refresh]
  );
  const reportContact = useCallback(
    (input: { reportedUserId: string; conversationId?: string; reason?: string }) => reportUser(input),
    []
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
      .sort((a, b) => {
        const fa = favorites.includes(a.contact.id) ? 1 : 0;
        const fb = favorites.includes(b.contact.id) ? 1 : 0;
        if (fa !== fb) return fb - fa; // favorites first
        return b.lastAt - a.lastAt;
      });
  }, [state.contacts, state.messages, favorites]);

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
    editMessage,
    sendPhoto,
    sendVoice,
    retryMessage,
    deleteMessage,
    receiveMessage,
    refresh,
    unreadCount,
    totalUnread,
    markRead,
    emergencyId,
    setEmergency,
    isFavorite,
    toggleFavorite,
    isBlocked,
    blockContact,
    unblockContact,
    reportContact,
    disappearTimerFor,
    setDisappearing,
  };

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore(): Store {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error('useStore must be used inside <StoreProvider>');
  return ctx;
}
