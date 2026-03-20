import { ParsedTransaction } from '../models/types';

const BANK_SENDERS = [
  // Major banks
  'SBIINB', 'SBIPSG', 'SBIBNK', 'HDFCBK', 'HDFCBANK', 'ICICIB', 'ICICIBANK',
  'AXISBK', 'KOTAKB', 'PNBSMS', 'BOIIND', 'CANBNK', 'UNIONB', 'IABORB',
  'YESBNK', 'INDBNK', 'FEDBNK', 'SCBANK', 'CITIBK', 'RBLBNK', 'IDBIBNK',
  'IDFCFB', 'AUBANK', 'BNKIND', 'BOBANK', 'KARBVB', 'MAHBNK',
  // Payments / wallets
  'PAYTMB', 'JIOBNK', 'GPAY', 'PHONEPE', 'PAYTM', 'AMAZON', 'UPITRN',
  // NBFCs & lenders (EMIs)
  'BAJFIN', 'BAJAJF', 'BAJFINSERV', 'TATACAP', 'HOMECR', 'LNTTFS',
  'MABORB', 'LTFIN', 'FULRTN', 'CHOLAR', 'HDBFSL', 'SHRIRAM',
  // Mutual funds & registrars
  'CAMSMF', 'KFINTECH', 'KFINTEC', 'SBIMFS', 'HDFCMF', 'ABORLMF',
  'ABORLSL', 'NIPPON', 'ICICIMF', 'AXISMF', 'KOTAKMF', 'MOTILAL',
  'FRANKLINTMPTN', 'BSESTARMF', 'MFCENTRAL',
  // Brokers & fintech (investments)
  'ZERODHA', 'GROWW', 'UPSTOX', 'ANGELONE', 'ANGEL', 'DHAN',
  '5PAISA', 'PAYTMMONEY', 'ETMONEY', 'KUVERA', 'COIN',
  'SMALLCASE', 'FIMONEY', 'JUPITER',
  // Credit cards
  'AMEXIN', 'HSBC', 'DBSBNK',
];

const DEBIT_KEYWORDS = [
  'debited', 'debit', 'spent', 'paid', 'withdrawn', 'transferred',
  'purchase', 'txn of rs', 'transaction of rs', 'sent rs',
  'payment of rs', 'charged', 'deducted', 'dr',
  // SIP / mutual fund confirmations
  'allotted', 'allotment', 'units purchased', 'sip executed',
  'sip processed', 'nav allotment', 'folio',
  // EMI confirmations
  'emi received', 'emi processed', 'emi successful', 'emi due',
  'installment received', 'instalment received',
  // Subscription / recurring
  'auto-debit', 'auto debit', 'autopay', 'mandate executed',
  'nach debit', 'recurring payment',
];

const SELF_TRANSFER_PATTERNS = [
  /self\s*transfer/i,
  /own\s*account/i,
  /self\s*a\/?c/i,
  /transfer\s+to\s+self/i,
  /fund\s*transfer.*your\s*(a\/?c|account)/i,
  /transferred.*to\s+your/i,
  /a\/?c\s*\w{2,4}(\d{4}).*a\/?c\s*\w{2,4}\1/i, // same last 4 digits on both accounts
];

const BANK_NAME_MAP: Record<string, string> = {
  SBIINB: 'State Bank of India',
  SBIPSG: 'State Bank of India',
  HDFCBK: 'HDFC Bank',
  HDFCBANK: 'HDFC Bank',
  ICICIB: 'ICICI Bank',
  ICICIBANK: 'ICICI Bank',
  AXISBK: 'Axis Bank',
  KOTAKB: 'Kotak Bank',
  PNBSMS: 'Punjab National Bank',
  BOIIND: 'Bank of India',
  CANBNK: 'Canara Bank',
  UNIONB: 'Union Bank',
  YESBNK: 'Yes Bank',
  INDBNK: 'Indian Bank',
  FEDBNK: 'Federal Bank',
  SCBANK: 'Standard Chartered',
  CITIBK: 'Citibank',
  RBLBNK: 'RBL Bank',
  IDBIBNK: 'IDBI Bank',
  PAYTMB: 'Paytm Bank',
  JIOBNK: 'Jio Payments Bank',
  GPAY: 'Google Pay',
  PHONEPE: 'PhonePe',
  PAYTM: 'Paytm',
  AMAZON: 'Amazon Pay',
  IDFCFB: 'IDFC First Bank',
  AUBANK: 'AU Small Finance Bank',
  // NBFCs
  BAJFIN: 'Bajaj Finserv',
  BAJAJF: 'Bajaj Finserv',
  BAJFINSERV: 'Bajaj Finserv',
  TATACAP: 'Tata Capital',
  HOMECR: 'Home Credit',
  HDBFSL: 'HDFC Securities',
  SHRIRAM: 'Shriram Finance',
  // MF registrars
  CAMSMF: 'CAMS Mutual Fund',
  KFINTECH: 'KFintech',
  KFINTEC: 'KFintech',
  MFCENTRAL: 'MFCentral',
  BSESTARMF: 'BSE StarMF',
  // MF houses
  SBIMFS: 'SBI Mutual Fund',
  HDFCMF: 'HDFC Mutual Fund',
  ICICIMF: 'ICICI Prudential MF',
  AXISMF: 'Axis Mutual Fund',
  KOTAKMF: 'Kotak Mutual Fund',
  NIPPON: 'Nippon India MF',
  ABORLMF: 'Aditya Birla Sun Life MF',
  MOTILAL: 'Motilal Oswal',
  // Brokers
  ZERODHA: 'Zerodha',
  GROWW: 'Groww',
  UPSTOX: 'Upstox',
  ANGELONE: 'Angel One',
  DHAN: 'Dhan',
};

export function isBankSender(sender: string): boolean {
  const upperSender = sender.toUpperCase();
  return BANK_SENDERS.some(code => upperSender.includes(code));
}

export function parseTransactionSms(body: string, sender: string): ParsedTransaction | null {
  const lowerBody = body.toLowerCase();

  // Check if it's a debit transaction
  const isDebit = DEBIT_KEYWORDS.some(keyword => lowerBody.includes(keyword));
  if (!isDebit) return null;

  // Filter out self-transfers (own account to own account)
  const isSelfTransfer = SELF_TRANSFER_PATTERNS.some(pattern => pattern.test(body));
  if (isSelfTransfer) return null;

  // Extract amount
  let amount = 0;
  const amountPatterns = [
    /(?:rs\.?|inr|₹)\s*([\d,]+(?:\.\d{1,2})?)/gi,
    /([\d,]+(?:\.\d{1,2})?)\s*(?:rs\.?|inr|₹)/gi,
    /(?:debited|credited|spent|paid)\s+(?:rs\.?|inr|₹)?\s*([\d,]+(?:\.\d{1,2})?)/gi,
  ];

  for (const pattern of amountPatterns) {
    const match = pattern.exec(body);
    if (match) {
      amount = parseFloat(match[1].replace(/,/g, ''));
      break;
    }
  }

  if (!amount || amount <= 0) return null;

  // Extract UPI ID
  const upiMatch = body.match(/([a-zA-Z0-9._-]+@[a-zA-Z]+)/);
  const upiId = upiMatch ? upiMatch[1] : undefined;

  // Extract card last 4
  const cardMatch = body.match(/(?:card|ac|a\/c|acct?)[\s.]*(?:no\.?|ending|xx+)[\s.]*(\d{4})/i);
  const cardLast4 = cardMatch ? cardMatch[1] : undefined;

  // Extract merchant
  let merchant: string | undefined;
  const merchantPatterns = [
    /(?:at|to|towards|for)\s+([A-Za-z0-9\s&'.,-]+?)(?:\s+on|\s+ref|\s+txn|\.|$)/i,
    /(?:at|to)\s+([A-Z][A-Za-z0-9\s&'.,]+?)(?:\s+\d|$)/,
  ];

  for (const pattern of merchantPatterns) {
    const match = body.match(pattern);
    if (match && match[1].trim().length > 2) {
      merchant = match[1].trim();
      break;
    }
  }

  // Get bank name
  const upperSender = sender.toUpperCase();
  let bank: string | undefined;
  for (const [code, name] of Object.entries(BANK_NAME_MAP)) {
    if (upperSender.includes(code)) {
      bank = name;
      break;
    }
  }

  return {
    amount,
    type: 'debit',
    merchant,
    bank,
    cardLast4,
    upiId,
    rawMessage: body,
    timestamp: Date.now(),
  };
}

export function buildDescription(parsed: ParsedTransaction): string {
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
  return 'Bank transaction';
}
