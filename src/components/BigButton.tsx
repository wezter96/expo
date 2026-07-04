import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, fonts, radius, spacing, TAP_TARGET } from '../theme';

type Props = {
  label: string;
  onPress: () => void;
  icon?: keyof typeof Ionicons.glyphMap;
  /** Visual weight. primary = blue, success = green, neutral = white card, danger = red. */
  variant?: 'primary' | 'success' | 'neutral' | 'danger';
  sublabel?: string;
  loading?: boolean;
  disabled?: boolean;
};

const VARIANTS = {
  primary: { bg: colors.primary, fg: colors.textOnDark, sub: '#D6E5F5' },
  success: { bg: colors.accent, fg: colors.textOnDark, sub: '#D6F0DF' },
  danger: { bg: colors.danger, fg: colors.textOnDark, sub: '#F5D6D2' },
  neutral: { bg: colors.card, fg: colors.text, sub: colors.textMuted },
} as const;

export function BigButton({
  label,
  onPress,
  icon,
  variant = 'primary',
  sublabel,
  loading = false,
  disabled = false,
}: Props) {
  const v = VARIANTS[variant];
  const isNeutral = variant === 'neutral';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={sublabel ? `${label}. ${sublabel}` : label}
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: v.bg },
        isNeutral && styles.neutralBorder,
        pressed && styles.pressed,
        (disabled || loading) && styles.disabled,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={v.fg} size="large" />
      ) : (
        <>
          {icon && (
            <View style={styles.iconWrap}>
              <Ionicons name={icon} size={38} color={v.fg} />
            </View>
          )}
          <View style={styles.textWrap}>
            <Text style={[styles.label, { color: v.fg }]}>{label}</Text>
            {sublabel ? <Text style={[styles.sublabel, { color: v.sub }]}>{sublabel}</Text> : null}
          </View>
        </>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    minHeight: TAP_TARGET + 20,
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.lg,
    gap: spacing.md,
  },
  neutralBorder: { borderWidth: 2, borderColor: colors.border },
  pressed: { opacity: 0.75, transform: [{ scale: 0.99 }] },
  disabled: { opacity: 0.5 },
  iconWrap: { width: 44, alignItems: 'center' },
  textWrap: { flex: 1 },
  label: { fontSize: fonts.button, fontWeight: '800' },
  sublabel: { fontSize: fonts.small, marginTop: 2, fontWeight: '600' },
});
