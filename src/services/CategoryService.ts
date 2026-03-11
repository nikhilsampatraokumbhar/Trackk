import AsyncStorage from '@react-native-async-storage/async-storage';
import { Transaction } from '../models/types';
import { updateTransaction } from './StorageService';

const CUSTOM_CATEGORIES_KEY = '@et_custom_categories';
const CATEGORY_OVERRIDES_KEY = '@et_category_overrides';

// Built-in category detection keywords
const CATEGORY_KEYWORDS: Record<string, string[]> = {
  'Food & Dining': ['swiggy', 'zomato', 'restaurant', 'food', 'cafe', 'coffee', 'tea', 'pizza', 'burger', 'biryani', 'hotel', 'mess', 'canteen', 'dominos', 'mcdonald', 'kfc', 'starbucks', 'chaayos'],
  'Shopping': ['amazon', 'flipkart', 'myntra', 'ajio', 'meesho', 'nykaa', 'mall', 'shop', 'store', 'mart', 'bazaar', 'decathlon'],
  'Transport': ['uber', 'ola', 'rapido', 'metro', 'petrol', 'diesel', 'fuel', 'parking', 'toll', 'irctc', 'train', 'bus', 'auto', 'cab'],
  'Bills & Utilities': ['electricity', 'water', 'gas', 'wifi', 'broadband', 'jio', 'airtel', 'vi ', 'bsnl', 'dth', 'recharge', 'bill'],
  'Entertainment': ['netflix', 'hotstar', 'prime', 'spotify', 'youtube', 'movie', 'pvr', 'inox', 'game', 'concert'],
  'Health': ['pharmacy', 'medical', 'hospital', 'doctor', 'apollo', 'medplus', 'gym', 'fitness', 'pharmeasy', '1mg'],
  'Education': ['course', 'book', 'udemy', 'unacademy', 'byjus', 'school', 'college', 'tuition', 'library'],
  'Transfers': ['upi', 'neft', 'imps', 'transfer', 'sent to', 'paid to'],
};

export const ALL_CATEGORIES = Object.keys(CATEGORY_KEYWORDS);

export const CATEGORY_COLORS: Record<string, string> = {
  'Food & Dining': '#E8B84A',
  'Shopping': '#8A78F0',
  'Transport': '#45A8D4',
  'Bills & Utilities': '#E07888',
  'Entertainment': '#DD70A0',
  'Health': '#3CB882',
  'Education': '#6BCFC0',
  'Transfers': '#70B0F0',
  'Other': '#6A6A8E',
};

export const CATEGORY_ICONS: Record<string, string> = {
  'Food & Dining': '🍔',
  'Shopping': '🛍️',
  'Transport': '🚗',
  'Bills & Utilities': '📱',
  'Entertainment': '🎬',
  'Health': '💊',
  'Education': '📚',
  'Transfers': '💸',
  'Other': '📦',
};

/**
 * Detect category for a transaction based on keywords
 */
export function detectCategory(txn: Transaction): string {
  if (txn.category) return txn.category;
  const text = `${txn.description} ${txn.merchant || ''}`.toLowerCase();
  for (const [cat, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    if (keywords.some(kw => text.includes(kw))) return cat;
  }
  return 'Other';
}

/**
 * Get custom categories added by the user
 */
export async function getCustomCategories(): Promise<string[]> {
  const raw = await AsyncStorage.getItem(CUSTOM_CATEGORIES_KEY);
  return raw ? JSON.parse(raw) : [];
}

/**
 * Add a custom category
 */
export async function addCustomCategory(name: string): Promise<void> {
  const customs = await getCustomCategories();
  if (!customs.includes(name) && !ALL_CATEGORIES.includes(name)) {
    customs.push(name);
    await AsyncStorage.setItem(CUSTOM_CATEGORIES_KEY, JSON.stringify(customs));
  }
}

/**
 * Get all available categories (built-in + custom)
 */
export async function getAllAvailableCategories(): Promise<string[]> {
  const customs = await getCustomCategories();
  return [...ALL_CATEGORIES, ...customs, 'Other'];
}

/**
 * Recategorize a transaction
 */
export async function recategorizeTransaction(transactionId: string, category: string): Promise<void> {
  await updateTransaction(transactionId, { category });

  // Also save the merchant→category mapping for future auto-detection
  const overrides = await getCategoryOverrides();
  // We'll get the transaction to learn the merchant
  const { getTransaction } = require('./StorageService');
  const txn = await getTransaction(transactionId);
  if (txn) {
    const key = (txn.merchant || txn.description).toLowerCase().trim();
    overrides[key] = category;
    await AsyncStorage.setItem(CATEGORY_OVERRIDES_KEY, JSON.stringify(overrides));
  }
}

/**
 * Get user's manual category overrides (merchant → category mapping)
 */
export async function getCategoryOverrides(): Promise<Record<string, string>> {
  const raw = await AsyncStorage.getItem(CATEGORY_OVERRIDES_KEY);
  return raw ? JSON.parse(raw) : {};
}

/**
 * Enhanced category detection that checks user overrides first
 */
export async function detectCategoryEnhanced(txn: Transaction): Promise<string> {
  if (txn.category) return txn.category;

  // Check user overrides first
  const overrides = await getCategoryOverrides();
  const key = (txn.merchant || txn.description).toLowerCase().trim();
  if (overrides[key]) return overrides[key];

  return detectCategory(txn);
}
