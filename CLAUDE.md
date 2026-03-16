# Trackk — Project Documentation & Instructions

## Overview
Trackk is a React Native expense tracking app with personal expense tracking, group splitting, subscriptions, investments, EMIs, and savings goals. It supports both local (AsyncStorage) and cloud (Firebase) storage with authentication.

---

## Free Launch Strategy

All premium features are currently **free for everyone** to drive user adoption. This is controlled in two places:

### 1. Premium Access (`src/store/PremiumContext.tsx`)
- `isPremium` is hardcoded to `true` — all users get premium access
- `checkFeatureAccess()` always returns `true` — no feature gating
- To **re-enable premium gating**: revert `isPremium` to use the subscription check logic and restore `checkFeatureAccess` conditions

### 2. Premium UI in Profile (`src/screens/ProfileScreen.tsx`)
- `SHOW_PREMIUM_UI = false` hides the subscription card, refer & earn, and family upsell sections
- To **show premium UI again**: set `SHOW_PREMIUM_UI = true`
- The code is NOT deleted — just hidden behind the flag, so it can be restored instantly

---

## Internationalization (i18n)

### Setup
- Libraries: `i18next`, `react-i18next`, `react-native-localize`
- Config: `src/i18n/index.ts`
- Translations: `src/i18n/locales/<lang>.ts`

### Supported Languages (10)
| Code | Language | Region |
|------|----------|--------|
| en | English | Global |
| hi | Hindi | India |
| ta | Tamil | India |
| te | Telugu | India |
| kn | Kannada | India |
| bn | Bengali | India |
| mr | Marathi | India |
| es | Spanish | International |
| fr | French | International |
| de | German | International |

### Language Detection Priority
1. Saved preference in AsyncStorage (`@et_language`)
2. Device locale (via `react-native-localize`)
3. Fallback: English

### How to Add a New Language
1. Create `src/i18n/locales/<code>.ts` — copy `en.ts` structure, translate all strings
2. Add the language to `SUPPORTED_LANGUAGES` array in `src/i18n/index.ts`
3. Add the resource import in `src/i18n/index.ts` resources object

### Migration Status
- Translation keys exist in all locale files
- **ProfileScreen** uses `useTranslation()` for language/currency picker labels
- **Other screens still use hardcoded English strings** — full migration to `t()` calls is pending
- To migrate a screen: `import { useTranslation } from 'react-i18next'`, call `const { t } = useTranslation()`, replace hardcoded strings with `t('key')`

---

## Multi-Currency Support

### Architecture (`src/utils/currencies.ts`)
- 30 currencies supported with code, symbol, name, locale, and flag
- Key currencies: INR, USD, EUR, GBP, AED, SAR, SGD, AUD, CAD, JPY, CNY, KRW, THB, MYR, IDR, BRL, MXN, ZAR, CHF, SEK, NPR, LKR, BDT, PKR, NGN, EGP, TRY, RUB, PHP, VND

### Currency Formatting
- `formatCurrencyAmount(amount, currencyCode?)` — formats with proper locale and symbol
- `formatCurrency()` in `src/utils/helpers.ts` delegates to `formatCurrencyAmount()` for backward compatibility
- All 26+ files that import `formatCurrency` continue to work unchanged

### Exchange Rates
- Source: `api.frankfurter.app` (free, no API key required)
- Cache: 12 hours in AsyncStorage (`@et_exchange_rates`)
- Conversion: via USD intermediary rate (`convertCurrency(amount, fromCode, toCode)`)
- Rates fetched on app start in `App.tsx`

### User Preference
- Stored in AsyncStorage (`@et_preferred_currency`)
- Picker available in Profile screen
- Group transactions store their currency in `transaction.currency` field

---

## Debt Reminders (`src/services/DebtReminderService.ts`)

### Design Philosophy
Reminders are intentionally **subtle and non-annoying**. They use friendly language and heavy throttling.

### Throttling Rules
- **Max 2 reminders per day** across all groups
- **Max 1 reminder per group per week**
- **Time window: 10am–8pm only** (no late night/early morning notifications)
- **Minimum debt age: 3 days** (new expenses don't trigger reminders)
- **Skip trivial amounts** < ₹1 equivalent
- **Low importance Android channel** — no sound, no heads-up display

### Message Templates (4 rotating)
Friendly tone like "No rush!" and "Settle when convenient" — never aggressive.

### Snooze
- `snoozeGroupReminder(groupId, days)` — suppress reminders for a specific group
- `clearReminderState()` — reset all reminder state (call on sign out)

### Trigger
Reminders are checked in `App.tsx` useEffect when user is authenticated, after groups and debts are loaded.

---

## Group Expense Features

### Categories (`src/utils/categories.ts`)
- `GROUP_CATEGORIES`: Food & Drinks, Groceries, Transport, Stay, Shopping, Entertainment, Utilities, Rent, Tickets, Other
- Each has an emoji icon
- Shown as horizontal scroll chips in SplitEditorScreen and GroupDetailScreen edit modal

### Notes
- Free-text note field on group transactions
- Shown in italic below the transaction subtitle in GroupDetailScreen

### Data Model (`src/models/types.ts` — GroupTransaction)
```typescript
note?: string;      // Free-text expense note
category?: string;  // Category label from GROUP_CATEGORIES
currency?: string;  // ISO 4217 currency code
```

---

## Key Files

| File | Purpose |
|------|---------|
| `App.tsx` | Entry point, initializes i18n, currency, exchange rates, debt reminders |
| `src/store/PremiumContext.tsx` | Premium/subscription state (currently all free) |
| `src/store/GroupContext.tsx` | Group state management, CRUD operations |
| `src/store/AuthContext.tsx` | Authentication state |
| `src/i18n/index.ts` | i18n configuration and language management |
| `src/utils/currencies.ts` | Multi-currency formatting and exchange rates |
| `src/utils/categories.ts` | Personal and group expense categories |
| `src/utils/helpers.ts` | Shared utilities (formatCurrency, COLORS, etc.) |
| `src/services/DebtReminderService.ts` | Subtle debt notification system |
| `src/services/SyncService.ts` | Firebase cloud sync operations |
| `src/services/StorageService.ts` | Local AsyncStorage operations |
| `src/services/DebtCalculator.ts` | Group debt calculation logic |
| `src/navigation/AppNavigator.tsx` | Navigation structure and tab bar |

---

## Tech Stack
- React Native (with native stack navigation)
- TypeScript
- Firebase (auth + Firestore for cloud sync)
- AsyncStorage (local persistence + caching)
- `@notifee/react-native` (notifications)
- `i18next` + `react-i18next` (internationalization)
- `react-native-localize` (device locale detection)

---

## Important Notes
- The app supports both offline (local-only) and online (cloud-synced) modes
- Cloud sync uses Firebase Firestore with real-time listeners for group transactions
- Caching strategy: load from AsyncStorage cache first for instant UI, then refresh from cloud
- The `SplitEditorScreen` is the main screen for adding group expenses (with category, note, currency)
- The `GroupDetailScreen` shows group transactions and supports inline editing
