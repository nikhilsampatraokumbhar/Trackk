// Hume-inspired glassmorphic dark palette
export const COLORS = {
  // Backgrounds (deep dark, layered glassmorphism)
  background: '#0A0A0F',
  surface: '#131318',
  surfaceHigh: '#1C1C24',
  surfaceHigher: '#25252F',

  // Glass overlay tints (use for glassmorphic cards)
  glass: 'rgba(255,255,255,0.05)',
  glassHigh: 'rgba(255,255,255,0.08)',
  glassBorder: 'rgba(255,255,255,0.08)',

  // Warm orange accent — Hume signature
  primary: '#E8734A',
  primaryLight: '#F09070',
  primaryDark: '#C05A35',
  primaryGlow: 'rgba(232,115,74,0.15)',

  // Text
  text: '#F0F0F5',
  textSecondary: '#8A8A9E',
  textLight: '#555568',

  // Borders (subtle, glassmorphic)
  border: 'rgba(255,255,255,0.06)',
  borderLight: 'rgba(255,255,255,0.03)',

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
