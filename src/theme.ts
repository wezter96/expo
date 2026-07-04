/**
 * Kinly design tokens.
 *
 * The whole app is tuned for older eyes and hands:
 *  - Large type (never below 18pt for body, 22pt+ for anything tappable)
 *  - High contrast text on solid backgrounds
 *  - Big touch targets (minimum 64pt tall buttons, generous spacing)
 *  - A small, warm palette so nothing feels busy
 */
export const colors = {
  // Brand
  primary: '#0B5FA5', // calm, high-contrast blue
  primaryDark: '#08477C',
  accent: '#2E9E5B', // green = "go" / call / send

  // Surfaces
  background: '#F4F6F9',
  card: '#FFFFFF',
  bubbleMine: '#0B5FA5',
  bubbleTheirs: '#E6EBF1',

  // Text
  text: '#12203A',
  textOnDark: '#FFFFFF',
  textMuted: '#5A6B85',

  // Feedback
  danger: '#C0392B',
  warning: '#B8860B',
  border: '#D3DAE3',
};

export const fonts = {
  huge: 40,
  title: 30,
  heading: 24,
  body: 20,
  button: 24,
  small: 17,
};

export const spacing = {
  xs: 6,
  sm: 12,
  md: 18,
  lg: 26,
  xl: 36,
};

export const radius = {
  sm: 12,
  md: 18,
  lg: 26,
  pill: 999,
};

/** Minimum height for anything the user must tap. */
export const TAP_TARGET = 64;

/** A rotating set of friendly avatar background colors, chosen by name. */
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
