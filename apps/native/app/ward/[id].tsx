import { Ionicons } from '@expo/vector-icons';
import { Stack, useLocalSearchParams } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  addWardContact,
  createWardReminder,
  deleteWardReminder,
  fetchGuardians,
  fetchWardReminders,
  setWardPrefs,
  type Guardian,
} from '../../src/api/pocketbase';
import { RemindersManager } from '../../src/components/RemindersManager';
import { useTranslation } from '../../src/i18n';
import { relativeTime } from '../../src/time';
import { type Colors, type Fonts, radius, spacing, TAP_TARGET } from '../../src/theme';
import { useTheme } from '../../src/theme-context';

const SIZES = [
  { key: 'normal', labelKey: 'display.normal' },
  { key: 'large', labelKey: 'display.large' },
  { key: 'xlarge', labelKey: 'display.xlarge' },
] as const;

/** A guardian's view of one ward: wellbeing at a glance, manage their
 *  reminders, adjust their display settings, and add contacts for them.
 *  Never exposes the ward's messages. */
export default function Ward() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const { colors, fonts } = useTheme();
  const { t } = useTranslation();
  const styles = useMemo(() => makeStyles(colors, fonts), [colors, fonts]);
  const [ward, setWard] = useState<Guardian | null>(null);
  const [sizeApplied, setSizeApplied] = useState<string | null>(null);
  const [handle, setHandle] = useState('');
  const [busyContact, setBusyContact] = useState(false);

  useEffect(() => {
    fetchGuardians().then((list) => setWard(list.find((g) => g.role === 'ward' && g.person.id === id) ?? null));
  }, [id]);

  const name = ward?.person.name ?? '';

  const pickSize = async (size: string) => {
    if (!id) return;
    try {
      await setWardPrefs(id, { textSize: size });
      setSizeApplied(size);
    } catch {
      Alert.alert(t('guardians.title'), t('guardians.offline'));
    }
  };

  const addContact = async () => {
    const h = handle.trim();
    if (!id || !h) return;
    setBusyContact(true);
    try {
      await addWardContact(id, h);
      setHandle('');
      Alert.alert(t('ward.addContact'), t('ward.contactAdded'));
    } catch (e) {
      const msg = e instanceof Error ? e.message : t('guardians.offline');
      Alert.alert(t('ward.addContact'), msg);
    } finally {
      setBusyContact(false);
    }
  };

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
        <>
          <RemindersManager
            header={header}
            load={() => fetchWardReminders(id)}
            create={(input) => createWardReminder(id, input)}
            remove={(r) => deleteWardReminder(id, r.id)}
          />

          <Text style={styles.heading}>{t('ward.displaySection')}</Text>
          <Text style={styles.subLabel}>{t('display.textSize')}</Text>
          <View style={styles.sizeRow}>
            {SIZES.map((s) => (
              <Pressable
                key={s.key}
                accessibilityRole="button"
                accessibilityState={{ selected: sizeApplied === s.key }}
                onPress={() => pickSize(s.key)}
                style={[styles.sizeChip, sizeApplied === s.key && styles.sizeChipOn]}
              >
                <Text style={[styles.sizeText, sizeApplied === s.key && styles.sizeTextOn]}>{t(s.labelKey)}</Text>
              </Pressable>
            ))}
          </View>
          {sizeApplied ? <Text style={styles.applied}>{t('ward.textSizeApplied')}</Text> : null}

          <Text style={styles.heading}>{t('ward.addContact')}</Text>
          <View style={styles.contactRow}>
            <TextInput
              style={styles.input}
              value={handle}
              onChangeText={setHandle}
              placeholder={t('ward.addContactHint')}
              placeholderTextColor={colors.textMuted}
              autoCapitalize="none"
              autoCorrect={false}
            />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('ward.add')}
              onPress={addContact}
              disabled={busyContact || !handle.trim()}
              style={({ pressed }) => [styles.addBtn, (busyContact || pressed || !handle.trim()) && styles.dim]}
            >
              <Text style={styles.addBtnText}>{t('ward.add')}</Text>
            </Pressable>
          </View>
        </>
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
    subLabel: { fontSize: fonts.small, color: colors.textMuted, fontWeight: '700' },
    sizeRow: { flexDirection: 'row', gap: spacing.sm },
    sizeChip: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: TAP_TARGET,
      borderRadius: radius.md,
      borderWidth: 2,
      borderColor: colors.border,
      backgroundColor: colors.card,
    },
    sizeChipOn: { backgroundColor: colors.primary, borderColor: colors.primary },
    sizeText: { fontSize: fonts.body, fontWeight: '800', color: colors.text },
    sizeTextOn: { color: colors.textOnDark },
    applied: { fontSize: fonts.small, color: colors.accent, fontWeight: '700' },
    contactRow: { flexDirection: 'row', gap: spacing.sm, alignItems: 'center' },
    input: {
      flex: 1,
      minHeight: TAP_TARGET,
      borderWidth: 2,
      borderColor: colors.border,
      borderRadius: radius.md,
      paddingHorizontal: spacing.md,
      fontSize: fonts.body,
      color: colors.text,
      backgroundColor: colors.card,
    },
    addBtn: {
      minHeight: TAP_TARGET,
      paddingHorizontal: spacing.lg,
      borderRadius: radius.md,
      backgroundColor: colors.accent,
      alignItems: 'center',
      justifyContent: 'center',
    },
    addBtnText: { fontSize: fonts.body, fontWeight: '800', color: colors.textOnDark },
    dim: { opacity: 0.6 },
  });
}
