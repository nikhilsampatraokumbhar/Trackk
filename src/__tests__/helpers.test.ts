import { formatCurrency, formatDate, getColorForId, generateId, COLORS } from '../utils/helpers';

describe('helpers', () => {
  describe('COLORS', () => {
    it('should have all required color keys', () => {
      expect(COLORS.background).toBeDefined();
      expect(COLORS.surface).toBeDefined();
      expect(COLORS.primary).toBeDefined();
      expect(COLORS.text).toBeDefined();
      expect(COLORS.danger).toBeDefined();
      expect(COLORS.success).toBeDefined();
      expect(COLORS.personalColor).toBeDefined();
      expect(COLORS.groupColor).toBeDefined();
      expect(COLORS.reimbursementColor).toBeDefined();
    });

    it('should have valid hex color format', () => {
      const hexRegex = /^#[0-9A-Fa-f]{6}$/;
      expect(COLORS.background).toMatch(hexRegex);
      expect(COLORS.primary).toMatch(hexRegex);
      expect(COLORS.text).toMatch(hexRegex);
    });
  });

  describe('formatCurrency', () => {
    it('should format basic amounts with ₹ symbol', () => {
      const result = formatCurrency(100);
      expect(result).toContain('₹');
      expect(result).toContain('100');
    });

    it('should show 2 decimal places', () => {
      expect(formatCurrency(100)).toMatch(/\d+\.\d{2}$/);
    });

    it('should handle zero', () => {
      const result = formatCurrency(0);
      expect(result).toContain('0.00');
    });

    it('should handle large amounts with comma separation', () => {
      const result = formatCurrency(100000);
      expect(result).toContain('₹');
      // Indian locale uses lakh separator: 1,00,000
      expect(result).toContain(',');
    });

    it('should handle decimal amounts', () => {
      const result = formatCurrency(99.50);
      expect(result).toContain('99');
      expect(result).toContain('50');
    });

    it('should handle negative amounts', () => {
      const result = formatCurrency(-500);
      expect(result).toContain('500');
    });
  });

  describe('formatDate', () => {
    it('should return "Today" for current timestamp', () => {
      const result = formatDate(Date.now());
      expect(result).toContain('Today');
    });

    it('should return "Yesterday" for yesterday', () => {
      const yesterday = Date.now() - 24 * 60 * 60 * 1000;
      expect(formatDate(yesterday)).toBe('Yesterday');
    });

    it('should return weekday for dates within a week', () => {
      const threeDaysAgo = Date.now() - 3 * 24 * 60 * 60 * 1000;
      const result = formatDate(threeDaysAgo);
      const weekdays = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
      expect(weekdays.some(day => result.includes(day))).toBe(true);
    });

    it('should return formatted date for older dates', () => {
      const oldDate = new Date('2024-01-15').getTime();
      const result = formatDate(oldDate);
      expect(result).toContain('Jan');
      expect(result).toContain('2024');
    });
  });

  describe('getColorForId', () => {
    it('should return a hex color string', () => {
      const result = getColorForId('test-id');
      expect(result).toMatch(/^#[0-9A-Fa-f]{6}$/);
    });

    it('should return consistent color for same id', () => {
      expect(getColorForId('abc')).toBe(getColorForId('abc'));
    });

    it('should return different colors for different ids', () => {
      // Not guaranteed but very likely for different strings
      const color1 = getColorForId('user1');
      const color2 = getColorForId('user2');
      // At least one of many pairs should differ
      const pairs = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j'];
      const colors = pairs.map(p => getColorForId(p));
      const unique = new Set(colors);
      expect(unique.size).toBeGreaterThan(1);
    });

    it('should handle empty string', () => {
      expect(getColorForId('')).toMatch(/^#[0-9A-Fa-f]{6}$/);
    });
  });

  describe('generateId', () => {
    it('should return a non-empty string', () => {
      const id = generateId();
      expect(id).toBeTruthy();
      expect(id.length).toBeGreaterThan(5);
    });

    it('should generate unique ids', () => {
      const ids = new Set(Array.from({ length: 100 }, () => generateId()));
      expect(ids.size).toBe(100);
    });

    it('should contain alphanumeric characters', () => {
      const id = generateId();
      expect(id).toMatch(/^[a-z0-9]+$/);
    });
  });
});
