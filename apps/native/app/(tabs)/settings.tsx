import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import { useRouter } from 'expo-router';
import React, { useMemo } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Avatar } from '../../src/components/Avatar';
import { myAvatarUrl, serverEnabled } from '../../src/api/pocketbase';
import { useAppLock } from '../../src/applock';
import { useAuth } from '../../src/auth/AuthContext';
import { useTranslation } from '../../src/i18n';
import { useStore } from '../../src/store';
import { type Colors, type Fonts, radius, spacing, TAP_TARGET } from '../../src/theme';
import { useTheme } from '../../src/theme-context';

type Row = {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value?: string;
  color?: string;
  onPress?: () => void;
};

export default function Settings() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user, signOut } = useAuth();
  const { emergencyId, getContact } = useStore();
  const { available: lockAvailable, enabled: lockEnabled, setEnabled: setLockEnabled } = useAppLock();
  const { colors, fonts } = useTheme();
  const { t } = useTranslation();
  const styles = useMemo(() => makeStyles(colors, fonts), [colors, fonts]);
  const online = serverEnabled();
  const version = Constants.expoConfig?.version ?? '1.0.0';
  const emergencyName = emergencyId ? getContact(emergencyId)?.name : undefined;

  const confirmSignOut = () =>
    Alert.alert(t('settings.signOut'), t('settings.signOutConfirm'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('settings.signOut'), style: 'destructive', onPress: signOut },
    ]);

  const rows: Row[] = [
    {
      icon: online ? 'cloud-done' : 'cloud-offline',
      label: t('settings.connection'),
      value: online ? t('settings.connected') : t('settings.onThisDevice'),
      color: online ? colors.accent : colors.textMuted,
    },
    {
      icon: 'volume-high',
      label: t('settings.readAloud'),
      value: t('settings.readAloudValue'),
      onPress: () =>
        Alert.alert('Read aloud', 'Tap the speaker icon on any received message to hear it read out loud.'),
    },
    {
      icon: 'contrast',
      label: t('settings.display'),
      value: t('settings.displayValue'),
      onPress: () => router.push('/display'),
    },
    {
      icon: 'bookmark',
      label: t('saved.title'),
      onPress: () => router.push('/saved'),
    },
    {
      icon: lockEnabled ? 'lock-closed' : 'lock-open',
      label: t('settings.appLock'),
      value: !lockAvailable
        ? t('settings.appLockUnavailable')
        : lockEnabled
          ? t('settings.appLockOn')
          : t('settings.appLockOff'),
      color: lockEnabled ? colors.accent : colors.primary,
      onPress: lockAvailable
        ? () => {
            void setLockEnabled(!lockEnabled);
          }
        : undefined,
    },
    {
      icon: 'shield-checkmark',
      label: t('settings.encryption'),
      value: t('settings.encryptionValue'),
      color: colors.accent,
      onPress: () => router.push('/encryption'),
    },
    {
      icon: 'archive',
      label: t('backup.title'),
      value: t('backup.settingsValue'),
      color: colors.primary,
      onPress: () => router.push('/backup'),
    },
    {
      icon: 'eye-off',
      label: t('privacy.title'),
      value: t('privacy.settingsValue'),
      color: colors.primary,
      onPress: () => router.push('/privacy-settings'),
    },
    {
      icon: 'alert-circle',
      label: t('settings.emergency'),
      value: emergencyName ?? t('settings.emergencyNotSet'),
      color: colors.danger,
      onPress: () => router.push('/emergency'),
    },
    {
      icon: 'heart',
      label: t('settings.checkin'),
      value: t('settings.checkinValue'),
      color: colors.accent,
      onPress: () => router.push('/checkin'),
    },
    {
      icon: 'alarm',
      label: t('reminders.title'),
      value: t('reminders.settingsValue'),
      color: colors.primary,
      onPress: () => router.push('/reminders'),
    },
    {
      icon: 'people-circle',
      label: t('guardians.title'),
      value: t('guardians.settingsValue'),
      color: colors.accent,
      onPress: () => router.push('/guardians'),
    },
    {
      icon: 'grid',
      label: t('dashboard.title'),
      value: t('dashboard.settingsValue'),
      color: colors.primary,
      onPress: () => router.push('/dashboard'),
    },
    {
      icon: 'help-circle',
      label: t('settings.help'),
      onPress: () =>
        Alert.alert(
          'How to use Kinly',
          'Messages: tap a name to read or write.\nAssistant: tap the middle button and say what you want, like "Call Mary".\nCall: tap the green phone button.',
        ),
    },
    {
      icon: 'information-circle',
      label: t('settings.about'),
      value: t('settings.version', { version }),
      onPress: () => Alert.alert('About Kinly', 'A simple, friendly way to stay in touch with family and friends. ❤️'),
    },
  ];

  return (
    <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + spacing.xl }]}>
      <Pressable
        accessibilityRole={user ? 'button' : 'text'}
        accessibilityLabel={user ? 'Edit your profile' : undefined}
        onPress={user ? () => router.push('/profile') : undefined}
        disabled={!user}
        style={({ pressed }) => [styles.profile, pressed && user && styles.pressed]}
      >
        <Avatar name={user?.name || t('settings.you')} size={84} uri={user ? myAvatarUrl() : undefined} />
        <Text style={styles.profileName}>{user?.name || t('settings.you')}</Text>
        <Text style={styles.profileSub}>{user?.phone || user?.email || t('settings.member')}</Text>
        {user ? (
          <View style={styles.editPill}>
            <Ionicons name="pencil" size={16} color={colors.primary} />
            <Text style={styles.editText}>{t('settings.editProfile')}</Text>
          </View>
        ) : null}
      </Pressable>

      <View style={styles.card}>
        {rows.map((row, i) => (
          <Pressable
            key={row.label}
            // Actionable rows are buttons with a combined name; informational
            // rows (no onPress) let their child text be read directly (an
            // aria-label on a non-widget element is prohibited).
            accessibilityRole={row.onPress ? 'button' : undefined}
            accessibilityLabel={row.onPress ? (row.value ? `${row.label}. ${row.value}` : row.label) : undefined}
            accessible={row.onPress ? undefined : false}
            onPress={row.onPress}
            disabled={!row.onPress}
            style={({ pressed }) => [styles.row, i > 0 && styles.rowDivider, pressed && row.onPress && styles.pressed]}
          >
            <Ionicons name={row.icon} size={30} color={row.color ?? colors.primary} />
            <View style={styles.rowText}>
              <Text style={styles.rowLabel}>{row.label}</Text>
              {row.value ? <Text style={styles.rowValue}>{row.value}</Text> : null}
            </View>
            {row.onPress ? <Ionicons name="chevron-forward" size={24} color={colors.textMuted} /> : null}
          </Pressable>
        ))}
      </View>

      {user ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Sign out"
          onPress={confirmSignOut}
          style={({ pressed }) => [styles.signOut, pressed && styles.pressed]}
        >
          <Ionicons name="log-out-outline" size={28} color={colors.danger} />
          <Text style={styles.signOutText}>{t('settings.signOut')}</Text>
        </Pressable>
      ) : null}
    </ScrollView>
  );
}

function makeStyles(colors: Colors, fonts: Fonts) {
  return StyleSheet.create({
  content: { padding: spacing.md, gap: spacing.lg },
  signOut: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    minHeight: TAP_TARGET,
    borderWidth: 2,
    borderColor: colors.border,
    borderRadius: radius.lg,
    backgroundColor: colors.card,
  },
  signOutText: { fontSize: fonts.button, fontWeight: '800', color: colors.danger },
  profile: { alignItems: 'center', gap: spacing.xs, paddingVertical: spacing.md },
  editPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radius.pill,
    backgroundColor: colors.background,
    borderWidth: 2,
    borderColor: colors.border,
  },
  editText: { fontSize: fonts.small, fontWeight: '700', color: colors.primary },
  profileName: { fontSize: fonts.title, fontWeight: '800', color: colors.text, marginTop: spacing.sm },
  profileSub: { fontSize: fonts.body, color: colors.textMuted },

  card: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 2,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  row: {
    minHeight: TAP_TARGET + 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
  },
  rowDivider: { borderTopWidth: 2, borderTopColor: colors.border },
  pressed: { opacity: 0.7 },
  rowText: { flex: 1 },
  rowLabel: { fontSize: fonts.body + 1, fontWeight: '700', color: colors.text },
  rowValue: { fontSize: fonts.small, color: colors.textMuted, marginTop: 2 },
  });
}
