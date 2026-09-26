// CLSL AI Design System — Colours, typography, spacing
// Derived from the existing web app's CSS custom properties

export const Colors = {
  // Primary greens (brand)
  primary: '#1f6b43',
  primaryLight: '#28865a',
  primaryDark: '#165232',
  primaryFaint: '#e8f5ee',

  // Accent / highlights
  accent: '#e8a838',
  accentLight: '#fdf3e0',

  // Backgrounds
  background: '#fffefa',
  backgroundDark: '#0f1a14',
  card: '#ffffff',
  cardDark: '#1a2e22',

  // Text
  text: '#1a2e22',
  textSecondary: '#4a6e56',
  textMuted: '#8fa898',
  textOnPrimary: '#ffffff',
  textDark: '#e8f5ee',
  textSecondaryDark: '#a8c8b4',

  // Borders
  border: '#d4e4da',
  borderDark: '#2a4e36',

  // Status
  success: '#22c55e',
  warning: '#f59e0b',
  error: '#ef4444',
  info: '#3b82f6',

  // Overlay
  overlay: 'rgba(15, 26, 20, 0.5)',

  // Shadows (used as shadow color)
  shadow: 'rgba(31, 107, 67, 0.08)',
} as const;

export const Typography = {
  // Font sizes
  xs: 11,
  sm: 13,
  base: 15,
  md: 17,
  lg: 20,
  xl: 24,
  xxl: 30,
  hero: 36,

  // Font weights (as strings for RN)
  light: '300' as const,
  regular: '400' as const,
  medium: '500' as const,
  semibold: '600' as const,
  bold: '700' as const,
  extrabold: '800' as const,
} as const;

export const Spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  base: 16,
  lg: 20,
  xl: 24,
  xxl: 32,
  xxxl: 48,
} as const;

export const Radius = {
  sm: 6,
  md: 10,
  lg: 14,
  xl: 20,
  full: 999,
} as const;
