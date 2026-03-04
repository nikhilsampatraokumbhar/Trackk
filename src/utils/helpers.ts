/**
 * Format currency in Indian Rupees.
 */
export function formatCurrency(amount: number): string {
  return `₹${amount.toLocaleString('en-IN', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })}`;
}

/**
 * Format a timestamp to a readable date string.
 */
export function formatDate(timestamp: number): string {
  const date = new Date(timestamp);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) {
    return `Today, ${date.toLocaleTimeString('en-IN', {
      hour: '2-digit',
      minute: '2-digit',
    })}`;
  } else if (diffDays === 1) {
    return 'Yesterday';
  } else if (diffDays < 7) {
    return date.toLocaleDateString('en-IN', { weekday: 'long' });
  } else {
    return date.toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  }
}

/**
 * Generate a consistent color for a user/group based on their ID.
 */
export function getColorForId(id: string): string {
  const colors = [
    '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4',
    '#FFEAA7', '#DDA0DD', '#98D8C8', '#F7DC6F',
    '#BB8FCE', '#85C1E9', '#F8C471', '#82E0AA',
  ];
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = id.charCodeAt(i) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length];
}

/**
 * CRED NeoPOP-inspired dark theme.
 * background  → deep near-black (page background)
 * surface     → dark card surface
 * surfaceElevated → modals / elevated panels
 */
export const COLORS = {
  primary: '#7C6FEF',
  primaryDark: '#5A4FCC',
  secondary: '#FF6584',

  background: '#0A0A14',
  surface: '#13131F',
  surfaceElevated: '#1C1C2C',

  text: '#F2F2FF',
  textSecondary: '#6B6B9A',
  textLight: '#34344C',

  border: '#1E1E30',

  success: '#00E5B4',
  warning: '#F0B429',
  danger: '#FF5252',

  personalColor: '#7C6FEF',
  groupColor: '#00E5B4',
  reimbursementColor: '#FF6584',
};
