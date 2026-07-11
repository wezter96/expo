import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect } from 'react';
import { fetchMyPrefs, serverEnabled } from '../api/pocketbase';
import { useAuth } from '../auth/AuthContext';
import { type ThemeMode, useTheme } from '../theme-context';
import { type TextSize } from '../theme';

const APPLIED_KEY = 'kinly.prefsApplied.v1';

/**
 * Applies server-synced display prefs (a guardian may have adjusted them
 * remotely). Only prefs newer than the last stamp we applied win, so a local
 * change made after the guardian's is never clobbered. Renders nothing.
 */
export function RemotePrefsSync() {
  const { user } = useAuth();
  const { setTextSize, setMode } = useTheme();

  useEffect(() => {
    if (!user || !serverEnabled()) return;
    let active = true;
    (async () => {
      const prefs = await fetchMyPrefs();
      if (!active || !prefs?.updatedAt) return;
      const applied = (await AsyncStorage.getItem(APPLIED_KEY).catch(() => null)) ?? '';
      if (prefs.updatedAt <= applied) return;
      if (prefs.textSize && ['normal', 'large', 'xlarge'].includes(prefs.textSize)) {
        setTextSize(prefs.textSize as TextSize);
      }
      if (prefs.mode && ['light', 'dark', 'auto'].includes(prefs.mode)) {
        setMode(prefs.mode as ThemeMode);
      }
      await AsyncStorage.setItem(APPLIED_KEY, prefs.updatedAt).catch(() => {});
    })();
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  return null;
}
