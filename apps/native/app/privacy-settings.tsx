import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  deleteAccount,
  fetchBlockedPeople,
  quietHours,
  serverEnabled,
  setQuietHours,
  unblockUser,
  type KnownPerson,
  type QuietHours,
} from '../src/api/pocketbase';
import { Avatar } from '../src/components/Avatar';
import { useAuth } from '../src/auth/AuthContext';
import { useTranslation } from '../src/i18n';
import { loadPrivacyPrefs, setPrivacyPref, type PrivacyPrefs } from '../src/privacy';
import { type Colors, type Fonts, radius, spacing, TAP_TARGET } from '../src/theme';
import { useTheme } from '../src/theme-context';

/** Privacy & safety: read-receipt/typing switches, the blocked list, legal
 *  documents, and account deletion (store/GDPR requirement). */
export default function PrivacySettings() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { colors, fonts } = useTheme();
  const { t } = useTranslation();
  const { user, signOut } = useAuth();
  const styles = useMemo(() => makeStyles(colors, fonts), [colors, fonts]);

  const [prefs, setPrefs] = useState<PrivacyPrefs>({ readReceipts: true, typingIndicator: true });
  const [blocked, setBlocked] = useState<KnownPerson[]>([]);
  const [quiet, setQuiet] = useState<QuietHours>(null);
  const [busy, setBusy] = useState(false);
  const online = serverEnabled();

  useEffect(() => {
    loadPrivacyPrefs().then(setPrefs);
    if (online) {
      fetchBlockedPeople().then(setBlocked);
      setQuiet(quietHours());
    }
  }, [online]);

  const applyQuiet = (win: QuietHours) => {
    setQuiet(win);
    void setQuietHours(win).catch(() => {});
  };

  const toggle = (key: keyof PrivacyPrefs) => (value: boolean) => {
    setPrefs((p) => ({ ...p, [key]: value }));
    void setPrivacyPref(key, value);
  };

  const unblock = async (p: KnownPerson) => {
    await unblockUser(p.id);
    setBlocked((list) => list.filter((x) => x.id !== p.id));
  };

  const confirmDelete = () => {
    Alert.alert(t('privacy.deleteAccount'), t('privacy.deleteWarn'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('privacy.deleteAccount'),
        style: 'destructive',
        onPress: () => {
          // Second confirmation — this is irreversible.
          Alert.alert(t('privacy.deleteSure'), t('privacy.deleteSureBody'), [
            { text: t('common.cancel'), style: 'cancel' },
            {
              text: t('privacy.deleteForever'),
              style: 'destructive',
              onPress: async () => {
                setBusy(true);
                const ok = await deleteAccount();
                setBusy(false);
                if (!ok) {
                  Alert.alert(t('privacy.deleteAccount'), t('privacy.deleteError'));
                  return;
                }
                await AsyncStorage.clear().catch(() => {});
                signOut();
              },
            },
          ]);
        },
      },
    ]);
  };

  return (
    <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + spacing.xl }]}>
      <Text style={styles.label}>{t('privacy.signals')}</Text>
      <View style={styles.card}>
        <View style={styles.row}>
          <Ionicons name="checkmark-done" size={26} color={colors.primary} />
          <View style={styles.rowText}>
            <Text style={styles.rowLabel}>{t('privacy.readReceipts')}</Text>
            <Text style={styles.rowHint}>{t('privacy.readReceiptsHint')}</Text>
          </View>
          <Switch value={prefs.readReceipts} onValueChange={toggle('readReceipts')} />
        </View>
        <View style={[styles.row, styles.divider]}>
          <Ionicons name="ellipsis-horizontal" size={26} color={colors.primary} />
          <View style={styles.rowText}>
            <Text style={styles.rowLabel}>{t('privacy.typing')}</Text>
            <Text style={styles.rowHint}>{t('privacy.typingHint')}</Text>
          </View>
          <Switch value={prefs.typingIndicator} onValueChange={toggle('typingIndicator')} />
        </View>
      </View>

      {online ? (
        <>
          <Text style={styles.label}>{t('privacy.quiet')}</Text>
          <View style={styles.card}>
            <View style={styles.row}>
              <Ionicons name="moon" size={26} color={colors.primary} />
              <View style={styles.rowText}>
                <Text style={styles.rowLabel}>{t('privacy.quietTitle')}</Text>
                <Text style={styles.rowHint}>
                  {quiet ? t('privacy.quietOn', { start: quiet.start, end: quiet.end }) : t('privacy.quietHint')}
                </Text>
              </View>
              <Switch value={!!quiet} onValueChange={(on) => applyQuiet(on ? { start: '22:00', end: '07:00' } : null)} />
            </View>
            {quiet ? (
              <View style={[styles.row, styles.divider, styles.chipsRow]}>
                {[
                  { start: '21:00', end: '07:00' },
                  { start: '22:00', end: '07:00' },
                  { start: '22:00', end: '08:00' },
                ].map((w) => {
                  const active = quiet.start === w.start && quiet.end === w.end;
                  return (
                    <Pressable
                      key={`${w.start}-${w.end}`}
                      accessibilityRole="button"
                      accessibilityState={{ selected: active }}
                      onPress={() => applyQuiet(w)}
                      style={[styles.chip, active && styles.chipOn]}
                    >
                      <Text style={[styles.chipText, active && styles.chipTextOn]}>
                        {w.start}–{w.end}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            ) : null}
          </View>
        </>
      ) : null}

      <Text style={styles.label}>{t('privacy.blocked')}</Text>
      {!online ? <Text style={styles.muted}>{t('guardians.offline')}</Text> : null}
      {online && blocked.length === 0 ? <Text style={styles.muted}>{t('privacy.noBlocked')}</Text> : null}
      {blocked.map((p) => (
        <View key={p.id} style={styles.blockedRow}>
          <Avatar name={p.name} uri={p.avatar} size={44} />
          <Text style={styles.blockedName} numberOfLines={1}>{p.name}</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${t('privacy.unblock')} ${p.name}`}
            onPress={() => unblock(p)}
            style={({ pressed }) => [styles.unblockBtn, pressed && styles.pressed]}
          >
            <Text style={styles.unblockText}>{t('privacy.unblock')}</Text>
          </Pressable>
        </View>
      ))}

      <Text style={styles.label}>{t('privacy.legal')}</Text>
      <Pressable
        accessibilityRole="button"
        onPress={() => router.push('/legal')}
        style={({ pressed }) => [styles.linkRow, pressed && styles.pressed]}
      >
        <Ionicons name="document-text" size={24} color={colors.primary} />
        <Text style={styles.linkText}>{t('privacy.legalLink')}</Text>
        <Ionicons name="chevron-forward" size={22} color={colors.textMuted} />
      </Pressable>

      {user && online ? (
        <>
          <Text style={styles.label}>{t('privacy.dangerZone')}</Text>
          <Pressable
            accessibilityRole="button"
            onPress={confirmDelete}
            disabled={busy}
            style={({ pressed }) => [styles.danger, (pressed || busy) && styles.pressed]}
          >
            {busy ? (
              <ActivityIndicator color={colors.danger} />
            ) : (
              <>
                <Ionicons name="trash" size={24} color={colors.danger} />
                <Text style={styles.dangerText}>{t('privacy.deleteAccount')}</Text>
              </>
            )}
          </Pressable>
          <Text style={styles.muted}>{t('privacy.deleteHint')}</Text>
        </>
      ) : null}
    </ScrollView>
  );
}

function makeStyles(colors: Colors, fonts: Fonts) {
  return StyleSheet.create({
    content: { padding: spacing.md, gap: spacing.sm },
    label: { fontSize: fonts.body, fontWeight: '800', color: colors.text, marginTop: spacing.md },
    muted: { fontSize: fonts.small, color: colors.textMuted },
    card: { backgroundColor: colors.card, borderRadius: radius.lg, borderWidth: 2, borderColor: colors.border },
    row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.md, minHeight: TAP_TARGET + 4 },
    divider: { borderTopWidth: 2, borderTopColor: colors.border },
    rowText: { flex: 1 },
    rowLabel: { fontSize: fonts.body, fontWeight: '700', color: colors.text },
    rowHint: { fontSize: fonts.small, color: colors.textMuted, marginTop: 2 },
    chipsRow: { flexWrap: 'wrap', gap: spacing.sm },
    chip: {
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      borderRadius: radius.pill,
      borderWidth: 2,
      borderColor: colors.border,
    },
    chipOn: { backgroundColor: colors.primary, borderColor: colors.primary },
    chipText: { fontSize: fonts.small, fontWeight: '800', color: colors.text },
    chipTextOn: { color: colors.textOnDark },
    blockedRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      padding: spacing.md,
      backgroundColor: colors.card,
      borderRadius: radius.lg,
      borderWidth: 2,
      borderColor: colors.border,
    },
    blockedName: { flex: 1, fontSize: fonts.body, fontWeight: '700', color: colors.text },
    unblockBtn: {
      paddingHorizontal: spacing.md,
      paddingVertical: 8,
      borderRadius: radius.pill,
      borderWidth: 2,
      borderColor: colors.primary,
    },
    unblockText: { fontSize: fonts.small, fontWeight: '800', color: colors.primary },
    linkRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      padding: spacing.md,
      minHeight: TAP_TARGET,
      backgroundColor: colors.card,
      borderRadius: radius.lg,
      borderWidth: 2,
      borderColor: colors.border,
    },
    linkText: { flex: 1, fontSize: fonts.body, fontWeight: '700', color: colors.text },
    danger: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.sm,
      minHeight: TAP_TARGET + 4,
      borderRadius: radius.lg,
      borderWidth: 2,
      borderColor: colors.danger,
      backgroundColor: colors.card,
    },
    dangerText: { fontSize: fonts.button, fontWeight: '800', color: colors.danger },
    pressed: { opacity: 0.7 },
  });
}
