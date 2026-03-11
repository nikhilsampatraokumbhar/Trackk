export interface User {
  id: string;
  displayName: string;
  phone: string;
  email?: string;
  avatarColor?: string;
  createdAt: number;
}

export type TrackerType = 'personal' | 'group' | 'reimbursement';

export interface TrackerState {
  personal: boolean;
  reimbursement: boolean;
  activeGroupIds: string[];
  groupAffectsGoal: boolean; // Whether group expenses deduct from goal daily budget
}

export interface Transaction {
  id: string;
  userId: string;
  amount: number;
  description: string;
  merchant?: string;
  category?: string;
  source: string;
  rawMessage?: string;
  trackerType: TrackerType;
  groupId?: string;
  receiptUri?: string;
  note?: string;
  tags?: string[];
  timestamp: number;
  createdAt: number;
}

// ─── Budget ──────────────────────────────────────────────────────────────────

export interface Budget {
  id: string;
  category: string; // 'overall' for total budget, or a category name
  amount: number;
  period: 'monthly';
  createdAt: number;
}

export interface GroupMember {
  userId: string;
  displayName: string;
  phone: string;
}

export interface Group {
  id: string;
  name: string;
  members: GroupMember[];
  createdBy: string;
  createdAt: number;
  isTrip?: boolean;
  tripReminderSent?: boolean;
}

export interface Split {
  userId: string;
  displayName: string;
  amount: number;
  settled: boolean;
}

export interface GroupTransaction {
  id: string;
  groupId: string;
  addedBy: string;
  amount: number;
  description: string;
  merchant?: string;
  timestamp: number;
  splits: Split[];
}

export interface Debt {
  fromUserId: string;
  fromName: string;
  toUserId: string;
  toName: string;
  amount: number;
}

export interface ParsedTransaction {
  amount: number;
  type: 'debit' | 'credit';
  merchant?: string;
  bank?: string;
  cardLast4?: string;
  upiId?: string;
  rawMessage: string;
  timestamp: number;
}

export interface ActiveTracker {
  type: TrackerType;
  id: string;
  label: string;
}

// Monthly finance item (custom user-defined expense category)
export interface FinanceItem {
  label: string;
  amount: number;
}

// Savings Goal
export interface SavingsGoal {
  id: string;
  name: string;
  targetAmount: number;
  targetDate: number;
  targetMonths: number;   // user-entered months (1-36)
  salary: number;
  emis: number;
  expenses: number;       // rent + bills
  maintenance: number;
  customFinances?: FinanceItem[]; // additional user-defined expenses
  dailyBudget: number;
  monthlyBudget: number;
  streak: number;
  lastStreakDate: string; // YYYY-MM-DD
  savingsJar: number;    // accumulated uncommitted savings
  totalSaved: number;    // lifetime "I invested this" amount
  createdAt: number;
}

// Daily spend tracking for goals (auto-computed from transactions)
export interface DailySpend {
  date: string; // YYYY-MM-DD
  spent: number;
  baseBudget: number;       // goal's daily budget
  carryover: number;        // leftover carried from previous day
  effectiveBudget: number;  // baseBudget + carryover
  leftover: number;         // effectiveBudget - spent (end of day)
  leftoverAction: 'carry' | 'save' | 'pending'; // what user chose
}

// Savings jar for accumulated leftover savings
export interface SavingsJarEntry {
  date: string;       // YYYY-MM-DD
  amount: number;
  goalId: string;
}

// ─── Premium / Subscription ─────────────────────────────────────────────────

export type PlanId = 'free' | 'premium_monthly' | 'premium_half_yearly' | 'premium_annual' | 'premium_lifetime' | 'family_monthly' | 'family_annual' | 'family_lifetime';

export interface SubscriptionPlan {
  id: PlanId;
  name: string;
  price: number;          // in INR
  period: 'monthly' | 'half_yearly' | 'annual' | 'lifetime' | 'free';
  maxMembers: number;     // 1 for individual plans, 4 for family
  tagline: string;        // clever persuasive copy
  features: string[];
  savings?: string;       // e.g. "Save 40%"
  badge?: string;         // e.g. "MOST POPULAR"
}

export interface UserSubscription {
  planId: PlanId;
  status: 'active' | 'expired' | 'trial';
  startDate: number;
  endDate: number;        // -1 for lifetime
  isFoundingMember: boolean;
  promoCodeUsed?: string;
  familyMembers?: string[];  // user IDs for family plan
  referralCreditsMonths: number;  // free months earned via referrals (max 12)
}

export interface PromoCode {
  code: string;
  type: 'full_access' | 'trial_extend' | 'discount';
  durationDays: number;
  discountPercent?: number;
}

export interface Referral {
  id: string;
  referrerId: string;
  refereePhone: string;
  refereeInstalled: boolean;
  refereeQualified: boolean;  // logged 10 expenses in 14 days
  installDate?: number;
  qualifiedDate?: number;
  rewardClaimed: boolean;
}

export interface ReferralStats {
  totalReferred: number;
  qualified: number;
  freeMonthsEarned: number;
  freeMonthsUsed: number;
  nextMilestone: number;    // referrals needed for next reward
  milestoneReward: string;  // e.g. "6 months free"
}

// Settlement record
export interface Settlement {
  id: string;
  groupId: string;
  fromUserId: string;
  fromName: string;
  toUserId: string;
  toName: string;
  amount: number;
  method: 'upi' | 'cash';
  timestamp: number;
}
