import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Local privacy switches. When off, this device simply never sends the
 * corresponding signal — read receipts ("Seen") and typing indicators.
 * Kept in a module-level cache so hot paths (mark-read, typing pings) can
 * check synchronously; loadPrivacyPrefs() hydrates it at app start.
 */
const KEY = 'kinly.privacy.v1';

export type PrivacyPrefs = { readReceipts: boolean; typingIndicator: boolean };

const prefs: PrivacyPrefs = { readReceipts: true, typingIndicator: true };

export function privacyPrefs(): PrivacyPrefs {
  return { ...prefs };
}

export async function loadPrivacyPrefs(): Promise<PrivacyPrefs> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (raw) {
      const p = JSON.parse(raw) as Partial<PrivacyPrefs>;
      if (typeof p.readReceipts === 'boolean') prefs.readReceipts = p.readReceipts;
      if (typeof p.typingIndicator === 'boolean') prefs.typingIndicator = p.typingIndicator;
    }
  } catch {
    // defaults stand
  }
  return privacyPrefs();
}

export async function setPrivacyPref<K extends keyof PrivacyPrefs>(key: K, value: PrivacyPrefs[K]): Promise<void> {
  prefs[key] = value;
  await AsyncStorage.setItem(KEY, JSON.stringify(prefs)).catch(() => {});
}
