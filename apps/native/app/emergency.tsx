import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Avatar } from '../src/components/Avatar';
import { useStore } from '../src/store';
import { type Colors, type Fonts, radius, spacing } from '../src/theme';
import { useTheme } from '../src/theme-context';

export default function Emergency() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { contacts, emergencyId, setEmergency } = useStore();
  const { colors, fonts } = useTheme();
  const styles = useMemo(() => makeStyles(colors, fonts), [colors, fonts]);

  const people = contacts.filter((c) => !c.isGroup);

  return (
    <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + spacing.xl }]}>
      <View style={styles.intro}>
        <Ionicons name="alert-circle" size={44} color={colors.danger} />
        <Text style={styles.title}>Emergency contact</Text>
        <Text style={styles.body}>
          Choose one person to reach fast. A big red button on your Messages screen will message and
          call them right away.
        </Text>
      </View>

      {people.map((c) => {
        const selected = c.id === emergencyId;
        return (
          <Pressable
            key={c.id}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            onPress={() => {
              setEmergency(selected ? null : c.id);
            }}
            style={({ pressed }) => [styles.row, selected && styles.rowSelected, pressed && styles.pressed]}
          >
            <Avatar name={c.name} uri={c.avatar} size={56} />
            <View style={styles.rowText}>
              <Text style={styles.name}>{c.name}</Text>
              <Text style={styles.relation}>{c.relation || c.phone}</Text>
            </View>
            <Ionicons
              name={selected ? 'checkmark-circle' : 'ellipse-outline'}
              size={32}
              color={selected ? colors.danger : colors.border}
            />
          </Pressable>
        );
      })}

      {emergencyId ? (
        <Pressable
          accessibilityRole="button"
          onPress={() => {
            setEmergency(null);
          }}
          style={({ pressed }) => [styles.clear, pressed && styles.pressed]}
        >
          <Text style={styles.clearText}>Remove emergency contact</Text>
        </Pressable>
      ) : null}

      <Pressable onPress={() => router.back()} style={({ pressed }) => [styles.done, pressed && styles.pressed]}>
        <Text style={styles.doneText}>Done</Text>
      </Pressable>
    </ScrollView>
  );
}

function makeStyles(colors: Colors, fonts: Fonts) {
  return StyleSheet.create({
  content: { padding: spacing.md, gap: spacing.sm },
  intro: { alignItems: 'center', gap: spacing.xs, paddingVertical: spacing.md },
  title: { fontSize: fonts.title, fontWeight: '800', color: colors.text },
  body: { fontSize: fonts.body, color: colors.textMuted, textAlign: 'center', lineHeight: fonts.body + 8 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 2,
    borderColor: colors.border,
    padding: spacing.md,
  },
  rowSelected: { borderColor: colors.danger },
  pressed: { opacity: 0.7 },
  rowText: { flex: 1 },
  name: { fontSize: fonts.body + 1, fontWeight: '700', color: colors.text },
  relation: { fontSize: fonts.small, color: colors.textMuted },
  clear: { alignItems: 'center', paddingVertical: spacing.md },
  clearText: { fontSize: fonts.body, color: colors.danger, fontWeight: '700' },
  done: {
    marginTop: spacing.md,
    minHeight: 60,
    backgroundColor: colors.primary,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  doneText: { fontSize: fonts.button, fontWeight: '800', color: colors.textOnDark },
  });
}
