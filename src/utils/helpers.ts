// Clean, minimal palette — inspired by modern dashboard UIs
export const COLORS = {
  // Backgrounds
  background: '#F0F2F5',
  surface: '#FFFFFF',
  surfaceHigh: '#F5F7FA',
  surfaceHigher: '#E8ECF0',

  // Card surfaces (clean white, no glass)
  glass: '#FFFFFF',
  glassHigh: '#F8F9FC',
  glassBorder: '#E8ECF0',

  // Blue accent
  primary: '#1890FF',
  primaryLight: '#40A9FF',
  primaryDark: '#096DD9',
  primaryGlow: 'rgba(24,144,255,0.10)',

  // Text
  text: '#1F1F1F',
  textSecondary: '#8C8C8C',
  textLight: '#BFBFBF',

  // Borders (subtle)
  border: '#E8ECF0',
  borderLight: '#F0F2F5',

  // Status
  success: '#52C41A',
  warning: '#FAAD14',
  danger: '#FF4D4F',

  // Tracker type colors
  personalColor: '#722ED1',    // Purple
  groupColor: '#52C41A',       // Green
  reimbursementColor: '#EB2F96', // Magenta

  // Semantic aliases
  secondary: '#EB2F96',
};

import { formatCurrencyAmount } from './currencies';

export function formatCurrency(amount: number, currencyCode?: string): string {
  return formatCurrencyAmount(amount, currencyCode);
}

export function formatDate(timestamp: number): string {
  const date = new Date(timestamp);
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const dayDiff = Math.floor(diff / (1000 * 60 * 60 * 24));

  if (dayDiff === 0) {
    return `Today, ${date.toLocaleTimeString('en-IN', {
      hour: '2-digit',
      minute: '2-digit',
    })}`;
  } else if (dayDiff === 1) {
    return 'Yesterday';
  } else if (dayDiff < 7) {
    return date.toLocaleDateString('en-IN', { weekday: 'long' });
  } else {
    return date.toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  }
}

const COLOR_PALETTE = [
  '#722ED1', '#52C41A', '#EB2F96', '#1890FF', '#FAAD14',
  '#13C2C2', '#FA8C16', '#2F54EB', '#FA541C', '#A0D911',
  '#597EF7', '#F759AB',
];

export function getColorForId(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = ((hash << 5) - hash) + id.charCodeAt(i);
    hash = hash & hash;
  }
  return COLOR_PALETTE[Math.abs(hash) % COLOR_PALETTE.length];
}

export function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).substring(2, 11);
}

/** Group transactions by date section (Today, Yesterday, This Week, Earlier) */
export function groupByDate<T extends { timestamp: number }>(items: T[]): { title: string; data: T[] }[] {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const yesterday = today - 86400000;
  const weekAgo = today - 7 * 86400000;

  const groups: Record<string, T[]> = {
    Today: [],
    Yesterday: [],
    'This Week': [],
    Earlier: [],
  };

  for (const item of items) {
    if (item.timestamp >= today) {
      groups.Today.push(item);
    } else if (item.timestamp >= yesterday) {
      groups.Yesterday.push(item);
    } else if (item.timestamp >= weekAgo) {
      groups['This Week'].push(item);
    } else {
      groups.Earlier.push(item);
    }
  }

  return Object.entries(groups)
    .filter(([, data]) => data.length > 0)
    .map(([title, data]) => ({ title, data }));
}
