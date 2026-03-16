import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as RNLocalize from 'react-native-localize';

// Import all translations
import en from './locales/en';
import hi from './locales/hi';
import ta from './locales/ta';
import te from './locales/te';
import kn from './locales/kn';
import bn from './locales/bn';
import mr from './locales/mr';
import es from './locales/es';
import fr from './locales/fr';
import de from './locales/de';

const LANGUAGE_KEY = '@et_language';

export interface LanguageOption {
  code: string;
  name: string;          // Native name
  englishName: string;   // English name
  flag: string;
}

export const SUPPORTED_LANGUAGES: LanguageOption[] = [
  { code: 'en', name: 'English', englishName: 'English', flag: '🇺🇸' },
  { code: 'hi', name: 'हिन्दी', englishName: 'Hindi', flag: '🇮🇳' },
  { code: 'ta', name: 'தமிழ்', englishName: 'Tamil', flag: '🇮🇳' },
  { code: 'te', name: 'తెలుగు', englishName: 'Telugu', flag: '🇮🇳' },
  { code: 'kn', name: 'ಕನ್ನಡ', englishName: 'Kannada', flag: '🇮🇳' },
  { code: 'bn', name: 'বাংলা', englishName: 'Bengali', flag: '🇮🇳' },
  { code: 'mr', name: 'मराठी', englishName: 'Marathi', flag: '🇮🇳' },
  { code: 'es', name: 'Español', englishName: 'Spanish', flag: '🇪🇸' },
  { code: 'fr', name: 'Français', englishName: 'French', flag: '🇫🇷' },
  { code: 'de', name: 'Deutsch', englishName: 'German', flag: '🇩🇪' },
];

const resources = {
  en: { translation: en },
  hi: { translation: hi },
  ta: { translation: ta },
  te: { translation: te },
  kn: { translation: kn },
  bn: { translation: bn },
  mr: { translation: mr },
  es: { translation: es },
  fr: { translation: fr },
  de: { translation: de },
};

/**
 * Detect best language: saved preference > device locale > English
 */
function getDefaultLanguage(): string {
  const locales = RNLocalize.getLocales();
  if (locales.length > 0) {
    const deviceLang = locales[0].languageCode;
    if (resources[deviceLang as keyof typeof resources]) {
      return deviceLang;
    }
  }
  return 'en';
}

// Initialize with a default, then load saved preference
i18n.use(initReactI18next).init({
  resources,
  lng: 'en', // Start with English, will be overridden
  fallbackLng: 'en',
  interpolation: {
    escapeValue: false, // React already escapes
  },
  compatibilityJSON: 'v4',
});

// Load saved language preference (async)
export async function loadSavedLanguage(): Promise<string> {
  try {
    const saved = await AsyncStorage.getItem(LANGUAGE_KEY);
    if (saved && resources[saved as keyof typeof resources]) {
      await i18n.changeLanguage(saved);
      return saved;
    }
  } catch {}

  const detected = getDefaultLanguage();
  await i18n.changeLanguage(detected);
  return detected;
}

/**
 * Change language and persist the preference.
 */
export async function changeLanguage(langCode: string): Promise<void> {
  await i18n.changeLanguage(langCode);
  await AsyncStorage.setItem(LANGUAGE_KEY, langCode);
}

export default i18n;
