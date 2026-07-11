import { Ionicons } from '@expo/vector-icons';
import { Stack, useLocalSearchParams } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  createWardReminder,
  deleteWardReminder,
  fetchGuardians,
  fetchWardReminders,
  type Guardian,
} from '../../src/api/pocketbase';
import { RemindersManager } from '../../src/components/RemindersManager';
import { useTranslation } from '../../src/i18n';
import { relativeTime } from '../../src/time';
import { type Colors, type Fonts, radius, spacing } from '../../src/theme';
import { useTheme } from '../../src/theme-context';

/** A guardian's view of one ward: wellbeing at a glance + manage their
 *  reminders on their behalf. Never exposes the ward's messages. */
export default function Ward() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const { colors, fonts } = useTheme();
  const { t } = useTranslation();
  const styles = useMemo(() => makeStyles(colors, fonts), [colors, fonts]);
  const [ward, setWard] = useState<Guardian | null>(null);

  useEffect(() => {
    fetchGuardians().then((list) => setWard(list.find((g) => g.role === 'ward' && g.person.id === id) ?? null));
  }, [id]);

  const name = ward?.person.name ?? '';

  const header = (
    <View>
      <View style={styles.wellbeing}>
        <Ionicons name="heart" size={22} color={colors.accent} />
        <Text style={styles.wellbeingText}>
          {ward?.ward?.lastCheckIn
            ? t('guardians.lastCheckin', { time: relativeTime(ward.ward.lastCheckIn) })
            : t('guardians.noCheckin')}
        </Text>
      </View>
      <View style={styles.note}>
        <Ionicons name="shield-checkmark" size={18} color={colors.accent} />
        <Text style={styles.noteText}>{t('guardians.privacyNote')}</Text>
      </View>
      <Text style={styles.heading}>{t('reminders.title')}</Text>
    </View>
  );

  return (
    <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + spacing.xl }]}>
      <Stack.Screen options={{ title: name || t('guardians.manage') }} />
      {id ? (
        <RemindersManager
          header={header}
          load={() => fetchWardReminders(id)}
          create={(input) => createWardReminder(id, input)}
          remove={(r) => deleteWardReminder(id, r.id)}
        />
      ) : null}
    </ScrollView>
  );
}

function makeStyles(colors: Colors, fonts: Fonts) {
  return StyleSheet.create({
    content: { padding: spacing.md, gap: spacing.sm },
    wellbeing: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      padding: spacing.md,
      backgroundColor: colors.card,
      borderRadius: radius.lg,
      borderWidth: 2,
      borderColor: colors.border,
    },
    wellbeingText: { fontSize: fonts.body, fontWeight: '700', color: colors.text },
    note: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, padding: spacing.md, marginTop: spacing.sm, backgroundColor: colors.bubbleTheirs, borderRadius: radius.md },
    noteText: { flex: 1, fontSize: fonts.small, color: colors.text, fontWeight: '600' },
    heading: { fontSize: fonts.body, fontWeight: '800', color: colors.text, marginTop: spacing.md, marginBottom: spacing.xs },
  });
}
