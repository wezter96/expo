/**
 * Kinly design tokens.
 *
 * Tuned for older eyes and hands: large type, high contrast, big touch targets.
 * Colors and font sizes are theme-aware (light/dark + adjustable text size) via
 * ThemeProvider / useTheme (see theme-context.tsx). The static `colors`/`fonts`
 * exports below are the light-mode defaults (used as a fallback).
 */

export type Colors = {
  primary: string;
  primaryDark: string;
  accent: string;
  background: string;
  card: string;
  bubbleMine: string;
  bubbleTheirs: string;
  text: string;
  textOnDark: string;
  textMuted: string;
  danger: string;
  warning: string;
  border: string;
};

export const lightColors: Colors = {
  primary: '#0B5FA5',
  primaryDark: '#08477C',
  accent: '#2E9E5B',
  background: '#F4F6F9',
  card: '#FFFFFF',
  bubbleMine: '#0B5FA5',
  bubbleTheirs: '#E6EBF1',
  text: '#12203A',
  textOnDark: '#FFFFFF',
  textMuted: '#5A6B85',
  danger: '#C0392B',
  warning: '#B8860B',
  border: '#D3DAE3',
};

export const darkColors: Colors = {
  primary: '#2B84D8',
  primaryDark: '#0B3C66',
  accent: '#37B26A',
  background: '#0E1621',
  card: '#1A2634',
  bubbleMine: '#1E5C93',
  bubbleTheirs: '#22303F',
  text: '#F1F5FA',
  textOnDark: '#FFFFFF',
  textMuted: '#9FB0C4',
  danger: '#E05B4B',
  warning: '#E0A93B',
  border: '#33455A',
};

export type Fonts = {
  huge: number;
  title: number;
  heading: number;
  body: number;
  button: number;
  small: number;
};

const BASE_FONTS: Fonts = { huge: 40, title: 30, heading: 24, body: 20, button: 24, small: 17 };

/** Text size options. */
export type TextSize = 'normal' | 'large' | 'xlarge';
export const TEXT_SCALES: Record<TextSize, number> = { normal: 1, large: 1.15, xlarge: 1.3 };

export function scaledFonts(scale: number): Fonts {
  return {
    huge: Math.round(BASE_FONTS.huge * scale),
    title: Math.round(BASE_FONTS.title * scale),
    heading: Math.round(BASE_FONTS.heading * scale),
    body: Math.round(BASE_FONTS.body * scale),
    button: Math.round(BASE_FONTS.button * scale),
    small: Math.round(BASE_FONTS.small * scale),
  };
}

// Light-mode defaults (fallback for any code path outside a ThemeProvider).
export const colors = lightColors;
export const fonts = BASE_FONTS;

export const spacing = { xs: 6, sm: 12, md: 18, lg: 26, xl: 36 };
export const radius = { sm: 12, md: 18, lg: 26, pill: 999 };

/** Minimum height for anything the user must tap. */
export const TAP_TARGET = 64;

export const avatarColors = [
  '#0B5FA5',
  '#2E9E5B',
  '#B8860B',
  '#7D3C98',
  '#C0392B',
  '#16A085',
  '#D35400',
  '#2C3E50',
];

export function colorForName(name: string): string {
  let sum = 0;
  for (let i = 0; i < name.length; i++) sum += name.charCodeAt(i);
  return avatarColors[sum % avatarColors.length];
}

export function initialsForName(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
