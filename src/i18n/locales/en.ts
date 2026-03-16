export default {
  // ─── Common ──────────────────────────────────────────────
  common: {
    save: 'Save',
    cancel: 'Cancel',
    delete: 'Delete',
    edit: 'Edit',
    done: 'Done',
    back: 'Back',
    next: 'Next',
    ok: 'OK',
    yes: 'Yes',
    no: 'No',
    loading: 'Loading...',
    error: 'Error',
    success: 'Success',
    retry: 'Retry',
    search: 'Search',
    add: 'Add',
    remove: 'Remove',
    share: 'Share',
    settings: 'Settings',
    today: 'Today',
    yesterday: 'Yesterday',
    thisWeek: 'This Week',
    earlier: 'Earlier',
  },

  // ─── Navigation / Tabs ───────────────────────────────────
  tabs: {
    home: 'Home',
    personal: 'Personal',
    groups: 'Groups',
    insights: 'Insights',
    profile: 'Profile',
  },

  // ─── Home Screen ─────────────────────────────────────────
  home: {
    greeting: 'Good {{timeOfDay}}, {{name}}',
    morning: 'morning',
    afternoon: 'afternoon',
    evening: 'evening',
    todaySpend: "Today's Spend",
    monthSpend: 'This Month',
    quickAdd: 'Quick Add',
    reviewExpenses: 'Review Expenses',
    noTransactions: 'No transactions yet',
    startTracking: 'Start tracking your expenses',
  },

  // ─── Groups ──────────────────────────────────────────────
  groups: {
    title: 'Groups',
    newGroup: 'New Group',
    noGroups: 'No groups yet',
    createFirst: 'Create a group to split expenses with friends',
    allSettled: 'All settled up',
    youOwe: 'You owe {{amount}}',
    youAreOwed: 'You are owed {{amount}}',
    settleUp: 'Settle up',
    addExpense: 'Add expense',
    expenses: '{{count}} expenses',
    trackGroup: 'Track for this group',
    trackGroupSub: 'Auto-detect payments and split equally',
  },

  // ─── Split Editor ────────────────────────────────────────
  split: {
    amount: 'Amount',
    description: 'Description',
    descriptionPlaceholder: 'e.g. Dinner at BBQ Nation, Groceries...',
    addNote: 'Add a note',
    notePlaceholder: 'Add a note for context...',
    category: 'Category',
    splitType: 'Split Type',
    equal: 'Equal',
    byAmount: 'By Amount',
    whosIn: "Who's in?",
    selectedOf: '{{selected}} of {{total}} selected',
    each: '{{amount}} each',
    confirmSplit: 'Confirm Split',
    splitWays: 'split {{count}} ways',
    addGuest: 'Add a guest',
    guestHint: 'One-time, tagged to a member',
    noteOptional: 'Note (Optional)',
  },

  // ─── Settlements ─────────────────────────────────────────
  settle: {
    selectBalance: 'Select a balance to settle',
    settlePayment: 'Settle Payment',
    payTo: 'Pay to {{name}}',
    totalDebt: 'Total Debt',
    settleAmount: 'Settle Amount',
    fullSettlement: 'Full Settlement',
    partial: 'Partial · Remaining: {{amount}}',
    payUPI: 'Pay via UPI / Card',
    opensPaymentApp: 'Opens your payment app',
    settledByCash: 'Settled by Cash',
    markAsPaid: 'Mark as paid in cash',
    wasPaymentDone: 'Was the payment done?',
    yesPaymentDone: 'Yes, Payment Done',
    markAsSettled: 'Mark as settled',
    noPaymentFailed: 'No, Payment Failed',
    dontMark: "Don't mark as settled",
  },

  // ─── Profile ─────────────────────────────────────────────
  profile: {
    title: 'Profile',
    editName: 'tap to edit',
    verified: 'Verified',
    subscription: 'Subscription',
    referEarn: 'Refer & Earn',
    emailDetection: 'Email Transaction Detection',
    emailPrivacy: 'We only connect your email if you allow us to — and only for detecting transaction alerts. Your data stays private, is never shared, and you can disconnect and delete it anytime.',
    connect: 'Connect',
    disconnect: 'Disconnect',
    notConnected: 'Not connected',
    privacy: 'Privacy & Data',
    dataSafe: 'Your data is safe',
    privacyDesc: 'Trackk uses event-driven SMS detection — it only wakes up when a new bank SMS arrives. No background polling, no battery drain.',
    about: 'About',
    appVersion: 'App Version',
    signOut: 'Sign Out',
    signOutConfirm: 'Are you sure you want to sign out? Your local data will remain on this device.',
    language: 'Language',
    currency: 'Currency',
  },

  // ─── Insights ────────────────────────────────────────────
  insights: {
    title: 'Insights',
    thisMonth: 'This Month',
    allTime: 'All Time',
    topCategories: 'Top Categories',
    recurring: 'Recurring Payments',
    trends: 'Spending Trends',
  },

  // ─── Goals ───────────────────────────────────────────────
  goals: {
    title: 'Savings Goals',
    newGoal: 'New Goal',
    dailyBudget: 'Daily Budget',
    streak: 'Streak',
    saved: 'Saved',
    target: 'Target',
  },

  // ─── Subscriptions / EMIs / Investments ──────────────────
  trackers: {
    subscriptions: 'Subscriptions',
    investments: 'Investments',
    emis: 'EMIs & Loans',
    sync: 'Sync',
    monthly: 'Monthly',
    yearly: 'Yearly',
    active: 'Active',
    noItems: 'No items found',
    scanTip: "We'll scan your SMS and connected email for {{type}}",
  },

  // ─── Debt Reminders ──────────────────────────────────────
  reminders: {
    title: 'Settlement Reminder',
    gentle1: 'Hey, just a gentle nudge — you have {{amount}} pending with {{name}}',
    gentle2: 'Quick reminder: {{amount}} outstanding in {{name}}. No rush!',
    gentle3: 'FYI — {{name}} has {{amount}} unsettled. Settle when convenient',
    gentle4: 'Friendly reminder: {{amount}} pending in {{name}}',
  },

  // ─── Currency ────────────────────────────────────────────
  currency: {
    title: 'Currency',
    searchPlaceholder: 'Search currencies...',
  },
};
