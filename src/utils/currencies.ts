/**
 * Multi-currency support with exchange rate conversion.
 * Exchange rates are cached and refreshed periodically.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

const CURRENCY_PREF_KEY = '@et_currency';
const RATES_KEY = '@et_exchange_rates';
const RATES_TIMESTAMP_KEY = '@et_rates_timestamp';
const RATE_CACHE_HOURS = 12;

export interface CurrencyInfo {
  code: string;       // ISO 4217
  symbol: string;
  name: string;
  locale: string;     // For number formatting
  flag: string;
}

export const CURRENCIES: CurrencyInfo[] = [
  { code: 'INR', symbol: '₹', name: 'Indian Rupee', locale: 'en-IN', flag: '🇮🇳' },
  { code: 'USD', symbol: '$', name: 'US Dollar', locale: 'en-US', flag: '🇺🇸' },
  { code: 'EUR', symbol: '€', name: 'Euro', locale: 'de-DE', flag: '🇪🇺' },
  { code: 'GBP', symbol: '£', name: 'British Pound', locale: 'en-GB', flag: '🇬🇧' },
  { code: 'AED', symbol: 'د.إ', name: 'UAE Dirham', locale: 'ar-AE', flag: '🇦🇪' },
  { code: 'SAR', symbol: '﷼', name: 'Saudi Riyal', locale: 'ar-SA', flag: '🇸🇦' },
  { code: 'SGD', symbol: 'S$', name: 'Singapore Dollar', locale: 'en-SG', flag: '🇸🇬' },
  { code: 'AUD', symbol: 'A$', name: 'Australian Dollar', locale: 'en-AU', flag: '🇦🇺' },
  { code: 'CAD', symbol: 'C$', name: 'Canadian Dollar', locale: 'en-CA', flag: '🇨🇦' },
  { code: 'JPY', symbol: '¥', name: 'Japanese Yen', locale: 'ja-JP', flag: '🇯🇵' },
  { code: 'CNY', symbol: '¥', name: 'Chinese Yuan', locale: 'zh-CN', flag: '🇨🇳' },
  { code: 'KRW', symbol: '₩', name: 'South Korean Won', locale: 'ko-KR', flag: '🇰🇷' },
  { code: 'THB', symbol: '฿', name: 'Thai Baht', locale: 'th-TH', flag: '🇹🇭' },
  { code: 'MYR', symbol: 'RM', name: 'Malaysian Ringgit', locale: 'ms-MY', flag: '🇲🇾' },
  { code: 'IDR', symbol: 'Rp', name: 'Indonesian Rupiah', locale: 'id-ID', flag: '🇮🇩' },
  { code: 'BRL', symbol: 'R$', name: 'Brazilian Real', locale: 'pt-BR', flag: '🇧🇷' },
  { code: 'MXN', symbol: 'MX$', name: 'Mexican Peso', locale: 'es-MX', flag: '🇲🇽' },
  { code: 'ZAR', symbol: 'R', name: 'South African Rand', locale: 'en-ZA', flag: '🇿🇦' },
  { code: 'CHF', symbol: 'CHF', name: 'Swiss Franc', locale: 'de-CH', flag: '🇨🇭' },
  { code: 'SEK', symbol: 'kr', name: 'Swedish Krona', locale: 'sv-SE', flag: '🇸🇪' },
  { code: 'NPR', symbol: 'रू', name: 'Nepalese Rupee', locale: 'ne-NP', flag: '🇳🇵' },
  { code: 'LKR', symbol: 'Rs', name: 'Sri Lankan Rupee', locale: 'si-LK', flag: '🇱🇰' },
  { code: 'BDT', symbol: '৳', name: 'Bangladeshi Taka', locale: 'bn-BD', flag: '🇧🇩' },
  { code: 'PKR', symbol: 'Rs', name: 'Pakistani Rupee', locale: 'ur-PK', flag: '🇵🇰' },
  { code: 'NGN', symbol: '₦', name: 'Nigerian Naira', locale: 'en-NG', flag: '🇳🇬' },
  { code: 'EGP', symbol: 'E£', name: 'Egyptian Pound', locale: 'ar-EG', flag: '🇪🇬' },
  { code: 'TRY', symbol: '₺', name: 'Turkish Lira', locale: 'tr-TR', flag: '🇹🇷' },
  { code: 'RUB', symbol: '₽', name: 'Russian Ruble', locale: 'ru-RU', flag: '🇷🇺' },
  { code: 'PHP', symbol: '₱', name: 'Philippine Peso', locale: 'en-PH', flag: '🇵🇭' },
  { code: 'VND', symbol: '₫', name: 'Vietnamese Dong', locale: 'vi-VN', flag: '🇻🇳' },
];

let _preferredCurrency: string = 'INR';
let _exchangeRates: Record<string, number> = {}; // Rates relative to USD

/**
 * Get current preferred currency code
 */
export function getPreferredCurrency(): string {
  return _preferredCurrency;
}

/**
 * Get currency info by code
 */
export function getCurrencyInfo(code: string): CurrencyInfo {
  return CURRENCIES.find(c => c.code === code) || CURRENCIES[0];
}

/**
 * Load saved currency preference
 */
export async function loadSavedCurrency(): Promise<string> {
  try {
    const saved = await AsyncStorage.getItem(CURRENCY_PREF_KEY);
    if (saved) {
      _preferredCurrency = saved;
      return saved;
    }
  } catch {}
  return 'INR';
}

/**
 * Change preferred currency
 */
export async function setPreferredCurrency(code: string): Promise<void> {
  _preferredCurrency = code;
  await AsyncStorage.setItem(CURRENCY_PREF_KEY, code);
}

/**
 * Format amount in a specific currency (or preferred currency if not specified)
 */
export function formatCurrencyAmount(amount: number, currencyCode?: string): string {
  const code = currencyCode || _preferredCurrency;
  const info = getCurrencyInfo(code);

  try {
    return `${info.symbol}${amount.toLocaleString(info.locale, {
      minimumFractionDigits: code === 'JPY' || code === 'KRW' ? 0 : 2,
      maximumFractionDigits: code === 'JPY' || code === 'KRW' ? 0 : 2,
    })}`;
  } catch {
    return `${info.symbol}${amount.toFixed(2)}`;
  }
}

/**
 * Fetch and cache exchange rates from a free API.
 * Uses frankfurter.app (free, no API key needed).
 */
export async function fetchExchangeRates(): Promise<void> {
  try {
    // Check cache freshness
    const tsStr = await AsyncStorage.getItem(RATES_TIMESTAMP_KEY);
    if (tsStr) {
      const ts = parseInt(tsStr, 10);
      if (Date.now() - ts < RATE_CACHE_HOURS * 60 * 60 * 1000) {
        const cached = await AsyncStorage.getItem(RATES_KEY);
        if (cached) {
          _exchangeRates = JSON.parse(cached);
          return;
        }
      }
    }

    const response = await fetch('https://api.frankfurter.app/latest?from=USD');
    if (response.ok) {
      const data = await response.json();
      _exchangeRates = { USD: 1, ...data.rates };
      await AsyncStorage.setItem(RATES_KEY, JSON.stringify(_exchangeRates));
      await AsyncStorage.setItem(RATES_TIMESTAMP_KEY, String(Date.now()));
    }
  } catch {
    // Use cached rates or fallback
    try {
      const cached = await AsyncStorage.getItem(RATES_KEY);
      if (cached) _exchangeRates = JSON.parse(cached);
    } catch {}
  }
}

/**
 * Convert amount from one currency to another using cached rates.
 * Returns the original amount if conversion isn't possible.
 */
export function convertCurrency(amount: number, fromCode: string, toCode: string): number {
  if (fromCode === toCode) return amount;
  if (!_exchangeRates[fromCode] || !_exchangeRates[toCode]) return amount;

  // Convert to USD first, then to target
  const inUSD = amount / _exchangeRates[fromCode];
  return Math.round(inUSD * _exchangeRates[toCode] * 100) / 100;
}
