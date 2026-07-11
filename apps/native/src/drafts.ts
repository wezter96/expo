import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Unsent message drafts, kept per conversation so a half-typed message
 * survives leaving and reopening a chat. Stored as a single JSON map on the
 * device — drafts are local and never leave the phone.
 */
const KEY = 'kinly.drafts.v1';

type DraftMap = Record<string, string>;

async function readAll(): Promise<DraftMap> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as DraftMap) : {};
  } catch {
    return {};
  }
}

export async function loadDraft(conversationId: string): Promise<string> {
  const all = await readAll();
  return all[conversationId] ?? '';
}

export async function saveDraft(conversationId: string, text: string): Promise<void> {
  const all = await readAll();
  if (text.trim()) all[conversationId] = text;
  else delete all[conversationId];
  await AsyncStorage.setItem(KEY, JSON.stringify(all)).catch(() => {});
}

export async function clearDraft(conversationId: string): Promise<void> {
  await saveDraft(conversationId, '');
}
