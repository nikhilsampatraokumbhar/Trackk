import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, Alert, ActivityIndicator, Platform, Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { hapticDevMode } from '../utils/haptics';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/AppNavigator';
import { useAuth } from '../store/AuthContext';
import { usePremium } from '../store/PremiumContext';
import { COLORS, formatDate } from '../utils/helpers';
import { useTheme } from '../store/ThemeContext';
import { useTranslation } from 'react-i18next';
import { SUPPORTED_LANGUAGES, changeLanguage } from '../i18n';
import { CURRENCIES, getPreferredCurrency, setPreferredCurrency, getCurrencyInfo } from '../utils/currencies';
import { isDevMode, setDevMode, loadDevMode } from '../utils/devMode';
import {
  EmailProvider, connectEmail, disconnectEmail, parseOAuthRedirect,
  getProviderDisplayName, getProviderColor, startOAuthFlow,
} from '../services/EmailService';
import { db } from '../services/FirebaseConfig';
import { backupAllData, restoreFromBackup } from '../services/BackupService';
import { clearAllData } from '../services/StorageService';
import { deleteGroupCloud } from '../services/SyncService';

type Nav = NativeStackNavigationProp<RootStackParamList>;

export default function ProfileScreen() {
  const nav = useNavigation<Nav>();
  const { user, updateProfile, signOut } = useAuth();
  const { colors, isDark, toggleTheme } = useTheme();
  // Premium UI hidden during free launch — set to true to re-enable
  const SHOW_PREMIUM_UI = false;
  const { isPremium, isFamily, currentPlan, subscription, referralStats } = usePremium();
  const [isEditingName, setIsEditingName] = useState(false);
  const [editName, setEditName] = useState(user?.displayName || '');
  const [connectedEmails, setConnectedEmails] = useState<Record<EmailProvider, string | null>>({
    gmail: null, outlook: null, yahoo: null,
  });
  const [connectingProvider, setConnectingProvider] = useState<EmailProvider | null>(null);
  const [devMode, setDevModeState] = useState(false);
  const [showLanguagePicker, setShowLanguagePicker] = useState(false);
  const [showCurrencyPicker, setShowCurrencyPicker] = useState(false);
  const [currentCurrency, setCurrentCurrency] = useState(getPreferredCurrency());
  const { t, i18n } = useTranslation();
  const versionTapCount = useRef(0);
  const versionTapTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    loadDevMode().then(setDevModeState);
  }, []);

  const handleVersionTap = () => {
    versionTapCount.current += 1;
    if (versionTapTimer.current) clearTimeout(versionTapTimer.current);
    if (versionTapCount.current >= 7) {
      versionTapCount.current = 0;
      hapticDevMode();
      const newState = !devMode;
      setDevMode(newState);
      setDevModeState(newState);
      Alert.alert(
        newState ? 'Developer Mode Enabled' : 'Developer Mode Disabled',
        newState ? 'Debug diagnostics are now visible.' : 'Debug diagnostics are now hidden.',
      );
      return;
    }
    versionTapTimer.current = setTimeout(() => { versionTapCount.current = 0; }, 1500);
  };

  // Load connected email status
  useEffect(() => {
    if (!user?.id) return;
    const providers: EmailProvider[] = ['gmail', 'outlook', 'yahoo'];
    providers.forEach(async (provider) => {
      try {
        const doc = await db.user(user.id).collection('emailConnections').doc(provider).get();
        if (doc.exists) {
          const data = doc.data() as { email?: string };
          setConnectedEmails(prev => ({ ...prev, [provider]: data?.email || 'Connected' }));
        }
      } catch {
        // Ignore — Firestore may not have this collection yet
      }
    });
  }, [user?.id]);

  // Listen for OAuth redirects (both warm and cold start)
  useEffect(() => {
    const handleUrl = async (url: string) => {
      const parsed = parseOAuthRedirect(url);
      if (!parsed) return;

      setConnectingProvider(parsed.provider);
      try {
        const result = await connectEmail(parsed.provider, parsed.code);
        setConnectedEmails(prev => ({ ...prev, [parsed.provider]: result.email }));
        Alert.alert('Connected', `${getProviderDisplayName(parsed.provider)} connected: ${result.email}`);
      } catch (error: any) {
        Alert.alert('Connection Failed', error.message || 'Could not connect email. Please try again.');
      } finally {
        setConnectingProvider(null);
      }
    };

    // Handle deep link when app is already running
    const subscription = Linking.addEventListener('url', (event) => handleUrl(event.url));

    // Handle deep link that cold-started or resumed the app
    Linking.getInitialURL().then((url) => {
      if (url) handleUrl(url);
    });

    return () => subscription.remove();
  }, []);

  const handleDisconnectEmail = useCallback((provider: EmailProvider) => {
    Alert.alert(
      'Disconnect Email',
      `Stop receiving transaction notifications from ${getProviderDisplayName(provider)}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Disconnect',
          style: 'destructive',
          onPress: async () => {
            try {
              await disconnectEmail(provider);
              setConnectedEmails(prev => ({ ...prev, [provider]: null }));
            } catch {
              Alert.alert('Error', 'Could not disconnect. Please try again.');
            }
          },
        },
      ],
    );
  }, []);

  const initial = (user?.displayName || 'U').charAt(0).toUpperCase();
  const avatarColor = user?.avatarColor || COLORS.personalColor;

  const handleSaveName = async () => {
    const trimmed = editName.trim();
    if (trimmed.length === 0) {
      setEditName(user?.displayName || '');
      setIsEditingName(false);
      return;
    }
    await updateProfile(trimmed, user?.phone || '');
    setIsEditingName(false);
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={[styles.headerCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={[styles.headerGoldLine, { backgroundColor: colors.primary }]} />

          {/* Avatar */}
          <View style={[styles.avatar, { backgroundColor: avatarColor, borderColor: `${colors.primary}40` }]}>
            <Text style={styles.avatarText}>{initial}</Text>
          </View>

          {/* Display Name */}
          {isEditingName ? (
            <View style={styles.editNameRow}>
              <TextInput
                style={[styles.nameInput, { color: colors.text, backgroundColor: colors.surfaceHigh, borderColor: colors.primary }]}
                value={editName}
                onChangeText={setEditName}
                autoFocus
                maxLength={30}
                placeholderTextColor={colors.textSecondary}
                selectionColor={colors.primary}
                onSubmitEditing={handleSaveName}
                returnKeyType="done"
              />
              <TouchableOpacity style={[styles.saveBtn, { backgroundColor: colors.primary }]} onPress={handleSaveName}>
                <Text style={[styles.saveBtnText, { color: isDark ? colors.background : '#FFF' }]}>Save</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity
              onPress={() => {
                setEditName(user?.displayName || '');
                setIsEditingName(true);
              }}
              style={styles.nameRow}
            >
              <Text style={[styles.displayName, { color: colors.text }]}>{user?.displayName || 'User'}</Text>
              <Text style={[styles.editHint, { color: colors.textSecondary }]}>tap to edit</Text>
            </TouchableOpacity>
          )}

          {/* Phone */}
          {user?.phone ? (
            <View style={styles.phoneRow}>
              <Text style={styles.phoneIcon}>📱</Text>
              <Text style={[styles.phoneText, { color: colors.textSecondary }]}>+91 {user.phone}</Text>
              <View style={[styles.verifiedBadge, { backgroundColor: `${colors.success}18`, borderColor: `${colors.success}30` }]}>
                <Text style={[styles.verifiedText, { color: colors.success }]}>Verified</Text>
              </View>
            </View>
          ) : null}
        </View>

        {/* ── Theme Toggle ─────────────────────────────────────────── */}
        <View style={[styles.sectionHeader, { marginTop: 0 }]}>
          <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>APPEARANCE</Text>
        </View>

        <TouchableOpacity
          style={[styles.premiumCard, { backgroundColor: colors.surfaceHigh, borderColor: colors.glassBorder }]}
          onPress={toggleTheme}
          activeOpacity={0.8}
        >
          <View style={styles.premiumRow}>
            <View style={[styles.premiumIconWrap, { backgroundColor: `${colors.primary}18`, borderColor: `${colors.primary}30` }]}>
              <Text style={styles.premiumIcon}>{isDark ? '🌙' : '☀️'}</Text>
            </View>
            <View style={styles.premiumInfo}>
              <Text style={[styles.premiumTitle, { color: colors.text }]}>
                {isDark ? 'Dark Mode' : 'Light Mode'}
              </Text>
              <Text style={[styles.premiumSubtitle, { color: colors.textSecondary }]}>
                Tap to switch to {isDark ? 'light' : 'dark'} theme
              </Text>
            </View>
            <View style={[
              {
                width: 50, height: 28, borderRadius: 14, justifyContent: 'center',
                backgroundColor: isDark ? colors.primary : colors.surfaceHigher,
                paddingHorizontal: 3,
              },
            ]}>
              <View style={[
                {
                  width: 22, height: 22, borderRadius: 11,
                  backgroundColor: '#FFFFFF',
                  alignSelf: isDark ? 'flex-end' : 'flex-start',
                  elevation: 2,
                  shadowColor: '#000',
                  shadowOffset: { width: 0, height: 1 },
                  shadowOpacity: 0.2,
                  shadowRadius: 2,
                },
              ]} />
            </View>
          </View>
        </TouchableOpacity>

        {/* ── Premium Status (hidden during free launch) ─────────── */}
        {SHOW_PREMIUM_UI && (
          <>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>SUBSCRIPTION</Text>
            </View>

            <TouchableOpacity
              style={[styles.premiumCard, isPremium && styles.premiumCardActive]}
              onPress={() => nav.navigate('Pricing')}
              activeOpacity={0.8}
            >
              <View style={styles.premiumRow}>
                <View style={styles.premiumIconWrap}>
                  <Text style={styles.premiumIcon}>{isPremium ? '👑' : '✨'}</Text>
                </View>
                <View style={styles.premiumInfo}>
                  <Text style={styles.premiumTitle}>
                    {isPremium ? `${currentPlan.name} Plan` : 'Upgrade to Premium'}
                  </Text>
                  <Text style={styles.premiumSubtitle}>
                    {isPremium
                      ? (subscription?.isFoundingMember ? 'Founding Member' : 'Active')
                      : 'Less than your morning chai per day'}
                  </Text>
                </View>
                <Text style={styles.chevron}>›</Text>
              </View>
              {isPremium && subscription?.endDate && subscription.endDate > 0 && (
                <View style={styles.premiumExpiry}>
                  <Text style={styles.premiumExpiryText}>
                    Renews {new Date(subscription.endDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                  </Text>
                </View>
              )}
              {isPremium && subscription?.endDate === -1 && (
                <View style={styles.premiumExpiry}>
                  <Text style={[styles.premiumExpiryText, { color: COLORS.primary }]}>
                    Lifetime Access — forever yours
                  </Text>
                </View>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.referralCard}
              onPress={() => nav.navigate('Referral')}
              activeOpacity={0.8}
            >
              <View style={styles.premiumRow}>
                <View style={[styles.premiumIconWrap, { backgroundColor: `${COLORS.warning}18` }]}>
                  <Text style={styles.premiumIcon}>🎁</Text>
                </View>
                <View style={styles.premiumInfo}>
                  <Text style={styles.premiumTitle}>Refer & Earn</Text>
                  <Text style={styles.premiumSubtitle}>
                    {referralStats.freeMonthsEarned > 0
                      ? `${referralStats.freeMonthsEarned} month(s) earned — keep going!`
                      : 'Get up to 12 months free premium'}
                  </Text>
                </View>
                <Text style={styles.chevron}>›</Text>
              </View>
            </TouchableOpacity>

            {isPremium && !isFamily && (
              <TouchableOpacity
                style={styles.familyUpsell}
                onPress={() => nav.navigate('Pricing')}
                activeOpacity={0.8}
              >
                <Text style={styles.familyUpsellIcon}>👨‍👩‍👧‍👦</Text>
                <View style={styles.familyUpsellContent}>
                  <Text style={styles.familyUpsellTitle}>Add your family</Text>
                  <Text style={styles.familyUpsellText}>
                    ₹37/person/month — less than a samosa per day
                  </Text>
                </View>
                <Text style={styles.chevron}>›</Text>
              </TouchableOpacity>
            )}
          </>
        )}

        {/* ── Connect Email ─────────────────────────────────────── */}
        <View style={styles.sectionHeader}>
          <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>EMAIL TRANSACTION DETECTION</Text>
        </View>

        <View style={[styles.emailCard, { backgroundColor: colors.glass, borderColor: colors.glassBorder }]}>
          <Text style={[styles.emailCardDesc, { color: colors.textSecondary }]}>
            We only connect your email if you allow us to — and only for detecting transaction alerts. Your data stays private, is never shared, and you can disconnect and delete it anytime.
          </Text>

          {(['gmail', 'outlook', 'yahoo'] as EmailProvider[]).map((provider) => {
            const email = connectedEmails[provider];
            const isConnecting = connectingProvider === provider;
            const color = getProviderColor(provider);

            return (
              <View key={provider} style={[styles.emailProviderRow, { borderTopColor: colors.border }]}>
                <View style={[styles.emailProviderIcon, { backgroundColor: `${color}18`, borderColor: `${color}30` }]}>
                  <Text style={[styles.emailProviderLetter, { color }]}>
                    {provider === 'gmail' ? 'G' : provider === 'outlook' ? 'O' : 'Y'}
                  </Text>
                </View>
                <View style={styles.emailProviderInfo}>
                  <Text style={[styles.emailProviderName, { color: colors.text }]}>{getProviderDisplayName(provider)}</Text>
                  {email ? (
                    <Text style={[styles.emailProviderEmail, { color: colors.success }]} numberOfLines={1}>{email}</Text>
                  ) : (
                    <Text style={[styles.emailProviderStatus, { color: colors.textSecondary }]}>Not connected</Text>
                  )}
                </View>
                {isConnecting ? (
                  <ActivityIndicator size="small" color={color} />
                ) : email ? (
                  <TouchableOpacity
                    style={styles.emailDisconnectBtn}
                    onPress={() => handleDisconnectEmail(provider)}
                  >
                    <Text style={styles.emailDisconnectText}>Disconnect</Text>
                  </TouchableOpacity>
                ) : (
                  <TouchableOpacity
                    style={[styles.emailConnectBtn, { borderColor: `${color}40` }]}
                    onPress={() => {
                      const clientIds: Record<EmailProvider, string> = {
                        gmail: '978145898230-etq6tvk214kqd2jq2t26c8rs6an6eqkl.apps.googleusercontent.com',
                        outlook: '', // TODO: configure
                        yahoo: '',   // TODO: configure
                      };
                      const clientId = clientIds[provider];
                      if (!clientId) {
                        Alert.alert('Not Available', `${getProviderDisplayName(provider)} connection is not yet configured.`);
                        return;
                      }
                      setConnectingProvider(provider);
                      startOAuthFlow(provider, clientId).catch(() => {
                        setConnectingProvider(null);
                        Alert.alert('Error', 'Could not open sign-in page.');
                      });
                    }}
                  >
                    <Text style={[styles.emailConnectText, { color }]}>Connect</Text>
                  </TouchableOpacity>
                )}
              </View>
            );
          })}
        </View>

        {/* Privacy & Data Section */}
        <View style={styles.sectionHeader}>
          <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>PRIVACY & DATA</Text>
        </View>

        <View style={[styles.privacyCard, { backgroundColor: colors.glass, borderColor: colors.glassBorder }]}>
          <View style={styles.privacyHeader}>
            <View style={[styles.shieldIcon, { backgroundColor: `${colors.success}18`, borderColor: `${colors.success}30` }]}>
              <Text style={styles.shieldEmoji}>🛡️</Text>
            </View>
            <Text style={[styles.privacyTitle, { color: colors.success }]}>Your data is safe</Text>
          </View>
          <View style={[styles.privacyDivider, { backgroundColor: colors.border }]} />
          <Text style={[styles.privacyText, { color: colors.textSecondary }]}>
            Trackk only wakes up when an expense happens — no background
            activity, no battery drain. Your data stays on your device and
            you can switch off tracking anytime.
          </Text>
          <View style={styles.privacyBadgeRow}>
            <View style={[styles.privacyBadge, { backgroundColor: `${colors.success}15`, borderColor: `${colors.success}25` }]}>
              <Text style={[styles.privacyBadgeText, { color: colors.success }]}>Zero Battery Drain</Text>
            </View>
            <View style={[styles.privacyBadge, { backgroundColor: `${colors.success}15`, borderColor: `${colors.success}25` }]}>
              <Text style={[styles.privacyBadgeText, { color: colors.success }]}>Private & Secure</Text>
            </View>
          </View>
        </View>

        {/* Language Section */}
        <View style={styles.sectionHeader}>
          <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>{t('profile.language').toUpperCase()}</Text>
        </View>

        <TouchableOpacity
          style={[styles.premiumCard, { backgroundColor: colors.surfaceHigh, borderColor: colors.glassBorder }]}
          onPress={() => setShowLanguagePicker(!showLanguagePicker)}
          activeOpacity={0.8}
        >
          <View style={styles.premiumRow}>
            <View style={[styles.premiumIconWrap, { backgroundColor: `${colors.groupColor}18`, borderColor: `${colors.groupColor}30` }]}>
              <Text style={styles.premiumIcon}>
                {SUPPORTED_LANGUAGES.find(l => l.code === i18n.language)?.flag || '🌐'}
              </Text>
            </View>
            <View style={styles.premiumInfo}>
              <Text style={[styles.premiumTitle, { color: colors.text }]}>
                {SUPPORTED_LANGUAGES.find(l => l.code === i18n.language)?.name || 'English'}
              </Text>
              <Text style={[styles.premiumSubtitle, { color: colors.textSecondary }]}>
                {SUPPORTED_LANGUAGES.find(l => l.code === i18n.language)?.englishName || 'English'}
              </Text>
            </View>
            <Text style={[styles.chevron, { color: colors.textSecondary }]}>{showLanguagePicker ? '‹' : '›'}</Text>
          </View>
        </TouchableOpacity>

        {showLanguagePicker && (
          <View style={[styles.emailCard, { marginTop: 8, backgroundColor: colors.glass, borderColor: colors.glassBorder }]}>
            {SUPPORTED_LANGUAGES.map(lang => (
              <TouchableOpacity
                key={lang.code}
                style={[
                  styles.emailProviderRow,
                  { borderTopColor: colors.border },
                  i18n.language === lang.code && { backgroundColor: `${colors.primary}10` },
                ]}
                onPress={async () => {
                  await changeLanguage(lang.code);
                  setShowLanguagePicker(false);
                }}
                activeOpacity={0.7}
              >
                <Text style={{ fontSize: 20, marginRight: 12 }}>{lang.flag}</Text>
                <View style={styles.emailProviderInfo}>
                  <Text style={[styles.emailProviderName, { color: colors.text }]}>{lang.name}</Text>
                  <Text style={[styles.emailProviderStatus, { color: colors.textSecondary }]}>{lang.englishName}</Text>
                </View>
                {i18n.language === lang.code && (
                  <Text style={{ color: colors.primary, fontWeight: '800' }}>✓</Text>
                )}
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* Currency Section */}
        <View style={[styles.sectionHeader, { marginTop: 12 }]}>
          <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>{t('profile.currency').toUpperCase()}</Text>
        </View>

        <TouchableOpacity
          style={[styles.premiumCard, { backgroundColor: colors.surfaceHigh, borderColor: colors.glassBorder }]}
          onPress={() => setShowCurrencyPicker(!showCurrencyPicker)}
          activeOpacity={0.8}
        >
          <View style={styles.premiumRow}>
            <View style={[styles.premiumIconWrap, { backgroundColor: `${colors.warning}18`, borderColor: `${colors.warning}30` }]}>
              <Text style={styles.premiumIcon}>
                {getCurrencyInfo(currentCurrency).flag}
              </Text>
            </View>
            <View style={styles.premiumInfo}>
              <Text style={[styles.premiumTitle, { color: colors.text }]}>
                {getCurrencyInfo(currentCurrency).symbol} {getCurrencyInfo(currentCurrency).code}
              </Text>
              <Text style={[styles.premiumSubtitle, { color: colors.textSecondary }]}>
                {getCurrencyInfo(currentCurrency).name}
              </Text>
            </View>
            <Text style={[styles.chevron, { color: colors.textSecondary }]}>{showCurrencyPicker ? '‹' : '›'}</Text>
          </View>
        </TouchableOpacity>

        {showCurrencyPicker && (
          <View style={[styles.emailCard, { marginTop: 8, backgroundColor: colors.glass, borderColor: colors.glassBorder }]}>
            {CURRENCIES.map(curr => (
              <TouchableOpacity
                key={curr.code}
                style={[
                  styles.emailProviderRow,
                  { borderTopColor: colors.border },
                  currentCurrency === curr.code && { backgroundColor: `${colors.primary}10` },
                ]}
                onPress={async () => {
                  await setPreferredCurrency(curr.code);
                  setCurrentCurrency(curr.code);
                  setShowCurrencyPicker(false);
                }}
                activeOpacity={0.7}
              >
                <Text style={{ fontSize: 20, marginRight: 12 }}>{curr.flag}</Text>
                <View style={styles.emailProviderInfo}>
                  <Text style={[styles.emailProviderName, { color: colors.text }]}>{curr.symbol} {curr.code}</Text>
                  <Text style={[styles.emailProviderStatus, { color: colors.textSecondary }]}>{curr.name}</Text>
                </View>
                {currentCurrency === curr.code && (
                  <Text style={{ color: colors.primary, fontWeight: '800' }}>✓</Text>
                )}
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* About Section */}
        <View style={styles.sectionHeader}>
          <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>{t('profile.about').toUpperCase()}</Text>
        </View>

        <View style={[styles.aboutCard, { backgroundColor: colors.glass, borderColor: colors.glassBorder }]}>
          <TouchableOpacity style={styles.aboutRow} onPress={handleVersionTap} activeOpacity={0.7}>
            <Text style={[styles.aboutLabel, { color: colors.textSecondary }]}>App Version</Text>
            <Text style={[styles.aboutValue, { color: colors.text }]}>1.0.0{devMode ? ' (Dev)' : ''}</Text>
          </TouchableOpacity>
          <View style={[styles.aboutDivider, { backgroundColor: colors.border }]} />
          <View style={styles.aboutRow}>
            <Text style={[styles.aboutLabel, { color: colors.textSecondary }]}>Storage</Text>
            <Text style={[styles.aboutValue, { color: colors.text }]}>Personal data local, groups synced via cloud</Text>
          </View>
        </View>

        {/* Backup & Restore */}
        <View style={[styles.dataSection, { backgroundColor: colors.glass, borderColor: colors.glassBorder }]}>
          <Text style={[styles.dataSectionTitle, { color: colors.textSecondary }]}>DATA</Text>

          <TouchableOpacity
            style={[styles.settingRow, { borderBottomColor: colors.border }]}
            onPress={async () => {
              try {
                await backupAllData();
                Alert.alert('Backup Complete', 'Your data has been exported. Share it to save it safely.');
              } catch (err: any) {
                Alert.alert('Error', err?.message || 'Failed to create backup.');
              }
            }}
            activeOpacity={0.7}
          >
            <View style={[styles.settingIcon, { backgroundColor: `${colors.success}15` }]}>
              <Text style={styles.settingEmoji}>💾</Text>
            </View>
            <View style={styles.settingInfo}>
              <Text style={[styles.settingLabel, { color: colors.text }]}>Backup Data</Text>
              <Text style={[styles.settingSub, { color: colors.textSecondary }]}>Export all personal data as JSON</Text>
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.settingRow, { borderBottomColor: colors.border }]}
            onPress={async () => {
              Alert.alert(
                'Restore Backup',
                'This will replace all your current local data with the backup. Are you sure?',
                [
                  { text: 'Cancel', style: 'cancel' },
                  {
                    text: 'Restore',
                    style: 'destructive',
                    onPress: async () => {
                      try {
                        const result = await restoreFromBackup();
                        if (result) {
                          Alert.alert('Restored', 'Data has been restored from backup. Please restart the app.');
                        }
                      } catch (err: any) {
                        Alert.alert('Error', err?.message || 'Failed to restore backup.');
                      }
                    },
                  },
                ],
              );
            }}
            activeOpacity={0.7}
          >
            <View style={[styles.settingIcon, { backgroundColor: `${colors.warning}15` }]}>
              <Text style={styles.settingEmoji}>📥</Text>
            </View>
            <View style={styles.settingInfo}>
              <Text style={[styles.settingLabel, { color: colors.text }]}>Restore Backup</Text>
              <Text style={[styles.settingSub, { color: colors.textSecondary }]}>Import data from a backup file</Text>
            </View>
          </TouchableOpacity>
        </View>

        {/* Sign Out */}
        <TouchableOpacity
          style={[styles.signOutBtn, { backgroundColor: colors.glass, borderColor: colors.glassBorder }]}
          onPress={() => {
            Alert.alert(
              'Sign Out',
              'Are you sure you want to sign out? Your local data will remain on this device.',
              [
                { text: 'Cancel', style: 'cancel' },
                {
                  text: 'Sign Out',
                  onPress: async () => { await signOut(); },
                },
              ],
            );
          }}
          activeOpacity={0.8}
        >
          <Text style={[styles.signOutBtnText, { color: colors.textSecondary }]}>Sign Out</Text>
        </TouchableOpacity>

        {/* Delete Account */}
        <TouchableOpacity
          style={[styles.deleteAccountBtn, { backgroundColor: `${colors.danger}08`, borderColor: `${colors.danger}20` }]}
          onPress={() => {
            Alert.alert(
              'Delete Account',
              'This will permanently delete ALL your data including expenses, groups, goals, subscriptions, EMIs, and investments. This cannot be undone.',
              [
                { text: 'Cancel', style: 'cancel' },
                {
                  text: 'Delete Everything',
                  style: 'destructive',
                  onPress: () => {
                    Alert.alert(
                      'Are you absolutely sure?',
                      'Type DELETE to confirm account deletion.',
                      [
                        { text: 'Cancel', style: 'cancel' },
                        {
                          text: 'Yes, Delete',
                          style: 'destructive',
                          onPress: async () => {
                            try {
                              await clearAllData(async (groupIds) => {
                                await Promise.all(groupIds.map(id => deleteGroupCloud(id)));
                              });
                              await signOut();
                            } catch (err: any) {
                              Alert.alert('Error', err?.message || 'Failed to delete account.');
                            }
                          },
                        },
                      ],
                    );
                  },
                },
              ],
            );
          }}
          activeOpacity={0.8}
        >
          <Text style={[styles.deleteAccountBtnText, { color: colors.danger }]}>Delete Account</Text>
        </TouchableOpacity>

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  scroll: {
    padding: 16,
    paddingBottom: 32,
  },

  /* ── Header Card ────────────────────────────────────────────── */
  headerCard: {
    borderRadius: 24,
    padding: 24,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: COLORS.glassBorder,
    alignItems: 'center',
    position: 'relative',
    overflow: 'hidden',
  },
  headerGoldLine: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 2,
    backgroundColor: COLORS.primary,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
  },

  /* ── Avatar ─────────────────────────────────────────────────── */
  avatar: {
    width: 88,
    height: 88,
    borderRadius: 44,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
    borderWidth: 3,
    borderColor: `${COLORS.primary}40`,
  },
  avatarText: {
    fontSize: 36,
    fontWeight: '700',
    color: '#FFFFFF',
  },

  /* ── Name ────────────────────────────────────────────────────── */
  nameRow: {
    alignItems: 'center',
    marginBottom: 8,
  },
  displayName: {
    fontSize: 24,
    fontWeight: '700',
    color: COLORS.text,
    letterSpacing: -0.3,
  },
  editHint: {
    fontSize: 11,
    color: COLORS.textSecondary,
    marginTop: 4,
    letterSpacing: 0.5,
  },
  editNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 8,
  },
  nameInput: {
    flex: 1,
    fontSize: 20,
    fontWeight: '700',
    color: COLORS.text,
    backgroundColor: COLORS.surfaceHigh,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: COLORS.primary,
  },
  saveBtn: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
  },
  saveBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.background,
  },

  /* ── Phone ───────────────────────────────────────────────────── */
  phoneRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 4,
  },
  phoneIcon: {
    fontSize: 14,
  },
  phoneText: {
    fontSize: 14,
    color: COLORS.textSecondary,
    letterSpacing: 0.5,
  },
  verifiedBadge: {
    backgroundColor: `${COLORS.success}18`,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: `${COLORS.success}30`,
    marginLeft: 8,
  },
  verifiedText: {
    fontSize: 10,
    fontWeight: '700',
    color: COLORS.success,
    letterSpacing: 0.5,
  },

  /* ── Premium Card ───────────────────────────────────────────── */
  premiumCard: {
    backgroundColor: COLORS.surfaceHigh,
    borderRadius: 20,
    padding: 16,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: COLORS.glassBorder,
  },
  premiumCardActive: {
    borderColor: `${COLORS.primary}30`,
  },
  premiumRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  premiumIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: `${COLORS.primary}18`,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
    borderWidth: 1,
    borderColor: `${COLORS.primary}30`,
  },
  premiumIcon: { fontSize: 22 },
  premiumInfo: { flex: 1 },
  premiumTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.text,
    marginBottom: 2,
  },
  premiumSubtitle: {
    fontSize: 12,
    color: COLORS.textSecondary,
  },
  chevron: {
    fontSize: 22,
    color: COLORS.textSecondary,
    marginLeft: 8,
  },
  premiumExpiry: {
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  premiumExpiryText: {
    fontSize: 12,
    color: COLORS.success,
    fontWeight: '600',
  },

  /* ── Referral Card ─────────────────────────────────────────── */
  referralCard: {
    backgroundColor: COLORS.surfaceHigh,
    borderRadius: 16,
    padding: 16,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
  },

  /* ── Family Upsell ─────────────────────────────────────────── */
  familyUpsell: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: `${COLORS.primary}10`,
    borderRadius: 16,
    padding: 16,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: `${COLORS.primary}20`,
  },
  familyUpsellIcon: { fontSize: 28, marginRight: 12 },
  familyUpsellContent: { flex: 1 },
  familyUpsellTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.text,
    marginBottom: 2,
  },
  familyUpsellText: {
    fontSize: 12,
    color: COLORS.primaryLight,
    fontStyle: 'italic',
  },

  /* ── Section Headers ─────────────────────────────────────────── */
  sectionHeader: {
    marginBottom: 12,
    marginTop: 4,
  },
  sectionTitle: {
    fontSize: 10,
    fontWeight: '700',
    color: COLORS.textSecondary,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },

  /* ── Privacy Card ────────────────────────────────────────────── */
  privacyCard: {
    backgroundColor: COLORS.glass,
    borderRadius: 20,
    padding: 20,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: COLORS.glassBorder,
  },
  privacyHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 12,
  },
  shieldIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: `${COLORS.success}18`,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: `${COLORS.success}30`,
  },
  shieldEmoji: {
    fontSize: 20,
  },
  privacyTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.success,
  },
  privacyDivider: {
    height: 1,
    backgroundColor: COLORS.border,
    marginBottom: 12,
  },
  privacyText: {
    fontSize: 13,
    color: COLORS.textSecondary,
    lineHeight: 20,
    marginBottom: 14,
  },
  privacyBadgeRow: {
    flexDirection: 'row',
    gap: 8,
  },
  privacyBadge: {
    backgroundColor: `${COLORS.success}15`,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: `${COLORS.success}25`,
  },
  privacyBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.success,
    letterSpacing: 0.5,
  },

  /* ── About Card ──────────────────────────────────────────────── */
  aboutCard: {
    backgroundColor: COLORS.glass,
    borderRadius: 20,
    padding: 16,
    marginBottom: 32,
    borderWidth: 1,
    borderColor: COLORS.glassBorder,
  },
  aboutRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 4,
  },
  aboutLabel: {
    fontSize: 14,
    color: COLORS.textSecondary,
  },
  aboutValue: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.text,
    flexShrink: 1,
    textAlign: 'right',
    maxWidth: '60%',
  },
  aboutDivider: {
    height: 1,
    backgroundColor: COLORS.border,
    marginVertical: 12,
  },

  /* ── Email Connection ──────────────────────────────────────── */
  emailCard: {
    backgroundColor: COLORS.glass,
    borderRadius: 20,
    padding: 16,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: COLORS.glassBorder,
  },
  emailCardDesc: {
    fontSize: 12,
    color: COLORS.textSecondary,
    lineHeight: 18,
    marginBottom: 14,
  },
  emailProviderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  emailProviderIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
    borderWidth: 1,
  },
  emailProviderLetter: {
    fontSize: 18,
    fontWeight: '700',
  },
  emailProviderInfo: {
    flex: 1,
  },
  emailProviderName: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.text,
    marginBottom: 2,
  },
  emailProviderEmail: {
    fontSize: 11,
    color: COLORS.success,
    fontWeight: '600',
  },
  emailProviderStatus: {
    fontSize: 11,
    color: COLORS.textSecondary,
  },
  emailConnectBtn: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 10,
    borderWidth: 1,
  },
  emailConnectText: {
    fontSize: 12,
    fontWeight: '700',
  },
  emailDisconnectBtn: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  emailDisconnectText: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.textSecondary,
  },

  /* ── Backup & Restore ─────────────────────────────────────── */
  dataSection: {
    backgroundColor: COLORS.glass,
    borderRadius: 20,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: COLORS.glassBorder,
  },
  dataSectionTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.textSecondary,
    letterSpacing: 1.2,
    marginBottom: 12,
  },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  settingIcon: {
    width: 42,
    height: 42,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  settingEmoji: { fontSize: 20 },
  settingInfo: { flex: 1 },
  settingLabel: { fontSize: 14, fontWeight: '600', color: COLORS.text, marginBottom: 2 },
  settingSub: { fontSize: 11, color: COLORS.textSecondary },

  signOutBtn: {
    borderRadius: 20,
    padding: 16,
    alignItems: 'center',
    marginTop: 16,
    backgroundColor: COLORS.glass,
    borderWidth: 1,
    borderColor: COLORS.glassBorder,
  },
  signOutBtnText: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.textSecondary,
    letterSpacing: 0.3,
  },
  deleteAccountBtn: {
    borderRadius: 20,
    padding: 16,
    alignItems: 'center',
    marginTop: 12,
    backgroundColor: `${COLORS.danger}08`,
    borderWidth: 1,
    borderColor: `${COLORS.danger}20`,
  },
  deleteAccountBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.danger,
    letterSpacing: 0.3,
  },
});
