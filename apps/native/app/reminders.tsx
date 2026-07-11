import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  createReminder,
  deleteReminder,
  fetchReminders,
  markReminderDone,
  type Reminder,
  type ReminderKind,
} from '../src/api/pocketbase';
import { useTranslation } from '../src/i18n';
import { cancelReminder, scheduleReminder } from '../src/reminders';
import { type Colors, type Fonts, radius, spacing, TAP_TARGET } from '../src/theme';
import { useTheme } from '../src/theme-context';

const TIMES: { key: string; time: string }[] = [
  { key: 'reminders.morning', time: '08:00' },
  { key: 'reminders.noon', time: '12:00' },
  { key: 'reminders.afternoon', time: '15:00' },
  { key: 'reminders.evening', time: '18:00' },
  { key: 'reminders.night', time: '21:00' },
];

function isToday(ms?: number): boolean {
  if (!ms) return false;
  const d = new Date(ms);
  const n = new Date();
  return d.getFullYear() === n.getFullYear() && d.getMonth() === n.getMonth() && d.getDate() === n.getDate();
}

function dateForOffset(offset: number): string {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export default function Reminders() {
  const insets = useSafeAreaInsets();
  const { colors, fonts } = useTheme();
  const { t } = useTranslation();
  const styles = useMemo(() => makeStyles(colors, fonts), [colors, fonts]);

  const [items, setItems] = useState<Reminder[]>([]);
  const [adding, setAdding] = useState(false);
  const [kind, setKind] = useState<ReminderKind>('medication');
  const [title, setTitle] = useState('');
  const [time, setTime] = useState('08:00');
  const [dayOffset, setDayOffset] = useState(0);
  const [notify, setNotify] = useState(true);
  const [busy, setBusy] = useState(false);

  const reload = () => fetchReminders().then(setItems);
  useEffect(() => {
    reload();
  }, []);

  const dayLabel = (offset: number) => {
    if (offset === 0) return t('reminders.today');
    if (offset === 1) return t('reminders.tomorrow');
    const d = new Date();
    d.setDate(d.getDate() + offset);
    return d.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'short' });
  };

  const resetForm = () => {
    setKind('medication');
    setTitle('');
    setTime('08:00');
    setDayOffset(0);
    setNotify(true);
    setAdding(false);
  };

  const save = async () => {
    if (!title.trim()) return;
    setBusy(true);
    try {
      const created = await createReminder({
        kind,
        title: title.trim(),
        time,
        date: kind === 'appointment' ? dateForOffset(dayOffset) : undefined,
        enabled: true,
        notifyCaregiver: kind === 'medication' ? notify : false,
      });
      if (created) {
        await scheduleReminder(created);
        await reload();
      }
      resetForm();
    } finally {
      setBusy(false);
    }
  };

  const remove = (r: Reminder) => {
    Alert.alert(t('reminders.delete'), t('reminders.deleteConfirm', { title: r.title }), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('reminders.delete'),
        style: 'destructive',
        onPress: async () => {
          await deleteReminder(r.id);
          await cancelReminder(r.id);
          await reload();
        },
      },
    ]);
  };

  const done = async (r: Reminder) => {
    await markReminderDone(r.id);
    setItems((list) => list.map((x) => (x.id === r.id ? { ...x, lastDoneAt: Date.now() } : x)));
  };

  return (
    <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + spacing.xl }]}>
      {items.length === 0 && !adding ? (
        <View style={styles.empty}>
          <Ionicons name="alarm-outline" size={64} color={colors.textMuted} />
          <Text style={styles.emptyTitle}>{t('reminders.empty')}</Text>
          <Text style={styles.emptyBody}>{t('reminders.emptyBody')}</Text>
        </View>
      ) : null}

      {items.map((r) => {
        const doneToday = isToday(r.lastDoneAt);
        return (
          <View key={r.id} style={styles.card}>
            <Ionicons
              name={r.kind === 'medication' ? 'medkit' : 'calendar'}
              size={30}
              color={colors.primary}
            />
            <View style={styles.cardText}>
              <Text style={styles.cardTitle}>{r.title}</Text>
              <Text style={styles.cardSub}>
                {r.kind === 'appointment' && r.date ? `${r.date} · ${r.time}` : `${r.time} · ${t('reminders.daily')}`}
              </Text>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={r.kind === 'medication' ? t('reminders.markTaken') : t('reminders.markDone')}
              onPress={() => done(r)}
              disabled={doneToday}
              style={({ pressed }) => [styles.doneBtn, doneToday && styles.doneBtnOn, pressed && styles.pressed]}
            >
              <Text style={[styles.doneText, doneToday && styles.doneTextOn]}>
                {doneToday
                  ? r.kind === 'medication'
                    ? t('reminders.takenToday')
                    : t('reminders.doneToday')
                  : r.kind === 'medication'
                    ? t('reminders.markTaken')
                    : t('reminders.markDone')}
              </Text>
            </Pressable>
            <Pressable accessibilityRole="button" accessibilityLabel={t('reminders.delete')} onPress={() => remove(r)} hitSlop={8}>
              <Ionicons name="trash-outline" size={24} color={colors.danger} />
            </Pressable>
          </View>
        );
      })}

      {adding ? (
        <View style={styles.form}>
          <View style={styles.kindRow}>
            {(['medication', 'appointment'] as ReminderKind[]).map((k) => (
              <Pressable
                key={k}
                accessibilityRole="button"
                accessibilityState={{ selected: kind === k }}
                onPress={() => setKind(k)}
                style={[styles.kindChip, kind === k && styles.kindChipOn]}
              >
                <Ionicons name={k === 'medication' ? 'medkit' : 'calendar'} size={22} color={kind === k ? colors.textOnDark : colors.primary} />
                <Text style={[styles.kindText, kind === k && styles.kindTextOn]}>
                  {t(k === 'medication' ? 'reminders.medication' : 'reminders.appointment')}
                </Text>
              </Pressable>
            ))}
          </View>

          <Text style={styles.label}>{t('reminders.name')}</Text>
          <TextInput
            style={styles.input}
            value={title}
            onChangeText={setTitle}
            placeholder={t(kind === 'medication' ? 'reminders.namePlaceholderMed' : 'reminders.namePlaceholderAppt')}
            placeholderTextColor={colors.textMuted}
          />

          {kind === 'appointment' ? (
            <>
              <Text style={styles.label}>{t('reminders.day')}</Text>
              <View style={styles.stepper}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="−1"
                  disabled={dayOffset <= 0}
                  onPress={() => setDayOffset((d) => Math.max(0, d - 1))}
                  style={({ pressed }) => [styles.stepBtn, (pressed || dayOffset <= 0) && styles.pressed]}
                >
                  <Ionicons name="chevron-back" size={26} color={colors.primary} />
                </Pressable>
                <Text style={styles.stepValue}>{dayLabel(dayOffset)}</Text>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="+1"
                  disabled={dayOffset >= 60}
                  onPress={() => setDayOffset((d) => Math.min(60, d + 1))}
                  style={({ pressed }) => [styles.stepBtn, pressed && styles.pressed]}
                >
                  <Ionicons name="chevron-forward" size={26} color={colors.primary} />
                </Pressable>
              </View>
            </>
          ) : null}

          <Text style={styles.label}>{t('reminders.time')}</Text>
          <View style={styles.times}>
            {TIMES.map((p) => (
              <Pressable
                key={p.time}
                accessibilityRole="button"
                accessibilityState={{ selected: time === p.time }}
                onPress={() => setTime(p.time)}
                style={[styles.timeChip, time === p.time && styles.timeChipOn]}
              >
                <Text style={[styles.timeVal, time === p.time && styles.timeValOn]}>{p.time}</Text>
                <Text style={[styles.timeCap, time === p.time && styles.timeValOn]}>{t(p.key)}</Text>
              </Pressable>
            ))}
          </View>

          {kind === 'medication' ? (
            <View style={styles.notifyRow}>
              <Text style={styles.notifyText}>{t('reminders.notifyCaregiver')}</Text>
              <Switch value={notify} onValueChange={setNotify} />
            </View>
          ) : null}

          <Pressable
            accessibilityRole="button"
            onPress={save}
            disabled={busy || !title.trim()}
            style={({ pressed }) => [styles.primary, (busy || pressed || !title.trim()) && styles.dim]}
          >
            <Text style={styles.primaryText}>{t('reminders.save')}</Text>
          </Pressable>
          <Pressable accessibilityRole="button" onPress={resetForm} style={styles.cancelBtn}>
            <Text style={styles.cancelText}>{t('common.cancel')}</Text>
          </Pressable>
        </View>
      ) : (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('reminders.add')}
          onPress={() => setAdding(true)}
          style={({ pressed }) => [styles.addBtn, pressed && styles.pressed]}
        >
          <Ionicons name="add-circle" size={28} color={colors.textOnDark} />
          <Text style={styles.addText}>{t('reminders.add')}</Text>
        </Pressable>
      )}
    </ScrollView>
  );
}

function makeStyles(colors: Colors, fonts: Fonts) {
  return StyleSheet.create({
    content: { padding: spacing.md, gap: spacing.sm },
    empty: { alignItems: 'center', justifyContent: 'center', gap: spacing.sm, paddingVertical: spacing.xl },
    emptyTitle: { fontSize: fonts.title, fontWeight: '800', color: colors.text, marginTop: spacing.sm },
    emptyBody: { fontSize: fonts.body, color: colors.textMuted, textAlign: 'center', lineHeight: fonts.body + 8 },
    card: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      padding: spacing.md,
      backgroundColor: colors.card,
      borderRadius: radius.lg,
      borderWidth: 2,
      borderColor: colors.border,
    },
    cardText: { flex: 1 },
    cardTitle: { fontSize: fonts.body + 1, fontWeight: '800', color: colors.text },
    cardSub: { fontSize: fonts.small, color: colors.textMuted, marginTop: 2 },
    doneBtn: { paddingHorizontal: spacing.sm, paddingVertical: 8, borderRadius: radius.pill, borderWidth: 2, borderColor: colors.primary },
    doneBtnOn: { backgroundColor: colors.accent, borderColor: colors.accent },
    doneText: { fontSize: fonts.small, fontWeight: '800', color: colors.primary },
    doneTextOn: { color: colors.textOnDark },
    pressed: { opacity: 0.7 },
    dim: { opacity: 0.6 },

    form: { gap: spacing.sm, backgroundColor: colors.card, borderRadius: radius.lg, borderWidth: 2, borderColor: colors.border, padding: spacing.md },
    kindRow: { flexDirection: 'row', gap: spacing.sm },
    kindChip: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.xs,
      minHeight: TAP_TARGET,
      borderRadius: radius.md,
      borderWidth: 2,
      borderColor: colors.border,
    },
    kindChipOn: { backgroundColor: colors.primary, borderColor: colors.primary },
    kindText: { fontSize: fonts.body, fontWeight: '800', color: colors.primary },
    kindTextOn: { color: colors.textOnDark },
    label: { fontSize: fonts.body, fontWeight: '800', color: colors.text, marginTop: spacing.xs },
    input: {
      minHeight: TAP_TARGET,
      borderWidth: 2,
      borderColor: colors.border,
      borderRadius: radius.md,
      paddingHorizontal: spacing.md,
      fontSize: fonts.body,
      color: colors.text,
      backgroundColor: colors.background,
    },
    stepper: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
    stepBtn: {
      width: TAP_TARGET,
      height: TAP_TARGET,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: radius.md,
      borderWidth: 2,
      borderColor: colors.border,
    },
    stepValue: { flex: 1, textAlign: 'center', fontSize: fonts.body, fontWeight: '800', color: colors.text },
    times: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
    timeChip: {
      alignItems: 'center',
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      borderRadius: radius.md,
      borderWidth: 2,
      borderColor: colors.border,
    },
    timeChipOn: { backgroundColor: colors.primary, borderColor: colors.primary },
    timeVal: { fontSize: fonts.body, fontWeight: '800', color: colors.text },
    timeCap: { fontSize: fonts.small - 2, color: colors.textMuted },
    timeValOn: { color: colors.textOnDark },
    notifyRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md, marginTop: spacing.xs },
    notifyText: { flex: 1, fontSize: fonts.body, color: colors.text, fontWeight: '600' },
    primary: {
      minHeight: TAP_TARGET + 4,
      backgroundColor: colors.accent,
      borderRadius: radius.lg,
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: spacing.sm,
    },
    primaryText: { fontSize: fonts.button, fontWeight: '800', color: colors.textOnDark },
    cancelBtn: { alignItems: 'center', paddingVertical: spacing.sm },
    cancelText: { fontSize: fonts.body, color: colors.textMuted, fontWeight: '700' },
    addBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.sm,
      minHeight: TAP_TARGET + 4,
      backgroundColor: colors.primary,
      borderRadius: radius.lg,
      marginTop: spacing.sm,
    },
    addText: { fontSize: fonts.button, fontWeight: '800', color: colors.textOnDark },
  });
}
