/**
 * Kinly design tokens — the "Serene Connect" system.
 *
 * Personality: reliability, warmth, clarity, tuned for intergenerational use.
 * Deep Trust Blue primary on Warm Cloud White, high-contrast text, generous
 * spacing, and the Atkinson Hyperlegible typeface (designed for low vision).
 * See DESIGN.md. Colors/fonts are theme-aware via ThemeProvider / useTheme.
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

// Light — Serene Connect
export const lightColors: Colors = {
  primary: '#1A4B84', // Deep Trust Blue
  primaryDark: '#003466',
  accent: '#059669', // emerald — confirm / accept / send
  background: '#F8F9FA', // Warm Cloud White (surface)
  card: '#FFFFFF', // surface-container-lowest
  bubbleMine: '#1A4B84',
  bubbleTheirs: '#E8F0F8', // soft blue tint (secondary)
  text: '#191C1D', // on-surface
  textOnDark: '#FFFFFF',
  textMuted: '#424750', // on-surface-variant
  danger: '#BA1A1A', // error
  warning: '#D97706', // warm amber accent
  border: '#C3C6D1', // outline-variant
};

// Dark — derived to keep the same hues with calm, low-glare surfaces
export const darkColors: Colors = {
  primary: '#5A9BE8',
  primaryDark: '#0B3C66',
  accent: '#2FB673',
  background: '#0F1620',
  card: '#1A2430',
  bubbleMine: '#1E4E86',
  bubbleTheirs: '#233140',
  text: '#EDEEF0',
  textOnDark: '#FFFFFF',
  textMuted: '#A9B6C6',
  danger: '#E0655A',
  warning: '#E0A040',
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

// Oversized type scale (base body 20 for easy reading without zooming).
export const BASE_FONTS: Fonts = { huge: 34, title: 28, heading: 24, body: 20, button: 22, small: 16 };

/** Global typeface (Atkinson Hyperlegible), loaded in the root layout. */
export const fontFamily = {
  regular: 'AtkinsonHyperlegible_400Regular',
  bold: 'AtkinsonHyperlegible_700Bold',
};

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

// Light-mode defaults (fallback outside a ThemeProvider).
export const colors = lightColors;
export const fonts = BASE_FONTS;

// 8px baseline grid; 24px container padding; large gaps between sections.
export const spacing = { xs: 8, sm: 12, md: 16, lg: 24, xl: 40 };
export const radius = { sm: 8, md: 12, lg: 16, pill: 9999 };

/** Minimum height for anything the user must tap (spec floor is 56). */
export const TAP_TARGET = 64;

/**
 * Unread-count badge background. A deeper emerald than `accent` so the small
 * white count digits clear WCAG AA (4.5:1) — the standard accent green only
 * reaches ~3.8:1, which is fine for large button labels but not badge text.
 * Self-contained (white on this green) so it holds in both light and dark.
 */
export const UNREAD_BADGE = '#047857'; // white text ≈ 5.5:1

export const avatarColors = [
  '#1A4B84',
  '#059669',
  '#D97706',
  '#7D3C98',
  '#BA1A1A',
  '#0E7490',
  '#B45309',
  '#334155',
];

// Brighter variants for use as *text* on dark surfaces, where the avatar
// colors above are too dark to read. Same order/index as avatarColors.
const nameColorsDark = [
  '#7FB0EE',
  '#4ECB8E',
  '#F0B44E',
  '#C79BE6',
  '#F0897F',
  '#4FC3D6',
  '#E0A55E',
  '#A9B6C6',
];

function nameIndex(name: string): number {
  let sum = 0;
  for (let i = 0; i < name.length; i++) sum += name.charCodeAt(i);
  return sum % avatarColors.length;
}

export function colorForName(name: string): string {
  return avatarColors[nameIndex(name)];
}

/** A per-person color safe to use as text, brightened on dark backgrounds. */
export function nameColorForName(name: string, dark = false): string {
  return (dark ? nameColorsDark : avatarColors)[nameIndex(name)];
}

export function initialsForName(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
