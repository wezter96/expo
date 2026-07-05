import { Ionicons } from '@expo/vector-icons';
import React, { useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { type Colors, type Fonts, radius, spacing, TAP_TARGET } from '../src/theme';
import { type ThemeMode, useTheme } from '../src/theme-context';
import { type TextSize } from '../src/theme';

const SIZES: { key: TextSize; label: string }[] = [
  { key: 'normal', label: 'Normal' },
  { key: 'large', label: 'Large' },
  { key: 'xlarge', label: 'Extra large' },
];

const MODES: { key: ThemeMode; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { key: 'light', label: 'Light', icon: 'sunny' },
  { key: 'dark', label: 'Dark', icon: 'moon' },
  { key: 'auto', label: 'Automatic', icon: 'contrast' },
];

export default function Display() {
  const insets = useSafeAreaInsets();
  const { colors, fonts, mode, setMode, textSize, setTextSize } = useTheme();
  const styles = useMemo(() => makeStyles(colors, fonts), [colors, fonts]);

  return (
    <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + spacing.xl }]}>
      <Text style={styles.label}>Text size</Text>
      <View style={styles.card}>
        {SIZES.map((s, i) => (
          <Pressable
            key={s.key}
            accessibilityRole="button"
            accessibilityState={{ selected: textSize === s.key }}
            onPress={() => setTextSize(s.key)}
            style={[styles.row, i > 0 && styles.divider]}
          >
            <Text style={[styles.rowLabel, s.key === 'large' && styles.big, s.key === 'xlarge' && styles.bigger]}>
              {s.label}
            </Text>
            <Ionicons
              name={textSize === s.key ? 'radio-button-on' : 'radio-button-off'}
              size={30}
              color={textSize === s.key ? colors.primary : colors.border}
            />
          </Pressable>
        ))}
      </View>

      <Text style={styles.label}>Appearance</Text>
      <View style={styles.card}>
        {MODES.map((m, i) => (
          <Pressable
            key={m.key}
            accessibilityRole="button"
            accessibilityState={{ selected: mode === m.key }}
            onPress={() => setMode(m.key)}
            style={[styles.row, i > 0 && styles.divider]}
          >
            <Ionicons name={m.icon} size={26} color={colors.primary} />
            <Text style={styles.rowLabel}>{m.label}</Text>
            <Ionicons
              name={mode === m.key ? 'radio-button-on' : 'radio-button-off'}
              size={30}
              color={mode === m.key ? colors.primary : colors.border}
            />
          </Pressable>
        ))}
      </View>

      <Text style={styles.hint}>Kinly also follows your phone&apos;s text size setting.</Text>
    </ScrollView>
  );
}

function makeStyles(colors: Colors, fonts: Fonts) {
  return StyleSheet.create({
    content: { padding: spacing.md, gap: spacing.sm },
    label: { fontSize: fonts.body, fontWeight: '800', color: colors.text, marginTop: spacing.md },
    card: { backgroundColor: colors.card, borderRadius: radius.lg, borderWidth: 2, borderColor: colors.border, overflow: 'hidden' },
    row: { minHeight: TAP_TARGET + 4, flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.md },
    divider: { borderTopWidth: 2, borderTopColor: colors.border },
    rowLabel: { flex: 1, fontSize: fonts.body, fontWeight: '700', color: colors.text },
    big: { fontSize: fonts.body + 6 },
    bigger: { fontSize: fonts.body + 12 },
    hint: { fontSize: fonts.small, color: colors.textMuted, marginTop: spacing.md, textAlign: 'center' },
  });
}
