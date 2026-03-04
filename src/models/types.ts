// ── Core Data Types ──

export interface User {
  id: string;
  displayName: string;
  phone: string;
  email?: string;
  createdAt: number;
}

// Which sections the user has tracking enabled for
export interface TrackerState {
  personal: boolean;
  reimbursement: boolean;
  activeGroupIds: string[]; // group IDs with tracking ON
  // iOS only: Gmail account for personal tracker
  gmailEmail?: string;
  lastEmailPollAt?: number;
  // iOS only: Outlook/Microsoft account for reimbursement tracker (corporate cards)
  outlookEmail?: string;
  lastOutlookPollAt?: number;
}

export type TrackerType = 'personal' | 'group' | 'reimbursement';

export interface Transaction {
  id: string;
  userId: string;
  amount: number;
  description: string;
  merchant?: string;
  category?: string;
  source: 'sms' | 'email' | 'manual';
  rawMessage?: string; // original SMS/email text
  trackerType: TrackerType;
  groupId?: string; // only if trackerType === 'group'
  timestamp: number;
  createdAt: number;
  billImageUrl?: string; // Firebase Storage URL of attached bill photo (reimbursement only)
}

// ── Group Types ──

export interface Group {
  id: string;
  name: string;
  members: GroupMember[];
  createdBy: string;
  createdAt: number;
}

export interface GroupMember {
  userId: string;
  displayName: string;
  phone: string;
}

export interface GroupTransaction {
  id: string;
  groupId: string;
  addedBy: string; // userId who added/paid
  amount: number;
  description: string;
  merchant?: string;
  timestamp: number;
  splits: Split[];
}

export interface Split {
  userId: string;
  displayName: string;
  amount: number; // how much this person owes
  settled: boolean;
}

// Simplified debt: A owes B some amount
export interface Debt {
  fromUserId: string;
  fromName: string;
  toUserId: string;
  toName: string;
  amount: number;
}

// ── SMS / Notification Types ──

// Parsed result from an incoming SMS or bank email
export interface ParsedTransaction {
  amount: number;
  type: 'debit' | 'credit';
  merchant?: string;
  bank?: string;
  cardLast4?: string;
  upiId?: string;
  rawMessage: string;
  timestamp: number;
  source?: 'sms' | 'email'; // defaults to 'sms' if omitted
}

// What we show in the notification for user to act on
export interface TransactionCandidate {
  parsed: ParsedTransaction;
  activeTrackers: ActiveTracker[];
}

export interface ActiveTracker {
  type: TrackerType;
  id: string; // 'personal', 'reimbursement', or groupId
  label: string; // 'Personal', 'Reimbursement', or group name
}

// ── Goals / Savings Types ──

export interface FinancialProfile {
  salary: number;            // monthly take-home
  emiTotal: number;          // monthly EMIs
  fixedExpenses: number;     // rent, utilities, groceries average
  maintenanceAvg: number;    // bike/car maintenance average
  miscAvg: number;           // everything else average
}

export interface SavingsGoal {
  id: string;
  userId: string;
  name: string;              // e.g., "Spain Trip"
  targetAmount: number;      // e.g., 400000
  deadlineMonth: number;     // JS month timestamp (start of target month)
  createdAt: number;
  // Computed from FinancialProfile — stored for persistence
  monthlyBudget: number;     // daily spend limit * 30 (tracked expenses only)
  // Streak tracking
  streak: number;            // consecutive days within budget
  lastStreakDate: string;    // YYYY-MM-DD of last checked day
  todaySpent: number;        // how much tracked spending today
  // Rolling carry-over for the current month
  monthStartDate: string;    // YYYY-MM-DD of month start
  monthBudgetUsed: number;   // cumulative tracked spend this month
  resetAt?: number;          // timestamp of last manual reset
}

// ── Navigation Types ──

export type RootStackParamList = {
  MainTabs: undefined;
  GroupDetail: { groupId: string };
  CreateGroup: undefined;
  TransactionDetail: { transactionId: string; trackerType: TrackerType };
  TrackerSettings: undefined;
  GroupSummary: { groupId: string };
  SettleDebt: { groupId: string; fromUserId: string; toUserId: string; toName: string; amount: number };
};

export type MainTabParamList = {
  Home: undefined;
  Personal: undefined;
  Groups: undefined;
  Goals: undefined;
  Reimbursement: undefined;
};

// Auth screens (outside main tabs)
export type AuthStackParamList = {
  Login: undefined;
  OTPVerify: { phone: string };
};
