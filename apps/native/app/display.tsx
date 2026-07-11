import { Ionicons } from '@expo/vector-icons';
import React, { useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { type LangPref, useTranslation } from '../src/i18n';
import { useStore } from '../src/store';
import { type Colors, type Fonts, radius, spacing, TAP_TARGET } from '../src/theme';
import { type ThemeMode, useTheme } from '../src/theme-context';
import { type TextSize } from '../src/theme';

const SIZES: { key: TextSize; labelKey: string }[] = [
  { key: 'normal', labelKey: 'display.normal' },
  { key: 'large', labelKey: 'display.large' },
  { key: 'xlarge', labelKey: 'display.xlarge' },
];

const MODES: { key: ThemeMode; labelKey: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { key: 'light', labelKey: 'display.light', icon: 'sunny' },
  { key: 'dark', labelKey: 'display.dark', icon: 'moon' },
  { key: 'auto', labelKey: 'display.auto', icon: 'contrast' },
];

const LANGS: { key: LangPref; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { key: 'system', label: 'display.langSystem', icon: 'phone-portrait' },
  { key: 'en', label: 'English', icon: 'globe' },
  { key: 'sv', label: 'Svenska', icon: 'globe' },
];

export default function Display() {
  const insets = useSafeAreaInsets();
  const { colors, fonts, mode, setMode, textSize, setTextSize } = useTheme();
  const { t, pref, setPref } = useTranslation();
  const { simpleMode, setSimpleMode } = useStore();
  const styles = useMemo(() => makeStyles(colors, fonts), [colors, fonts]);

  return (
    <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + spacing.xl }]}>
      <Text style={styles.label}>{t('display.textSize')}</Text>
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
              {t(s.labelKey)}
            </Text>
            <Ionicons
              name={textSize === s.key ? 'radio-button-on' : 'radio-button-off'}
              size={30}
              color={textSize === s.key ? colors.primary : colors.border}
            />
          </Pressable>
        ))}
      </View>

      <Text style={styles.label}>{t('display.appearance')}</Text>
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
            <Text style={styles.rowLabel}>{t(m.labelKey)}</Text>
            <Ionicons
              name={mode === m.key ? 'radio-button-on' : 'radio-button-off'}
              size={30}
              color={mode === m.key ? colors.primary : colors.border}
            />
          </Pressable>
        ))}
      </View>

      <Text style={styles.label}>{t('display.simpleMode')}</Text>
      <View style={styles.card}>
        <View style={styles.row}>
          <Ionicons name="grid" size={26} color={colors.primary} />
          <View style={styles.rowGrow}>
            <Text style={styles.rowLabel}>{t('display.simpleMode')}</Text>
            <Text style={styles.rowHint}>{t('display.simpleModeHint')}</Text>
          </View>
          <Switch value={simpleMode} onValueChange={setSimpleMode} />
        </View>
      </View>

      <Text style={styles.label}>{t('display.language')}</Text>
      <View style={styles.card}>
        {LANGS.map((l, i) => (
          <Pressable
            key={l.key}
            accessibilityRole="button"
            accessibilityState={{ selected: pref === l.key }}
            onPress={() => setPref(l.key)}
            style={[styles.row, i > 0 && styles.divider]}
          >
            <Ionicons name={l.icon} size={26} color={colors.primary} />
            <Text style={styles.rowLabel}>{l.key === 'system' ? t(l.label) : l.label}</Text>
            <Ionicons
              name={pref === l.key ? 'radio-button-on' : 'radio-button-off'}
              size={30}
              color={pref === l.key ? colors.primary : colors.border}
            />
          </Pressable>
        ))}
      </View>
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
    rowGrow: { flex: 1 },
    rowHint: { fontSize: fonts.small, color: colors.textMuted, marginTop: 2 },
    big: { fontSize: fonts.body + 6 },
    bigger: { fontSize: fonts.body + 12 },
    hint: { fontSize: fonts.small, color: colors.textMuted, marginTop: spacing.md, textAlign: 'center' },
  });
}
