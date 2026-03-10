/**
 * Email-based transaction detection types.
 */

export type EmailProvider = "gmail" | "outlook" | "yahoo";

/** Stored in Firestore: users/{uid}/emailConnections/{provider} */
export interface EmailConnection {
  provider: EmailProvider;
  email: string;
  accessToken: string;
  refreshToken: string;
  tokenExpiry: number;
  watchExpiry?: number; // Gmail/Outlook webhook subscription expiry
  historyId?: string; // Gmail: last processed historyId
  lastChecked?: number; // Yahoo: last poll timestamp
  createdAt: number;
  updatedAt: number;
}

/** Parsed from a bank transaction email */
export interface ParsedEmailTransaction {
  amount: number;
  type: "debit" | "credit";
  merchant?: string;
  bank?: string;
  cardLast4?: string;
  upiId?: string;
  emailSubject: string;
  emailFrom: string;
  rawBody: string;
  timestamp: number;
}

/** Known bank email sender addresses (India) */
export const BANK_EMAIL_SENDERS: Record<string, string> = {
  // Major Banks
  "alerts@hdfcbank.net": "HDFC Bank",
  "alerts@hdfcbank.com": "HDFC Bank",
  "noreply@hdfcbank.net": "HDFC Bank",
  "alert@sbi.co.in": "State Bank of India",
  "donotreply@sbi.co.in": "State Bank of India",
  "alerts@icicibank.com": "ICICI Bank",
  "noreply@icicibank.com": "ICICI Bank",
  "alerts@axisbank.com": "Axis Bank",
  "alerts@axisbank.co.in": "Axis Bank",
  "noreply@kotak.com": "Kotak Bank",
  "alerts@kotak.com": "Kotak Bank",
  "pnbalerts@pnb.co.in": "Punjab National Bank",
  "alerts@bobconnect.in": "Bank of Baroda",
  "alerts@canarabank.com": "Canara Bank",
  "alerts@unionbankofindia.bank": "Union Bank",
  "alerts@yesbank.in": "Yes Bank",
  "alerts@federalbank.co.in": "Federal Bank",
  "alerts@sc.com": "Standard Chartered",
  "alerts@citibank.com": "Citibank",
  "alerts@rblbank.com": "RBL Bank",
  "alerts@idbibank.co.in": "IDBI Bank",
  "alerts@idfcfirstbank.com": "IDFC First Bank",
  "alerts@aubank.in": "AU Small Finance Bank",
  "alerts@indusind.com": "IndusInd Bank",

  // UPI / Fintech
  "noreply@phonepe.com": "PhonePe",
  "transactions-noreply@google.com": "Google Pay",
  "alerts@paytm.com": "Paytm",
  "noreply@paytmbank.com": "Paytm Bank",
  "alerts@amazonpay.in": "Amazon Pay",
  "noreply@jupitermoney.com": "Jupiter",
  "noreply@fi.money": "Fi Money",
  "noreply@niyo.co": "Niyo",
  "alerts@cred.club": "CRED",

  // Credit Cards
  "creditcards@hdfcbank.net": "HDFC Credit Card",
  "alerts@amex.com": "American Express",
  "sbicard@sbicard.com": "SBI Card",
};

/** Domains to match loosely (catches any email from this domain) */
export const BANK_EMAIL_DOMAINS = [
  "hdfcbank.net", "hdfcbank.com", "sbi.co.in", "icicibank.com",
  "axisbank.com", "kotak.com", "pnb.co.in", "yesbank.in",
  "rblbank.com", "idfcfirstbank.com", "indusind.com",
  "phonepe.com", "paytm.com", "amazonpay.in",
];
