/**
 * Email Transaction Parser
 *
 * Parses bank/UPI transaction emails to extract amount, merchant, etc.
 * Reuses the same regex patterns as the client-side SMS TransactionParser
 * with additions for HTML email formats.
 */

import {
  ParsedEmailTransaction,
  BANK_EMAIL_SENDERS,
  BANK_EMAIL_DOMAINS,
} from "./types";

const DEBIT_KEYWORDS = [
  "debited", "debit", "spent", "paid", "withdrawn", "transferred",
  "purchase", "txn of rs", "transaction of rs", "sent rs",
  "payment of rs", "charged", "deducted", "dr",
  // Email-specific keywords
  "transaction alert", "payment successful", "money sent",
  "order confirmed", "payment received from your",
  "has been debited", "has been charged",
];

const CREDIT_KEYWORDS = [
  "credited", "received", "refund", "cashback", "reversal",
];

/**
 * Strip HTML tags and decode entities to get plain text.
 */
export function stripHtml(html: string): string {
  return html
    // Remove style/script blocks
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    // Replace <br>, <p>, <div>, <tr>, <li> with newlines for structure
    .replace(/<(?:br|\/p|\/div|\/tr|\/li)[^>]*>/gi, "\n")
    // Remove all remaining tags
    .replace(/<[^>]+>/g, " ")
    // Decode common HTML entities
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/₹/g, "₹")
    .replace(/&#8377;/g, "₹")
    // Collapse whitespace
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n/g, "\n")
    .trim();
}

/**
 * Check if an email sender is a known bank/UPI provider.
 */
export function isBankEmail(fromAddress: string): string | null {
  const lower = fromAddress.toLowerCase();

  // Exact match first
  for (const [email, bank] of Object.entries(BANK_EMAIL_SENDERS)) {
    if (lower.includes(email)) {
      return bank;
    }
  }

  // Domain match
  for (const domain of BANK_EMAIL_DOMAINS) {
    if (lower.includes(domain)) {
      // Return domain-based name
      return domain.split(".")[0].charAt(0).toUpperCase() +
        domain.split(".")[0].slice(1);
    }
  }

  return null;
}

/**
 * Parse a bank transaction email into structured data.
 */
export function parseTransactionEmail(
  subject: string,
  body: string,
  fromAddress: string
): ParsedEmailTransaction | null {
  const bank = isBankEmail(fromAddress);
  if (!bank) return null;

  // Strip HTML if present
  const plainBody = body.includes("<") ? stripHtml(body) : body;
  const combined = `${subject} ${plainBody}`.toLowerCase();

  // Check if it's a debit transaction
  const isDebit = DEBIT_KEYWORDS.some((kw) => combined.includes(kw));
  const isCredit = CREDIT_KEYWORDS.some((kw) => combined.includes(kw));

  // Skip credit-only emails (refunds, cashback) unless also debit
  if (!isDebit && isCredit) return null;
  if (!isDebit) return null;

  // Extract amount — same patterns as SMS parser + email-specific
  let amount = 0;
  const fullText = `${subject} ${plainBody}`;
  const amountPatterns = [
    /(?:rs\.?|inr|₹)\s*([\d,]+(?:\.\d{1,2})?)/gi,
    /([\d,]+(?:\.\d{1,2})?)\s*(?:rs\.?|inr|₹)/gi,
    /(?:debited|credited|spent|paid|charged)\s+(?:rs\.?|inr|₹)?\s*([\d,]+(?:\.\d{1,2})?)/gi,
    /amount[:\s]+(?:rs\.?|inr|₹)?\s*([\d,]+(?:\.\d{1,2})?)/gi,
    /total[:\s]+(?:rs\.?|inr|₹)?\s*([\d,]+(?:\.\d{1,2})?)/gi,
  ];

  for (const pattern of amountPatterns) {
    const match = pattern.exec(fullText);
    if (match) {
      const parsed = parseFloat(match[1].replace(/,/g, ""));
      if (parsed > 0 && parsed < 10000000) {
        // Sanity check: under 1 crore
        amount = parsed;
        break;
      }
    }
  }

  if (!amount || amount <= 0) return null;

  // Extract UPI ID
  const upiMatch = fullText.match(/([a-zA-Z0-9._-]+@[a-z]{2,})/);
  // Filter out actual email addresses
  const upiId = upiMatch && !upiMatch[1].includes("bank") &&
    !upiMatch[1].includes("alert") && !upiMatch[1].includes("noreply")
    ? upiMatch[1]
    : undefined;

  // Extract card last 4
  const cardMatch = fullText.match(
    /(?:card|ac|a\/c|acct?|account)[\s.]*(?:no\.?|ending|xx+|x+)[\s.]*(\d{4})/i
  );
  const cardLast4 = cardMatch ? cardMatch[1] : undefined;

  // Extract merchant
  let merchant: string | undefined;
  const merchantPatterns = [
    /(?:at|to|towards|for|merchant)\s+([A-Za-z0-9\s&'.,-]+?)(?:\s+on|\s+ref|\s+txn|\s+dated|\.|,|$)/i,
    /(?:at|to)\s+([A-Z][A-Za-z0-9\s&'.,]+?)(?:\s+\d|$)/,
    /merchant[:\s]+([A-Za-z0-9\s&'.,-]+?)(?:\n|\.|,|$)/i,
    /payment\s+to\s+([A-Za-z0-9\s&'.,-]+?)(?:\s+on|\s+of|\s+ref|\.|,|$)/i,
  ];

  for (const pattern of merchantPatterns) {
    const match = fullText.match(pattern);
    if (match && match[1].trim().length > 2 && match[1].trim().length < 50) {
      merchant = match[1].trim();
      break;
    }
  }

  return {
    amount,
    type: "debit",
    merchant,
    bank,
    cardLast4,
    upiId,
    emailSubject: subject,
    emailFrom: fromAddress,
    rawBody: plainBody.substring(0, 500), // Truncate for storage
    timestamp: Date.now(),
  };
}

/**
 * Build a human-readable description from parsed email transaction.
 */
export function buildEmailDescription(parsed: ParsedEmailTransaction): string {
  if (parsed.merchant) {
    return `Payment at ${parsed.merchant}`;
  }
  if (parsed.upiId) {
    return `UPI Transfer to ${parsed.upiId}`;
  }
  if (parsed.cardLast4) {
    return `Card payment (****${parsed.cardLast4})`;
  }
  if (parsed.bank) {
    return `${parsed.bank} transaction`;
  }
  return "Bank transaction";
}
