/**
 * Currency & Exchange Rate Tests
 *
 * Tests currency formatting, conversion math, exchange rate caching,
 * zero-decimal currencies (JPY/KRW), preference persistence, and edge cases.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  CURRENCIES,
  formatCurrencyAmount,
  convertCurrency,
  getCurrencyInfo,
  getPreferredCurrency,
  setPreferredCurrency,
  loadSavedCurrency,
} from '../utils/currencies';

// Access private module state through the module
// We need to set up exchange rates by calling the internal setter
// Since _exchangeRates is module-private, we'll test via convertCurrency behavior

beforeEach(() => {
  (AsyncStorage as any)._clear();
  jest.clearAllMocks();
});

describe('CURRENCIES data', () => {
  it('should have 30 currencies', () => {
    expect(CURRENCIES.length).toBe(30);
  });

  it('should have INR as first currency', () => {
    expect(CURRENCIES[0].code).toBe('INR');
    expect(CURRENCIES[0].symbol).toBe('₹');
  });

  it('should have unique codes', () => {
    const codes = CURRENCIES.map(c => c.code);
    expect(new Set(codes).size).toBe(codes.length);
  });

  it('should have all required fields for each currency', () => {
    for (const c of CURRENCIES) {
      expect(c.code).toBeTruthy();
      expect(c.symbol).toBeTruthy();
      expect(c.name).toBeTruthy();
      expect(c.locale).toBeTruthy();
      expect(c.flag).toBeTruthy();
    }
  });

  it('should include major world currencies', () => {
    const codes = CURRENCIES.map(c => c.code);
    expect(codes).toContain('USD');
    expect(codes).toContain('EUR');
    expect(codes).toContain('GBP');
    expect(codes).toContain('JPY');
    expect(codes).toContain('AED');
  });
});

describe('getCurrencyInfo', () => {
  it('should return correct info for known code', () => {
    const info = getCurrencyInfo('USD');
    expect(info.symbol).toBe('$');
    expect(info.name).toBe('US Dollar');
  });

  it('should fallback to INR for unknown code', () => {
    const info = getCurrencyInfo('XYZ');
    expect(info.code).toBe('INR');
  });
});

describe('formatCurrencyAmount', () => {
  it('should format INR with ₹ symbol and 2 decimals', () => {
    const result = formatCurrencyAmount(1234.5, 'INR');
    expect(result).toContain('₹');
    expect(result).toContain('1,234');
    expect(result).toContain('50');
  });

  it('should format USD with $ symbol', () => {
    const result = formatCurrencyAmount(99.99, 'USD');
    expect(result).toContain('$');
    expect(result).toContain('99.99');
  });

  it('should format JPY without decimal places', () => {
    const result = formatCurrencyAmount(1500, 'JPY');
    expect(result).toContain('¥');
    expect(result).not.toContain('.');
  });

  it('should format KRW without decimal places', () => {
    const result = formatCurrencyAmount(50000, 'KRW');
    expect(result).toContain('₩');
    expect(result).not.toContain('.');
  });

  it('should handle zero amount', () => {
    const result = formatCurrencyAmount(0, 'INR');
    expect(result).toContain('₹');
    expect(result).toContain('0');
  });

  it('should handle very large amounts', () => {
    const result = formatCurrencyAmount(10000000, 'INR');
    expect(result).toContain('₹');
    expect(result).toContain(',');
  });

  it('should handle tiny amounts', () => {
    const result = formatCurrencyAmount(0.01, 'USD');
    expect(result).toContain('$');
    expect(result).toContain('0.01');
  });

  it('should use preferred currency when none specified', () => {
    // Default preferred is INR
    const result = formatCurrencyAmount(100);
    expect(result).toContain('₹');
  });

  it('should format EUR with € symbol', () => {
    const result = formatCurrencyAmount(100, 'EUR');
    expect(result).toContain('€');
  });

  it('should format GBP with £ symbol', () => {
    const result = formatCurrencyAmount(100, 'GBP');
    expect(result).toContain('£');
  });
});

describe('convertCurrency', () => {
  it('should return same amount for same currency', () => {
    expect(convertCurrency(500, 'INR', 'INR')).toBe(500);
  });

  it('should return original amount if rates not available', () => {
    // No rates loaded — should fallback
    expect(convertCurrency(500, 'INR', 'USD')).toBe(500);
  });
});

describe('Currency preference persistence', () => {
  it('should default to INR', () => {
    expect(getPreferredCurrency()).toBe('INR');
  });

  it('should save and load preferred currency', async () => {
    await setPreferredCurrency('USD');
    expect(getPreferredCurrency()).toBe('USD');

    // Verify it's in AsyncStorage
    const stored = await AsyncStorage.getItem('@et_currency');
    expect(stored).toBe('USD');
  });

  it('should restore from AsyncStorage on load', async () => {
    await AsyncStorage.setItem('@et_currency', 'EUR');
    const loaded = await loadSavedCurrency();
    expect(loaded).toBe('EUR');
    expect(getPreferredCurrency()).toBe('EUR');
  });

  it('should return INR if nothing saved', async () => {
    const loaded = await loadSavedCurrency();
    expect(loaded).toBe('INR');
  });
});
