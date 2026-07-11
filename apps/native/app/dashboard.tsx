import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { fetchGuardians, startDirectChat, type Guardian } from '../src/api/pocketbase';
import { Avatar } from '../src/components/Avatar';
import { useTranslation } from '../src/i18n';
import { relativeTime } from '../src/time';
import { type Colors, type Fonts, radius, spacing, TAP_TARGET } from '../src/theme';
import { useTheme } from '../src/theme-context';

/** Everyone a guardian looks after, at a glance: check-in status, medication
 *  status, and quick actions to reach or help each person. */
export default function Dashboard() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { colors, fonts } = useTheme();
  const { t } = useTranslation();
  const styles = useMemo(() => makeStyles(colors, fonts), [colors, fonts]);
  const [wards, setWards] = useState<Guardian[]>([]);

  useEffect(() => {
    fetchGuardians().then((list) => setWards(list.filter((g) => g.role === 'ward' && g.status === 'active')));
  }, []);

  const openChat = async (g: Guardian, mode?: 'voice') => {
    const handle = g.person.phone || (g.person.username ? `@${g.person.username}` : '');
    if (!handle) return;
    try {
      const convId = await startDirectChat(handle);
      router.push(mode ? `/call/${convId}?mode=${mode}` : `/chat/${convId}`);
    } catch {
      Alert.alert(t('dashboard.title'), t('guardians.offline'));
    }
  };

  return (
    <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + spacing.xl }]}>
      {wards.length === 0 ? (
        <View style={styles.empty}>
          <Ionicons name="people-circle-outline" size={64} color={colors.textMuted} />
          <Text style={styles.emptyTitle}>{t('dashboard.empty')}</Text>
          <Text style={styles.emptyBody}>{t('dashboard.emptyBody')}</Text>
        </View>
      ) : null}

      {wards.map((g) => {
        const w = g.ward;
        const missed = w?.missedMeds ?? 0;
        const allGood = missed === 0;
        return (
          <View key={g.id} style={styles.card}>
            <View style={styles.head}>
              <Avatar name={g.person.name} uri={g.person.avatar} size={56} />
              <View style={styles.headText}>
                <Text style={styles.name}>{g.person.name}</Text>
                <Text style={styles.checkin}>
                  {w?.lastCheckIn ? t('guardians.lastCheckin', { time: relativeTime(w.lastCheckIn) }) : t('guardians.noCheckin')}
                </Text>
              </View>
              <Ionicons
                name={allGood ? 'checkmark-circle' : 'alert-circle'}
                size={30}
                color={allGood ? colors.accent : colors.danger}
              />
            </View>

            <View style={styles.statusRow}>
              <Ionicons name="medkit" size={18} color={missed > 0 ? colors.danger : colors.textMuted} />
              <Text style={[styles.statusText, missed > 0 && styles.statusBad]}>
                {missed > 0
                  ? t('dashboard.missedMeds', { count: missed })
                  : (w?.medsTotal ?? 0) > 0
                    ? t('dashboard.medsOk')
                    : t('dashboard.allGood')}
              </Text>
            </View>

            <View style={styles.actions}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`${t('dashboard.message')} ${g.person.name}`}
                onPress={() => openChat(g)}
                style={({ pressed }) => [styles.action, pressed && styles.pressed]}
              >
                <Ionicons name="chatbubble" size={22} color={colors.primary} />
                <Text style={styles.actionText}>{t('dashboard.message')}</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`${t('dashboard.call')} ${g.person.name}`}
                onPress={() => openChat(g, 'voice')}
                style={({ pressed }) => [styles.action, pressed && styles.pressed]}
              >
                <Ionicons name="call" size={22} color={colors.accent} />
                <Text style={styles.actionText}>{t('dashboard.call')}</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`${t('dashboard.setup')} ${g.person.name}`}
                onPress={() => router.push(`/ward/${g.person.id}`)}
                style={({ pressed }) => [styles.action, pressed && styles.pressed]}
              >
                <Ionicons name="construct" size={22} color={colors.primary} />
                <Text style={styles.actionText}>{t('dashboard.setup')}</Text>
              </Pressable>
            </View>
          </View>
        );
      })}
    </ScrollView>
  );
}

function makeStyles(colors: Colors, fonts: Fonts) {
  return StyleSheet.create({
    content: { padding: spacing.md, gap: spacing.md },
    empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.sm, paddingVertical: spacing.xl },
    emptyTitle: { fontSize: fonts.title, fontWeight: '800', color: colors.text, marginTop: spacing.sm },
    emptyBody: { fontSize: fonts.body, color: colors.textMuted, textAlign: 'center', lineHeight: fonts.body + 8 },
    card: {
      backgroundColor: colors.card,
      borderRadius: radius.lg,
      borderWidth: 2,
      borderColor: colors.border,
      padding: spacing.md,
      gap: spacing.sm,
    },
    head: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
    headText: { flex: 1 },
    name: { fontSize: fonts.title, fontWeight: '800', color: colors.text },
    checkin: { fontSize: fonts.small, color: colors.textMuted, marginTop: 2 },
    statusRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    statusText: { fontSize: fonts.body, color: colors.textMuted, fontWeight: '600' },
    statusBad: { color: colors.danger, fontWeight: '800' },
    actions: { flexDirection: 'row', gap: spacing.sm },
    action: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      minHeight: TAP_TARGET,
      borderRadius: radius.md,
      borderWidth: 2,
      borderColor: colors.border,
    },
    actionText: { fontSize: fonts.small + 1, fontWeight: '800', color: colors.text },
    pressed: { opacity: 0.7 },
  });
}
