/** Quick-pick expense categories for manual entry */
export interface Category {
  label: string;
  icon: string;
}

export const PERSONAL_CATEGORIES: Category[] = [
  { label: 'Food', icon: '🍔' },
  { label: 'Auto/Cab', icon: '🛺' },
  { label: 'Coffee', icon: '☕' },
  { label: 'Groceries', icon: '🛒' },
  { label: 'Shopping', icon: '🛍️' },
  { label: 'Medical', icon: '💊' },
];

export const REIMBURSEMENT_CATEGORIES: Category[] = [
  { label: 'Cab to office', icon: '🚕' },
  { label: 'Client lunch', icon: '🍽️' },
  { label: 'Office supplies', icon: '📎' },
  { label: 'Travel', icon: '✈️' },
  { label: 'Team outing', icon: '🎉' },
  { label: 'Software', icon: '💻' },
];
