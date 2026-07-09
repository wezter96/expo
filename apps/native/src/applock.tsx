import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import * as LocalAuthentication from 'expo-local-authentication';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { radius, spacing, TAP_TARGET } from './theme';
import { useTheme } from './theme-context';

/**
 * Optional app lock: requires the device's biometric / passcode to open Kinly.
 * Local-only (nothing leaves the device); re-locks whenever the app is
 * backgrounded. On web / devices without biometrics it's simply unavailable.
 */
const KEY = 'kinly.applock.v1';
const supported = Platform.OS !== 'web';

type AppLockValue = {
  ready: boolean;
  enabled: boolean;
  locked: boolean;
  /** Device can authenticate (has hardware + an enrolled biometric/passcode). */
  available: boolean;
  setEnabled: (on: boolean) => Promise<boolean>;
  unlock: () => Promise<void>;
};

const Ctx = createContext<AppLockValue | null>(null);

export function AppLockProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [enabled, setEnabledState] = useState(false);
  const [available, setAvailable] = useState(false);
  const [locked, setLocked] = useState(false);
  const enabledRef = useRef(false);

  useEffect(() => {
    (async () => {
      if (supported) {
        try {
          const hw = await LocalAuthentication.hasHardwareAsync();
          const enrolled = await LocalAuthentication.isEnrolledAsync();
          setAvailable(hw && enrolled);
        } catch {
          setAvailable(false);
        }
        try {
          const on = (await AsyncStorage.getItem(KEY)) === 'on';
          setEnabledState(on);
          enabledRef.current = on;
          setLocked(on); // lock on cold start when enabled
        } catch {
          // ignore
        }
      }
      setReady(true);
    })();
  }, []);

  // Re-lock as soon as the app leaves the foreground.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => {
      if ((s === 'background' || s === 'inactive') && enabledRef.current) setLocked(true);
    });
    return () => sub.remove();
  }, []);

  const unlock = useCallback(async () => {
    try {
      const res = await LocalAuthentication.authenticateAsync({
        promptMessage: 'Unlock Kinly',
        fallbackLabel: 'Use passcode',
      });
      if (res.success) setLocked(false);
    } catch {
      // user can retry with the Unlock button
    }
  }, []);

  const setEnabled = useCallback(async (on: boolean) => {
    if (on) {
      try {
        const res = await LocalAuthentication.authenticateAsync({ promptMessage: 'Turn on app lock' });
        if (!res.success) return false;
      } catch {
        return false;
      }
    }
    setEnabledState(on);
    enabledRef.current = on;
    await AsyncStorage.setItem(KEY, on ? 'on' : 'off').catch(() => {});
    if (!on) setLocked(false);
    return true;
  }, []);

  const value = useMemo<AppLockValue>(
    () => ({ ready, enabled, locked: enabled && locked, available, setEnabled, unlock }),
    [ready, enabled, locked, available, setEnabled, unlock]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAppLock(): AppLockValue {
  const c = useContext(Ctx);
  if (!c) throw new Error('useAppLock must be used inside <AppLockProvider>');
  return c;
}

/** Full-screen cover shown while the app is locked. */
export function LockOverlay() {
  const { locked, unlock } = useAppLock();
  const { colors, fonts } = useTheme();
  const styles = useMemo(() => makeStyles(colors, fonts), [colors, fonts]);

  useEffect(() => {
    if (locked) void unlock();
  }, [locked, unlock]);

  if (!locked) return null;
  return (
    <View style={styles.cover}>
      <Ionicons name="lock-closed" size={64} color={colors.primary} />
      <Text style={styles.title}>Kinly is locked</Text>
      <Text style={styles.sub}>Unlock with your Face ID, fingerprint, or passcode.</Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Unlock Kinly"
        onPress={unlock}
        style={({ pressed }) => [styles.btn, pressed && { opacity: 0.85 }]}
      >
        <Text style={styles.btnText}>Unlock</Text>
      </Pressable>
    </View>
  );
}

function makeStyles(colors: ReturnType<typeof useTheme>['colors'], fonts: ReturnType<typeof useTheme>['fonts']) {
  return StyleSheet.create({
    cover: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: colors.background,
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.md,
      padding: spacing.lg,
      zIndex: 1000,
    },
    title: { fontSize: fonts.title, fontWeight: '800', color: colors.text },
    sub: { fontSize: fonts.body, color: colors.textMuted, textAlign: 'center' },
    btn: {
      minHeight: TAP_TARGET,
      paddingHorizontal: spacing.xl,
      borderRadius: radius.lg,
      backgroundColor: colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: spacing.sm,
    },
    btnText: { fontSize: fonts.button, fontWeight: '800', color: colors.textOnDark },
  });
}
