import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import React from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Avatar } from '../../src/components/Avatar';
import { serverEnabled } from '../../src/api/pocketbase';
import { useAuth } from '../../src/auth/AuthContext';
import { colors, fonts, radius, spacing, TAP_TARGET } from '../../src/theme';

type Row = {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value?: string;
  color?: string;
  onPress?: () => void;
};

export default function Settings() {
  const insets = useSafeAreaInsets();
  const { user, signOut } = useAuth();
  const online = serverEnabled();
  const version = Constants.expoConfig?.version ?? '1.0.0';

  const confirmSignOut = () =>
    Alert.alert('Sign out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign out', style: 'destructive', onPress: signOut },
    ]);

  const rows: Row[] = [
    {
      icon: online ? 'cloud-done' : 'cloud-offline',
      label: 'Connection',
      value: online ? 'Connected' : 'On this device',
      color: online ? colors.accent : colors.textMuted,
    },
    {
      icon: 'volume-high',
      label: 'Read messages aloud',
      value: 'On — tap the speaker on any message',
      onPress: () =>
        Alert.alert('Read aloud', 'Tap the speaker icon on any received message to hear it read out loud.'),
    },
    {
      icon: 'text',
      label: 'Large text',
      value: 'On',
      onPress: () => Alert.alert('Large text', 'Kinly always uses large, high-contrast text to be easy on the eyes.'),
    },
    {
      icon: 'help-circle',
      label: 'Help',
      onPress: () =>
        Alert.alert(
          'How to use Kinly',
          'Messages: tap a name to read or write.\nAssistant: tap the middle button and say what you want, like "Call Mary".\nCall: tap the green phone button.',
        ),
    },
    {
      icon: 'information-circle',
      label: 'About Kinly',
      value: `Version ${version}`,
      onPress: () => Alert.alert('About Kinly', 'A simple, friendly way to stay in touch with family and friends. ❤️'),
    },
  ];

  return (
    <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + spacing.xl }]}>
      <View style={styles.profile}>
        <Avatar name={user?.name || 'You'} size={84} />
        <Text style={styles.profileName}>{user?.name || 'You'}</Text>
        <Text style={styles.profileSub}>{user?.phone || user?.email || 'Kinly member'}</Text>
      </View>

      <View style={styles.card}>
        {rows.map((row, i) => (
          <Pressable
            key={row.label}
            accessibilityRole={row.onPress ? 'button' : 'text'}
            accessibilityLabel={row.value ? `${row.label}. ${row.value}` : row.label}
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
          <Text style={styles.signOutText}>Sign out</Text>
        </Pressable>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
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
