/**
 * Kinly design tokens — the "Evergreen" system.
 *
 * Personality: reliability, warmth, clarity, tuned for intergenerational use.
 * Deep Evergreen primary on warm paper white, high-contrast text, generous
 * spacing, and the Atkinson Hyperlegible typeface (designed for low vision).
 *
 * Two UI styles share the same hue family and differ in *presence*:
 *  - 'normal' ("Modern"): quiet, refined — subtle borders that read as
 *    hairlines, softer muted tones, slightly compact type.
 *  - 'simple' ("Easy"): the chunky, high-contrast look — strong outlines,
 *    darker secondary text, slightly larger type. Recommended for 65+.
 *
 * See DESIGN.md. Colors/fonts are theme-aware via ThemeProvider / useTheme.
 */

export type UiStyle = 'normal' | 'simple';

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

// Light — shared Evergreen hues; per-style contrast treatment below.
const lightBase = {
  primary: '#1A5D43', // Deep Evergreen
  primaryDark: '#0C3D2A',
  accent: '#0E8A5F', // confirm / accept / send
  card: '#FFFFFF',
  bubbleMine: '#1A5D43',
  text: '#171D19',
  textOnDark: '#FFFFFF',
  danger: '#BA1A1A',
  warning: '#D97706',
};

const lightByStyle: Record<UiStyle, Colors> = {
  normal: {
    ...lightBase,
    background: '#F6F7F5', // warm paper
    bubbleTheirs: '#EEF3EF',
    textMuted: '#5C6A61',
    border: '#E4E9E4', // whisper outline — cards read as soft surfaces
  },
  simple: {
    ...lightBase,
    background: '#F4F6F4',
    bubbleTheirs: '#E4EEE7',
    textMuted: '#3F4C44', // darker for stronger contrast
    border: '#AEBFB4', // strong outline — everything clearly delineated
  },
};

// Dark — calm, low-glare surfaces with the same treatment split.
const darkBase = {
  // Mid evergreen: light enough to read as a tint on dark surfaces, dark
  // enough to carry white text when used as a header/button background.
  primary: '#2E9E6B',
  primaryDark: '#0C3D2A',
  accent: '#2FA874',
  bubbleMine: '#1F5B41',
  text: '#E9EEE9',
  textOnDark: '#FFFFFF',
  danger: '#E0655A',
  warning: '#E0A040',
};

const darkByStyle: Record<UiStyle, Colors> = {
  normal: {
    ...darkBase,
    background: '#0D1410',
    card: '#161E18',
    bubbleTheirs: '#1D2822',
    textMuted: '#98A89D',
    border: '#26312A',
  },
  simple: {
    ...darkBase,
    background: '#0F1512',
    card: '#1A241D',
    bubbleTheirs: '#243129',
    textMuted: '#B4C2B8',
    border: '#465A4E',
  },
};

/** The palette for a theme + UI-style combination. */
export function colorsFor(dark: boolean, style: UiStyle): Colors {
  return (dark ? darkByStyle : lightByStyle)[style];
}

// Back-compat aliases (the chunky "simple" treatment, the original default).
export const lightColors: Colors = lightByStyle.simple;
export const darkColors: Colors = darkByStyle.simple;

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

/** Per-style type density: Modern sits slightly compact, Easy slightly larger. */
export const STYLE_FONT_FACTOR: Record<UiStyle, number> = { normal: 0.95, simple: 1.05 };

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
  '#1A5D43',
  '#0E7490',
  '#D97706',
  '#7D3C98',
  '#BA1A1A',
  '#166E9C',
  '#B45309',
  '#334155',
];

// Brighter variants for use as *text* on dark surfaces, where the avatar
// colors above are too dark to read. Same order/index as avatarColors.
const nameColorsDark = [
  '#5FCF9B',
  '#4FC3D6',
  '#F0B44E',
  '#C79BE6',
  '#F0897F',
  '#6FB8E8',
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
