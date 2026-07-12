import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { startDirectChat } from '../src/api/pocketbase';
import { useTranslation } from '../src/i18n';
import { useStore } from '../src/store';
import { type Colors, type Fonts, radius, spacing, TAP_TARGET } from '../src/theme';
import { useTheme } from '../src/theme-context';

// Where new users go to get Kinly. Update once store listings exist.
const DOWNLOAD_URL = 'https://kinly.app/get';

export default function NewChat() {
  const router = useRouter();
  const { refresh } = useStore();
  const { colors, fonts } = useTheme();
  const { t } = useTranslation();
  const styles = useMemo(() => makeStyles(colors, fonts), [colors, fonts]);
  const [handle, setHandle] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const start = async () => {
    if (!handle.trim()) return;
    setError(null);
    setBusy(true);
    try {
      const conversationId = await startDirectChat(handle.trim());
      await refresh();
      router.replace(`/chat/${conversationId}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not start the chat.');
    } finally {
      setBusy(false);
    }
  };

  const invite = () => {
    void Share.share({ message: t('invite.message', { link: DOWNLOAD_URL }) }).catch(() => {});
  };

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.content}>
        <View style={styles.icon}>
          <Ionicons name="person-add" size={44} color={colors.textOnDark} />
        </View>
        <Text style={styles.title}>Add a family member or friend</Text>
        <Text style={styles.body}>Enter their username or phone number. They need to have joined Kinly too.</Text>

        <TextInput
          style={styles.input}
          value={handle}
          onChangeText={setHandle}
          placeholder="@username or phone"
          placeholderTextColor={colors.textMuted}
          autoCapitalize="none"
          autoCorrect={false}
          autoFocus
        />

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <Pressable
          accessibilityRole="button"
          onPress={start}
          disabled={busy || !handle.trim()}
          style={({ pressed }) => [styles.primary, (busy || !handle.trim() || pressed) && styles.dim]}
        >
          {busy ? <ActivityIndicator color={colors.textOnDark} /> : <Text style={styles.primaryText}>Start chat</Text>}
        </Pressable>

        {/* Not on Kinly yet? Send them an invite — shown always, and it's the
            natural next step when a lookup fails. */}
        <Pressable
          accessibilityRole="button"
          onPress={invite}
          style={({ pressed }) => [styles.invite, error && styles.inviteHighlight, pressed && styles.dim]}
        >
          <Ionicons name="share-social" size={24} color={colors.primary} />
          <View style={styles.inviteText}>
            <Text style={styles.inviteTitle}>{t('invite.button')}</Text>
            <Text style={styles.inviteBody}>{t('invite.hint')}</Text>
          </View>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

function makeStyles(colors: Colors, fonts: Fonts) {
  return StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, gap: spacing.md },
  icon: {
    alignSelf: 'center',
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.md,
    marginBottom: spacing.sm,
  },
  title: { fontSize: fonts.title, fontWeight: '800', color: colors.text, textAlign: 'center' },
  body: { fontSize: fonts.body, color: colors.textMuted, textAlign: 'center', marginBottom: spacing.sm },
  input: {
    minHeight: TAP_TARGET,
    borderWidth: 2,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    fontSize: fonts.title,
    color: colors.text,
    backgroundColor: colors.card,
    textAlign: 'center',
  },
  error: { fontSize: fonts.body, color: colors.danger, fontWeight: '600', textAlign: 'center' },
  primary: {
    minHeight: TAP_TARGET + 8,
    backgroundColor: colors.accent,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.sm,
  },
  dim: { opacity: 0.6 },
  primaryText: { fontSize: fonts.button, fontWeight: '800', color: colors.textOnDark },
  invite: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    marginTop: spacing.sm,
    borderRadius: radius.lg,
    borderWidth: 2,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  inviteHighlight: { borderColor: colors.primary },
  inviteText: { flex: 1 },
  inviteTitle: { fontSize: fonts.body, fontWeight: '800', color: colors.primary },
  inviteBody: { fontSize: fonts.small, color: colors.textMuted, marginTop: 2 },
  });
}
