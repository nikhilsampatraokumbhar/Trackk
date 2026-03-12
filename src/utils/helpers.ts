// Clean dark palette — inspired by modern finance apps
export const COLORS = {
  // Backgrounds (deep dark, layered)
  background: '#0A0A0F',
  surface: '#141418',
  surfaceHigh: '#1C1C22',
  surfaceHigher: '#262630',

  // Card surfaces (solid dark gray, no transparency)
  glass: '#1A1A20',
  glassHigh: '#222228',
  glassBorder: '#2A2A32',

  // Warm orange accent
  primary: '#E8734A',
  primaryLight: '#F09070',
  primaryDark: '#C05A35',
  primaryGlow: 'rgba(232,115,74,0.15)',

  // Text
  text: '#F0F0F5',
  textSecondary: '#7A7A90',
  textLight: '#4A4A5C',

  // Borders (subtle solid)
  border: '#1E1E26',
  borderLight: '#161620',

  // Status
  success: '#3CB882',
  warning: '#E8C06A',
  danger: '#E0505E',

  // Tracker type colors
  personalColor: '#8A78F0',    // Soft purple
  groupColor: '#3CB882',       // Muted green
  reimbursementColor: '#E07888', // Salmon pink

  // Semantic aliases kept for backwards compat
  secondary: '#E07888',
};

export function formatCurrency(amount: number): string {
  return `₹${amount.toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
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
  '#8A78F0', '#3CB882', '#E07888', '#45A8D4', '#E8B84A',
  '#DD70A0', '#6BCFC0', '#D4A853', '#70B0F0', '#F0886A',
  '#88C870', '#C878E8',
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
