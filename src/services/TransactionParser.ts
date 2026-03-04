import { ParsedTransaction } from '../models/types';

/**
 * Parses incoming SMS messages to detect bank transactions.
 * Supports major Indian banks, UPI payments, and card transactions.
 *
 * Detection strategy:
 * 1. Check if the SMS is from a known bank sender
 * 2. Look for debit keywords (debited, spent, paid, withdrawn, transferred)
 * 3. Extract the amount using currency patterns (Rs, INR, ₹)
 * 4. Extract merchant/UPI info if available
 */

// Known bank SMS sender IDs (short codes)
const BANK_SENDERS = [
  'SBIINB', 'SBIPSG', 'HDFCBK', 'ICICIB', 'AXISBK', 'KOTAKB',
  'PNBSMS', 'BOIIND', 'CANBNK', 'UNIONB', 'IABORB', 'YESBNK',
  'INDBNK', 'FEDBNK', 'SCBANK', 'CITIBK', 'RBLBNK', 'IDBIBNK',
  'PAYTMB', 'JIOBNK', 'GPAY', 'PHONEPE', 'PAYTM', 'AMAZON',
  'UPITRN', 'BNKIND', 'IDFCFB', 'AUBANK',
];

// Debit indicator keywords
const DEBIT_KEYWORDS = [
  'debited', 'debit', 'spent', 'paid', 'withdrawn', 'transferred',
  'purchase', 'txn of rs', 'transaction of rs', 'sent rs',
  'payment of rs', 'charged', 'deducted', 'dr ',
];

// Credit indicator keywords (to distinguish and skip credits)
const CREDIT_KEYWORDS = [
  'credited', 'credit', 'received', 'refund', 'cashback',
  'deposited', 'cr ',
];

// Amount extraction patterns: matches Rs.500, Rs 500, INR 500, ₹500, etc.
const AMOUNT_PATTERNS = [
  /(?:rs\.?|inr|₹)\s*([\d,]+(?:\.\d{1,2})?)/gi,
  /(?:amount|amt)[\s:]*(?:rs\.?|inr|₹)?\s*([\d,]+(?:\.\d{1,2})?)/gi,
  /([\d,]+(?:\.\d{1,2})?)\s*(?:rs|inr|₹)/gi,
];

// UPI ID pattern
const UPI_PATTERN = /([a-zA-Z0-9._-]+@[a-zA-Z]+)/;

// Card last 4 digits pattern
const CARD_PATTERN = /(?:card|ac|a\/c|acct?)[\s.]*(?:no\.?|ending|xx+)[\s.]*(\d{4})/i;

// Merchant/recipient patterns
const MERCHANT_PATTERNS = [
  /(?:at|to|towards|for)\s+([A-Za-z0-9\s&'.,-]+?)(?:\s+on|\s+ref|\s+txn|\.|$)/i,
  /(?:paid to|sent to|transferred to)\s+([A-Za-z0-9\s&'.,-]+?)(?:\s+on|\s+ref|\.|$)/i,
];

// Bank name extraction
const BANK_NAME_MAP: Record<string, string> = {
  'SBI': 'State Bank of India',
  'HDFC': 'HDFC Bank',
  'ICICI': 'ICICI Bank',
  'AXIS': 'Axis Bank',
  'KOTAK': 'Kotak Mahindra Bank',
  'PNB': 'Punjab National Bank',
  'BOI': 'Bank of India',
  'CANARA': 'Canara Bank',
  'UNION': 'Union Bank',
  'YES': 'Yes Bank',
  'IDFC': 'IDFC First Bank',
  'RBL': 'RBL Bank',
  'FEDERAL': 'Federal Bank',
  'IDBI': 'IDBI Bank',
  'AU': 'AU Small Finance Bank',
};

/**
 * Check if the SMS sender looks like a bank/payment service.
 */
export function isBankSender(sender: string): boolean {
  const upper = sender.toUpperCase().replace(/[^A-Z]/g, '');
  return BANK_SENDERS.some(code => upper.includes(code));
}

/**
 * Main parser: takes raw SMS body and returns parsed transaction or null.
 */
export function parseTransactionSms(
  body: string,
  sender?: string,
): ParsedTransaction | null {
  const normalizedBody = body.toLowerCase();

  // Step 1: Must contain debit keywords
  const isDebit = DEBIT_KEYWORDS.some(kw => normalizedBody.includes(kw));
  const isCredit = CREDIT_KEYWORDS.some(kw => normalizedBody.includes(kw));

  // If it's a credit message or has no debit keywords, skip
  // (if both debit and credit keywords exist, check which comes first)
  if (!isDebit) return null;
  if (isCredit && !isDebit) return null;
  if (isCredit && isDebit) {
    const debitPos = Math.min(
      ...DEBIT_KEYWORDS.map(kw => {
        const idx = normalizedBody.indexOf(kw);
        return idx === -1 ? Infinity : idx;
      }),
    );
    const creditPos = Math.min(
      ...CREDIT_KEYWORDS.map(kw => {
        const idx = normalizedBody.indexOf(kw);
        return idx === -1 ? Infinity : idx;
      }),
    );
    // If credit keyword appears before debit, it's likely a credit SMS
    if (creditPos < debitPos) return null;
  }

  // Step 2: Extract amount
  const amount = extractAmount(body);
  if (!amount || amount <= 0) return null;

  // Step 3: Extract other details
  const merchant = extractMerchant(body);
  const upiId = extractUpiId(body);
  const cardLast4 = extractCardLast4(body);
  const bank = extractBankName(body, sender);

  return {
    amount,
    type: 'debit',
    merchant: merchant || undefined,
    bank: bank || undefined,
    cardLast4: cardLast4 || undefined,
    upiId: upiId || undefined,
    rawMessage: body,
    timestamp: Date.now(),
  };
}

function extractAmount(body: string): number | null {
  for (const pattern of AMOUNT_PATTERNS) {
    // Reset regex lastIndex for global patterns
    pattern.lastIndex = 0;
    const match = pattern.exec(body);
    if (match && match[1]) {
      const cleaned = match[1].replace(/,/g, '');
      const num = parseFloat(cleaned);
      if (!isNaN(num) && num > 0) {
        return num;
      }
    }
  }
  return null;
}

function extractMerchant(body: string): string | null {
  for (const pattern of MERCHANT_PATTERNS) {
    const match = pattern.exec(body);
    if (match && match[1]) {
      const merchant = match[1].trim();
      // Clean up: remove trailing spaces and common noise words
      if (merchant.length > 2 && merchant.length < 50) {
        return merchant;
      }
    }
  }
  return null;
}

function extractUpiId(body: string): string | null {
  const match = UPI_PATTERN.exec(body);
  return match ? match[1] : null;
}

function extractCardLast4(body: string): string | null {
  const match = CARD_PATTERN.exec(body);
  return match ? match[1] : null;
}

function extractBankName(body: string, sender?: string): string | null {
  const text = `${body} ${sender || ''}`.toUpperCase();
  for (const [key, name] of Object.entries(BANK_NAME_MAP)) {
    if (text.includes(key)) {
      return name;
    }
  }
  return null;
}

/**
 * Build a human-readable description from a parsed transaction.
 */
export function buildDescription(parsed: ParsedTransaction): string {
  const parts: string[] = [];

  if (parsed.merchant) {
    parts.push(`Paid to ${parsed.merchant}`);
  } else if (parsed.upiId) {
    parts.push(`UPI payment to ${parsed.upiId}`);
  } else {
    parts.push('Transaction');
  }

  if (parsed.bank) {
    parts.push(`via ${parsed.bank}`);
  }
  if (parsed.cardLast4) {
    parts.push(`(card **${parsed.cardLast4})`);
  }

  return parts.join(' ');
}
