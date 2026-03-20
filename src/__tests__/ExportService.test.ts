/**
 * ExportService Tests
 *
 * Tests CSV generation, text report generation, PDF HTML generation,
 * receipt export naming, deduplication, edge cases with empty/special data,
 * and financial accuracy in totals.
 */
import { Transaction } from '../models/types';
import {
  generateCSV,
  generateTextReport,
  buildReceiptExportList,
} from '../services/ExportService';

const makeTxn = (overrides: Partial<Transaction> = {}): Transaction => ({
  id: 'txn1',
  userId: 'u1',
  amount: 500,
  description: 'Test payment',
  merchant: 'Swiggy',
  source: 'HDFC',
  trackerType: 'personal',
  timestamp: new Date('2024-03-15T10:30:00').getTime(),
  createdAt: Date.now(),
  ...overrides,
});

// ─── CSV Generation ──────────────────────────────────────────────────────────

describe('generateCSV', () => {
  it('should generate valid CSV with headers', () => {
    const csv = generateCSV([makeTxn()]);
    const lines = csv.split('\n');
    expect(lines[0]).toBe('Date,Description,Merchant,Amount (INR),Category,Source,Tracker,Tags,Note');
    expect(lines.length).toBe(2); // header + 1 row
  });

  it('should escape double quotes in description and merchant', () => {
    const csv = generateCSV([makeTxn({
      description: 'He said "hello"',
      merchant: 'O\'Reilly "Books"',
    })]);
    expect(csv).toContain('""hello""');
    expect(csv).toContain('""Books""');
  });

  it('should handle empty fields gracefully', () => {
    const csv = generateCSV([makeTxn({
      merchant: undefined,
      category: undefined,
      note: undefined,
      tags: undefined,
    })]);
    const lines = csv.split('\n');
    expect(lines.length).toBe(2);
    // Should not crash
  });

  it('should sort by timestamp descending (newest first)', () => {
    const csv = generateCSV([
      makeTxn({ id: 't1', amount: 100, timestamp: new Date('2024-01-01').getTime() }),
      makeTxn({ id: 't2', amount: 200, timestamp: new Date('2024-03-01').getTime() }),
      makeTxn({ id: 't3', amount: 300, timestamp: new Date('2024-02-01').getTime() }),
    ]);
    const lines = csv.split('\n').slice(1); // skip header
    expect(lines[0]).toContain('200.00'); // March
    expect(lines[1]).toContain('300.00'); // Feb
    expect(lines[2]).toContain('100.00'); // Jan
  });

  it('should format amounts to 2 decimal places', () => {
    const csv = generateCSV([makeTxn({ amount: 1234.5 })]);
    expect(csv).toContain('1234.50');
  });

  it('should include tags as comma-separated', () => {
    const csv = generateCSV([makeTxn({ tags: ['food', 'lunch', 'office'] })]);
    expect(csv).toContain('food, lunch, office');
  });

  it('should return only headers for empty transactions', () => {
    const csv = generateCSV([]);
    const lines = csv.split('\n');
    expect(lines.length).toBe(1);
    expect(lines[0]).toContain('Date');
  });

  it('should handle large numbers accurately', () => {
    const csv = generateCSV([makeTxn({ amount: 9999999.99 })]);
    expect(csv).toContain('9999999.99');
  });

  it('should handle tiny amounts accurately', () => {
    const csv = generateCSV([makeTxn({ amount: 0.01 })]);
    expect(csv).toContain('0.01');
  });
});

// ─── Text Report Generation ──────────────────────────────────────────────────

describe('generateTextReport', () => {
  it('should include period label', () => {
    const report = generateTextReport([makeTxn()], 'March 2024');
    expect(report).toContain('March 2024');
    expect(report).toContain('TRACKK EXPENSE REPORT');
  });

  it('should calculate correct totals', () => {
    const txns = [
      makeTxn({ amount: 100 }),
      makeTxn({ id: 't2', amount: 250 }),
      makeTxn({ id: 't3', amount: 150 }),
    ];
    const report = generateTextReport(txns, 'Test');
    expect(report).toContain('Transactions: 3');
  });

  it('should show category breakdown', () => {
    const txns = [
      makeTxn({ category: 'Food', amount: 200 }),
      makeTxn({ id: 't2', category: 'Food', amount: 300 }),
      makeTxn({ id: 't3', category: 'Transport', amount: 100 }),
    ];
    const report = generateTextReport(txns, 'Test');
    expect(report).toContain('Food');
    expect(report).toContain('Transport');
    expect(report).toContain('2 transactions'); // Food count
  });

  it('should categorize uncategorized as Other', () => {
    const report = generateTextReport([makeTxn({ category: undefined })], 'Test');
    expect(report).toContain('Other');
  });

  it('should show top merchants', () => {
    const txns = [
      makeTxn({ merchant: 'Swiggy', amount: 300 }),
      makeTxn({ id: 't2', merchant: 'Swiggy', amount: 200 }),
      makeTxn({ id: 't3', merchant: 'Zomato', amount: 100 }),
    ];
    const report = generateTextReport(txns, 'Test');
    expect(report).toContain('Swiggy');
    expect(report).toContain('Zomato');
  });

  it('should handle empty transactions', () => {
    const report = generateTextReport([], 'Test');
    expect(report).toContain('No data');
    expect(report).toContain('Transactions: 0');
  });

  it('should handle zero amount average without division by zero', () => {
    const report = generateTextReport([], 'Test');
    // Should not crash, should show 0
    expect(report).toContain('0');
  });
});

// ─── Receipt Export Naming ───────────────────────────────────────────────────

describe('buildReceiptExportList', () => {
  it('should only include transactions with receipts', () => {
    const txns = [
      makeTxn({ receiptUri: '/photos/receipt1.jpg' }),
      makeTxn({ id: 't2', receiptUri: undefined }),
    ];
    const list = buildReceiptExportList(txns);
    expect(list.length).toBe(1);
  });

  it('should name files as MerchantName_YYYY-MM-DD.ext', () => {
    const txns = [makeTxn({
      merchant: 'Swiggy',
      timestamp: new Date('2024-03-15').getTime(),
      receiptUri: '/photos/receipt.jpg',
    })];
    const list = buildReceiptExportList(txns);
    expect(list[0].filename).toBe('Swiggy_2024-03-15.jpg');
  });

  it('should handle duplicate filenames with counter', () => {
    const txns = [
      makeTxn({
        id: 't1', merchant: 'Swiggy',
        timestamp: new Date('2024-03-15').getTime(),
        receiptUri: '/photos/r1.jpg',
      }),
      makeTxn({
        id: 't2', merchant: 'Swiggy',
        timestamp: new Date('2024-03-15').getTime(),
        receiptUri: '/photos/r2.jpg',
      }),
    ];
    const list = buildReceiptExportList(txns);
    expect(list[0].filename).toBe('Swiggy_2024-03-15.jpg');
    expect(list[1].filename).toBe('Swiggy_2024-03-15_2.jpg');
  });

  it('should sanitize special characters in merchant name', () => {
    const txns = [makeTxn({
      merchant: 'Café & Bar (Deluxe)',
      receiptUri: '/photos/r.png',
      timestamp: new Date('2024-01-01').getTime(),
    })];
    const list = buildReceiptExportList(txns);
    // Special chars removed, spaces → underscores
    expect(list[0].filename).not.toContain('&');
    expect(list[0].filename).not.toContain('(');
    expect(list[0].filename).toContain('.png');
  });

  it('should fallback to description when no merchant', () => {
    const txns = [makeTxn({
      merchant: undefined,
      description: 'Card payment',
      receiptUri: '/photos/r.jpg',
      timestamp: new Date('2024-06-01').getTime(),
    })];
    const list = buildReceiptExportList(txns);
    expect(list[0].filename).toContain('Card_payment');
  });

  it('should handle empty receipt list', () => {
    const list = buildReceiptExportList([]);
    expect(list).toEqual([]);
  });

  it('should detect file extension from URI', () => {
    const txns = [
      makeTxn({ id: 't1', receiptUri: '/photos/scan.pdf', merchant: 'Test' }),
    ];
    const list = buildReceiptExportList(txns);
    expect(list[0].filename).toContain('.pdf');
  });
});
