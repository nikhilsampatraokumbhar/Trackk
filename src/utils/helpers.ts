// CRED-inspired dark premium color palette
export const COLORS = {
  // Backgrounds (dark, layered)
  background: '#0A0A0F',
  surface: '#111119',
  surfaceHigh: '#18182A',
  surfaceHigher: '#20203A',

  // Gold accent – CRED signature
  primary: '#C9A84C',
  primaryLight: '#E5C46A',
  primaryDark: '#8C7030',
  primaryGlow: 'rgba(201,168,76,0.15)',

  // Text
  text: '#EEEEF6',
  textSecondary: '#6A6A8E',
  textLight: '#2E2E50',

  // Borders
  border: '#1E1E38',
  borderLight: '#14142A',

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
