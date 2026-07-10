import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { caregiverId, checkIn, fetchKnownPeople, lastCheckInAt, setCaregiver, type KnownPerson } from '../src/api/pocketbase';
import { Avatar } from '../src/components/Avatar';
import { type Colors, type Fonts, radius, spacing, TAP_TARGET } from '../src/theme';
import { useTheme } from '../src/theme-context';

function isToday(ms: number): boolean {
  if (!ms) return false;
  const d = new Date(ms);
  const n = new Date();
  return d.getFullYear() === n.getFullYear() && d.getMonth() === n.getMonth() && d.getDate() === n.getDate();
}

export default function CheckIn() {
  const insets = useSafeAreaInsets();
  const { colors, fonts } = useTheme();
  const styles = useMemo(() => makeStyles(colors, fonts), [colors, fonts]);
  const [people, setPeople] = useState<KnownPerson[]>([]);
  const [caregiver, setCg] = useState(caregiverId());
  const [checkedToday, setCheckedToday] = useState(isToday(lastCheckInAt()));
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetchKnownPeople().then(setPeople);
  }, []);

  const doCheckIn = async () => {
    setBusy(true);
    try {
      await checkIn();
      setCheckedToday(true);
    } finally {
      setBusy(false);
    }
  };

  const chooseCaregiver = async (id: string) => {
    const next = caregiver === id ? '' : id;
    setCg(next);
    await setCaregiver(next || null);
  };

  return (
    <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + spacing.xl }]}>
      <View style={styles.hero}>
        <Ionicons name="heart" size={44} color={colors.danger} />
        <Text style={styles.h1}>Daily check-in</Text>
        <Text style={styles.body}>Let your family know you&apos;re OK with one tap. If you forget for a day, your chosen person gets a gentle reminder to check on you.</Text>
      </View>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="I am okay today"
        onPress={doCheckIn}
        disabled={busy || checkedToday}
        style={({ pressed }) => [checkedToday ? styles.checked : styles.checkBtn, pressed && styles.dim]}
      >
        {busy ? (
          <ActivityIndicator color={colors.textOnDark} />
        ) : (
          <>
            <Ionicons name={checkedToday ? 'checkmark-circle' : 'hand-left'} size={30} color={checkedToday ? colors.accent : colors.textOnDark} />
            <Text style={checkedToday ? styles.checkedText : styles.checkText}>
              {checkedToday ? 'You checked in today' : "I'm OK today"}
            </Text>
          </>
        )}
      </Pressable>

      <Text style={styles.label}>Who should we tell if you miss a day?</Text>
      {people.length === 0 ? (
        <Text style={styles.hint}>Add family or friends first, then choose one here.</Text>
      ) : (
        <View style={styles.card}>
          {people.map((p, i) => (
            <Pressable
              key={p.id}
              accessibilityRole="button"
              accessibilityState={{ selected: caregiver === p.id }}
              onPress={() => chooseCaregiver(p.id)}
              style={[styles.row, i > 0 && styles.divider]}
            >
              <Avatar name={p.name} uri={p.avatar} size={48} />
              <Text style={styles.rowName}>{p.name}</Text>
              <Ionicons
                name={caregiver === p.id ? 'radio-button-on' : 'radio-button-off'}
                size={30}
                color={caregiver === p.id ? colors.primary : colors.border}
              />
            </Pressable>
          ))}
        </View>
      )}
    </ScrollView>
  );
}

function makeStyles(colors: Colors, fonts: Fonts) {
  return StyleSheet.create({
    content: { padding: spacing.lg, gap: spacing.md },
    hero: { alignItems: 'center', gap: spacing.sm },
    h1: { fontSize: fonts.title, fontWeight: '800', color: colors.text, textAlign: 'center' },
    body: { fontSize: fonts.body, color: colors.textMuted, textAlign: 'center', lineHeight: fonts.body + 8 },
    checkBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.sm,
      minHeight: TAP_TARGET + 20,
      borderRadius: radius.lg,
      backgroundColor: colors.accent,
      marginVertical: spacing.sm,
    },
    checkText: { fontSize: fonts.huge - 6, fontWeight: '800', color: colors.textOnDark },
    checked: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.sm,
      minHeight: TAP_TARGET + 20,
      borderRadius: radius.lg,
      borderWidth: 2,
      borderColor: colors.accent,
      backgroundColor: colors.card,
      marginVertical: spacing.sm,
    },
    checkedText: { fontSize: fonts.title, fontWeight: '800', color: colors.accent },
    label: { fontSize: fonts.body, fontWeight: '800', color: colors.text, marginTop: spacing.md },
    hint: { fontSize: fonts.small, color: colors.textMuted },
    card: { backgroundColor: colors.card, borderRadius: radius.lg, borderWidth: 2, borderColor: colors.border, overflow: 'hidden' },
    row: { minHeight: TAP_TARGET + 4, flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.md },
    divider: { borderTopWidth: 2, borderTopColor: colors.border },
    rowName: { flex: 1, fontSize: fonts.body, fontWeight: '700', color: colors.text },
    dim: { opacity: 0.7 },
  });
}
