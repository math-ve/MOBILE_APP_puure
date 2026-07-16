export const colors = {
  // Brand Navy
  navy: '#233056',
  navyDark: '#0e0e52',
  navyDeep: '#08153d',

  // Blue UI
  blue: '#2764FF',
  blueMid: '#2F6BFF',
  blueFooter: '#3863F6',
  bluePale: '#E1EAFF',
  blueMedium: '#7098FF',

  // Accent — anciennement lime #C9FF00, remplacé par le bleu primaire (le nom de token est conservé)
  lime: '#2764FF',
  limeLight: '#E1EAFF',

  // Status
  success: '#1EBB6E',
  error: '#e32c2b',
  warning: '#ff5c00',
  warningYellow: '#f0c417',

  // Neutrals
  background: '#f3f4ff',
  backgroundAlt: '#f4f4f4',
  white: '#ffffff',
  border: '#DEE5F0',
  inputBg: '#F6F8FC',

  // Text
  textPrimary: '#233056',
  textMid: '#3D5278',
  textLight: '#8A9BBF',
  textXLight: '#b0bcd4',
}

export const typography = {
  fontFamily: {
    regular: 'InstrumentSans_400Regular',
    medium: 'InstrumentSans_500Medium',
    semiBold: 'InstrumentSans_600SemiBold',
    bold: 'InstrumentSans_700Bold',
  },
  size: {
    xs: 11,
    sm: 13,
    base: 15,
    md: 16,
    lg: 18,
    xl: 22,
    '2xl': 24,
    '3xl': 28,
    '4xl': 32,
    '5xl': 40,
  },
  letterSpacing: {
    heading: -0.02,
    caps: 0.08,
  },
  lineHeight: {
    tight: 1.2,
    normal: 1.5,
    relaxed: 1.6,
  },
}

export const radius = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  '2xl': 24,
  '3xl': 32,
  pill: 60,
  full: 9999,
}

export const spacing = {
  1: 4,
  2: 8,
  3: 12,
  4: 16,
  5: 20,
  6: 24,
  8: 32,
  10: 40,
  12: 48,
  16: 64,
  20: 80,
  24: 96,
}

export const shadows = {
  light: {
    shadowColor: '#233056',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  medium: {
    shadowColor: '#233056',
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.10,
    shadowRadius: 15,
    elevation: 6,
  },
  strong: {
    shadowColor: '#04163f',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.12,
    shadowRadius: 40,
    elevation: 12,
  },
  card: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 16,
    elevation: 4,
  },
}

export const animation = {
  fast: 150,
  standard: 200,
  slow: 500,
  easing: {
    standard: [0.4, 0, 0.22, 1] as const,
    bounce: [0.34, 1.56, 0.64, 1] as const,
    modal: [0.16, 1, 0.3, 1] as const,
  },
}

export const theme = { colors, typography, radius, spacing, shadows, animation }
export default theme

// Legacy aliases — keep existing imports working during migration
export const Colors = {
  accent: colors.blueFooter,
  accentHover: colors.blue,
  ctaBlue: colors.blue,
  presentation: colors.blueMedium,
  ink: colors.navyDeep,
  heading: colors.navyDeep,
  navy: colors.navy,
  body: colors.textMid,
  muted: colors.textLight,
  placeholder: colors.textXLight,
  background: colors.backgroundAlt,
  backgroundSoft: colors.background,
  backgroundAccent: colors.bluePale,
  white: colors.white,
  dark: '#141414',
  btnPrimaryBg: '#1a1a1a',
  btnPrimaryText: colors.white,
  btnSecondaryBg: colors.warningYellow,
  btnSecondaryText: '#1a1a1a',
  lime: colors.lime,
  limeText: '#0b0b0f',
  success: colors.success,
  warning: colors.warningYellow,
  error: colors.error,
  border: colors.border,
  borderLight: 'rgba(0,0,0,0.06)',
} as const

export const Typography = {
  sizes: {
    xs: 10,
    sm: 12,
    base: 14,
    md: 16,
    lg: 18,
    xl: 20,
    '2xl': 24,
    '3xl': 28,
    '4xl': 32,
    '5xl': 46,
  },
  weights: {
    regular: '400' as const,
    medium: '500' as const,
    semibold: '600' as const,
    bold: '700' as const,
  },
  lineHeights: {
    tight: 1.2,
    base: 1.5,
    body: 1.6,
  },
  letterSpacing: {
    heading: -0.56,
    normal: 0,
    wide: 1.4,
  },
} as const

export const Spacing = {
  1: 4, 2: 8, 3: 12, 4: 16, 5: 20,
  6: 24, 7: 28, 8: 32, 10: 40, 12: 48, 16: 64, 20: 80,
} as const

export const Radius = {
  input: 8,
  card: 20,
  section: 24,
  button: 14,
  buttonTheme: 60,
  badge: 20,
  pill: 999,
  sm: 4,
} as const

export const Shadows = {
  card: {
    shadowColor: '#111827',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.06,
    shadowRadius: 16,
    elevation: 3,
  },
  button: {
    shadowColor: '#2764FF',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
    elevation: 4,
  },
  buttonTheme: {
    shadowColor: '#1a1a1a',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18,
    shadowRadius: 10,
    elevation: 3,
  },
} as const
