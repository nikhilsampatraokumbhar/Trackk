/**
 * Trackk Design System
 *
 * Formalized typography scale, spacing tokens, shadow presets,
 * border radii, and component-level style primitives.
 *
 * Usage: import { TYPOGRAPHY, SPACING, RADIUS, SHADOWS } from '../utils/theme';
 */

import { Platform, TextStyle, ViewStyle } from 'react-native';
import { COLORS } from './helpers';

// ─── Typography Scale ────────────────────────────────────────────────────────
// Named sizes inspired by t-shirt sizing. Each entry defines fontSize + lineHeight.

export const FONT_SIZE = {
  /** 10px — micro labels, badges, letter-spacing heavy */
  micro: 10,
  /** 11px — hints, helper text, timestamps */
  xs: 11,
  /** 12px — secondary labels, badge text */
  sm: 12,
  /** 13px — body small, feature descriptions */
  body_sm: 13,
  /** 14px — body default, list items */
  body: 14,
  /** 15px — button text, emphasized body */
  body_lg: 15,
  /** 16px — section headers, nav titles */
  subtitle: 16,
  /** 18px — card titles, sub-headings */
  title_sm: 18,
  /** 20px — screen section titles */
  title: 20,
  /** 24px — large headings */
  title_lg: 24,
  /** 28px — hero headings */
  hero: 28,
  /** 32px — pricing numbers, big stats */
  display: 32,
} as const;

export const LINE_HEIGHT = {
  micro: 14,
  xs: 15,
  sm: 16,
  body_sm: 18,
  body: 20,
  body_lg: 22,
  subtitle: 22,
  title_sm: 24,
  title: 26,
  title_lg: 30,
  hero: 34,
  display: 38,
} as const;

export const FONT_WEIGHT = {
  regular: '400' as TextStyle['fontWeight'],
  medium: '500' as TextStyle['fontWeight'],
  semibold: '600' as TextStyle['fontWeight'],
  bold: '700' as TextStyle['fontWeight'],
  extrabold: '800' as TextStyle['fontWeight'],
  black: '900' as TextStyle['fontWeight'],
};

/** Pre-built text style presets */
export const TYPOGRAPHY = {
  // Display / Hero
  hero: {
    fontSize: FONT_SIZE.hero,
    lineHeight: LINE_HEIGHT.hero,
    fontWeight: FONT_WEIGHT.extrabold,
    color: COLORS.text,
    letterSpacing: -0.5,
  } as TextStyle,

  display: {
    fontSize: FONT_SIZE.display,
    lineHeight: LINE_HEIGHT.display,
    fontWeight: FONT_WEIGHT.extrabold,
    color: COLORS.text,
    letterSpacing: -0.5,
  } as TextStyle,

  // Titles
  titleLg: {
    fontSize: FONT_SIZE.title_lg,
    lineHeight: LINE_HEIGHT.title_lg,
    fontWeight: FONT_WEIGHT.extrabold,
    color: COLORS.text,
    letterSpacing: -0.3,
  } as TextStyle,

  title: {
    fontSize: FONT_SIZE.title,
    lineHeight: LINE_HEIGHT.title,
    fontWeight: FONT_WEIGHT.extrabold,
    color: COLORS.text,
  } as TextStyle,

  titleSm: {
    fontSize: FONT_SIZE.title_sm,
    lineHeight: LINE_HEIGHT.title_sm,
    fontWeight: FONT_WEIGHT.bold,
    color: COLORS.text,
  } as TextStyle,

  subtitle: {
    fontSize: FONT_SIZE.subtitle,
    lineHeight: LINE_HEIGHT.subtitle,
    fontWeight: FONT_WEIGHT.bold,
    color: COLORS.text,
  } as TextStyle,

  // Body
  bodyLg: {
    fontSize: FONT_SIZE.body_lg,
    lineHeight: LINE_HEIGHT.body_lg,
    fontWeight: FONT_WEIGHT.semibold,
    color: COLORS.text,
  } as TextStyle,

  body: {
    fontSize: FONT_SIZE.body,
    lineHeight: LINE_HEIGHT.body,
    fontWeight: FONT_WEIGHT.semibold,
    color: COLORS.text,
  } as TextStyle,

  bodySm: {
    fontSize: FONT_SIZE.body_sm,
    lineHeight: LINE_HEIGHT.body_sm,
    fontWeight: FONT_WEIGHT.medium,
    color: COLORS.textSecondary,
  } as TextStyle,

  // Small / Captions
  caption: {
    fontSize: FONT_SIZE.sm,
    lineHeight: LINE_HEIGHT.sm,
    fontWeight: FONT_WEIGHT.semibold,
    color: COLORS.textSecondary,
  } as TextStyle,

  label: {
    fontSize: FONT_SIZE.micro,
    lineHeight: LINE_HEIGHT.micro,
    fontWeight: FONT_WEIGHT.bold,
    color: COLORS.textSecondary,
    letterSpacing: 1,
    textTransform: 'uppercase',
  } as TextStyle,

  hint: {
    fontSize: FONT_SIZE.xs,
    lineHeight: LINE_HEIGHT.xs,
    fontWeight: FONT_WEIGHT.medium,
    color: COLORS.textLight,
  } as TextStyle,
} as const;

// ─── Spacing Scale ───────────────────────────────────────────────────────────
// 4px base with common multipliers. Use SPACING.md for default padding, etc.

export const SPACING = {
  /** 2px */  xxs: 2,
  /** 4px */  xs: 4,
  /** 6px */  sm: 6,
  /** 8px */  md: 8,
  /** 10px */ _10: 10,
  /** 12px */ lg: 12,
  /** 14px */ _14: 14,
  /** 16px */ xl: 16,
  /** 20px */ xxl: 20,
  /** 24px */ _24: 24,
  /** 28px */ _28: 28,
  /** 32px */ _32: 32,
  /** 36px */ _36: 36,
  /** 40px */ _40: 40,
  /** 48px */ _48: 48,
} as const;

// ─── Border Radii ────────────────────────────────────────────────────────────

export const RADIUS = {
  /** 4px — tiny badges */
  xs: 4,
  /** 6px — small tags */
  sm: 6,
  /** 8px — inputs, inner elements */
  md: 8,
  /** 12px — buttons, small cards */
  lg: 12,
  /** 14px — standard cards */
  xl: 14,
  /** 16px — elevated cards */
  xxl: 16,
  /** 20px — hero cards, modals */
  card: 20,
  /** 24px — bottom sheets, large cards */
  sheet: 24,
  /** 9999 — pills, circular */
  full: 9999,
} as const;

// ─── Shadow Presets ──────────────────────────────────────────────────────────

export const SHADOWS = {
  /** Subtle shadow for cards */
  card: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 3,
  } as ViewStyle,

  /** Medium shadow for floating elements */
  elevated: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
    elevation: 6,
  } as ViewStyle,

  /** Heavy shadow for FABs, modals */
  heavy: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 16,
    elevation: 10,
  } as ViewStyle,

  /** Glow effect using primary color */
  glow: {
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 8,
  } as ViewStyle,

  /** Success glow */
  successGlow: {
    shadowColor: COLORS.success,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
    elevation: 6,
  } as ViewStyle,

  /** No shadow */
  none: {
    shadowColor: 'transparent',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0,
    shadowRadius: 0,
    elevation: 0,
  } as ViewStyle,
} as const;

// ─── Component-Level Style Primitives ────────────────────────────────────────

/** Standard card container style */
export const CARD_STYLE: ViewStyle = {
  backgroundColor: COLORS.glass,
  borderRadius: RADIUS.card,
  padding: SPACING.xl,
  borderWidth: 1,
  borderColor: COLORS.border,
};

/** Elevated card with stronger background */
export const CARD_ELEVATED_STYLE: ViewStyle = {
  backgroundColor: COLORS.glassHigh,
  borderRadius: RADIUS.card,
  padding: SPACING.xl,
  borderWidth: 1,
  borderColor: COLORS.glassBorder,
  ...SHADOWS.card,
};

/** Standard screen horizontal padding */
export const SCREEN_PADDING = SPACING._24;

/** Hit slop for small touch targets */
export const HIT_SLOP = { top: 10, bottom: 10, left: 10, right: 10 };
