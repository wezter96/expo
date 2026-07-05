import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { loadStoredAuth, pb, serverEnabled } from '../api/pocketbase';

export type KinlyUser = { id: string; name: string; email: string; phone: string };

type AuthValue = {
  ready: boolean;
  /** true when a server is configured but nobody is signed in — show the auth screen. */
  needsAuth: boolean;
  user: KinlyUser | null;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (input: { name: string; phone: string; email: string; password: string }) => Promise<void>;
  signOut: () => void;
};

const AuthContext = createContext<AuthValue | null>(null);

function readUser(): KinlyUser | null {
  const r = pb?.authStore.record;
  if (!r) return null;
  return {
    id: r.id,
    name: (r.name as string) ?? '',
    email: (r.email as string) ?? '',
    phone: (r.phone as string) ?? '',
  };
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(!serverEnabled()); // no server → nothing to load
  const [user, setUser] = useState<KinlyUser | null>(null);

  useEffect(() => {
    if (!serverEnabled() || !pb) return;
    let active = true;
    (async () => {
      await loadStoredAuth();
      if (pb.authStore.isValid) {
        try {
          await pb.collection('users').authRefresh();
        } catch {
          pb.authStore.clear();
        }
      }
      if (active) {
        setUser(readUser());
        setReady(true);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    if (!pb) throw new Error('No server configured.');
    await pb.collection('users').authWithPassword(email.trim(), password);
    setUser(readUser());
  }, []);

  const signUp = useCallback(
    async ({ name, phone, email, password }: { name: string; phone: string; email: string; password: string }) => {
      if (!pb) throw new Error('No server configured.');
      await pb.collection('users').create({
        name: name.trim(),
        phone: phone.trim(),
        email: email.trim(),
        password,
        passwordConfirm: password,
      });
      await pb.collection('users').authWithPassword(email.trim(), password);
      setUser(readUser());
    },
    []
  );

  const signOut = useCallback(() => {
    pb?.authStore.clear();
    setUser(null);
  }, []);

  const value = useMemo<AuthValue>(
    () => ({
      ready,
      needsAuth: serverEnabled() && !user,
      user,
      signIn,
      signUp,
      signOut,
    }),
    [ready, user, signIn, signUp, signOut]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
