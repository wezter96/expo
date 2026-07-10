import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { joinGroupByCode, serverEnabled } from '../api/pocketbase';
import { useTranslation } from '../i18n';
import { useStore } from '../store';
import { type Colors, type Fonts, radius, spacing, TAP_TARGET } from '../theme';
import { useTheme } from '../theme-context';

/**
 * Redeem a group invite code. Shared by the manual "Join a group" screen and
 * the kinly://join/<code> deep-link screen (which passes an initial code and
 * auto-submits).
 */
export function JoinGroupView({ initialCode, autoJoin }: { initialCode?: string; autoJoin?: boolean }) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { colors, fonts } = useTheme();
  const { t } = useTranslation();
  const { refresh } = useStore();
  const styles = useMemo(() => makeStyles(colors, fonts), [colors, fonts]);
  const [code, setCode] = useState((initialCode ?? '').toUpperCase());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const join = async (value: string) => {
    const c = value.trim().toUpperCase();
    if (!c) return;
    if (!serverEnabled()) {
      setError(t('join.offline'));
      return;
    }
    setError(null);
    setBusy(true);
    try {
      const id = await joinGroupByCode(c);
      if (!id) throw new Error('no id');
      await refresh();
      router.replace(`/chat/${id}`);
    } catch {
      setError(t('join.error'));
    } finally {
      setBusy(false);
    }
  };

  // Deep-link entry: try the code once on mount.
  useEffect(() => {
    if (autoJoin && initialCode) void join(initialCode);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <View style={[styles.content, { paddingTop: insets.top + spacing.lg }]}>
      <View style={styles.logo}>
        <Ionicons name="people" size={44} color={colors.textOnDark} />
      </View>
      <Text style={styles.prompt}>{t('join.prompt')}</Text>

      <Text style={styles.label}>{t('join.code')}</Text>
      <TextInput
        style={styles.input}
        value={code}
        onChangeText={(v) => setCode(v.toUpperCase())}
        placeholder="ABCD2345"
        placeholderTextColor={colors.textMuted}
        autoCapitalize="characters"
        autoCorrect={false}
        maxLength={12}
      />
      {error ? <Text style={styles.error}>{error}</Text> : null}

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('join.join')}
        onPress={() => join(code)}
        disabled={busy || !code.trim()}
        style={({ pressed }) => [styles.primary, (busy || pressed || !code.trim()) && styles.dim]}
      >
        {busy ? (
          <ActivityIndicator color={colors.textOnDark} />
        ) : (
          <Text style={styles.primaryText}>{t('join.join')}</Text>
        )}
      </Pressable>
    </View>
  );
}

function makeStyles(colors: Colors, fonts: Fonts) {
  return StyleSheet.create({
    content: { flex: 1, padding: spacing.lg, gap: spacing.md, backgroundColor: colors.background },
    logo: {
      alignSelf: 'center',
      width: 88,
      height: 88,
      borderRadius: 44,
      backgroundColor: colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: spacing.sm,
    },
    prompt: { fontSize: fonts.body, color: colors.textMuted, textAlign: 'center', marginBottom: spacing.sm },
    label: { fontSize: fonts.body, fontWeight: '800', color: colors.text },
    input: {
      minHeight: TAP_TARGET,
      borderWidth: 2,
      borderColor: colors.border,
      borderRadius: radius.md,
      paddingHorizontal: spacing.md,
      fontSize: fonts.title,
      fontWeight: '800',
      letterSpacing: 4,
      textAlign: 'center',
      color: colors.text,
      backgroundColor: colors.card,
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
  });
}
