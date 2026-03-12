import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, Alert, ActivityIndicator, Platform, Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { hapticDevMode } from '../utils/haptics';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/AppNavigator';
import { useAuth } from '../store/AuthContext';
import { usePremium } from '../store/PremiumContext';
import { COLORS } from '../utils/helpers';
import { isDevMode, setDevMode, loadDevMode } from '../utils/devMode';
import {
  EmailProvider, connectEmail, disconnectEmail, parseOAuthRedirect,
  getProviderDisplayName, getProviderColor,
} from '../services/EmailService';
import { db } from '../services/FirebaseConfig';

type Nav = NativeStackNavigationProp<RootStackParamList>;

export default function ProfileScreen() {
  const nav = useNavigation<Nav>();
  const { user, updateProfile, signOut } = useAuth();
  const { isPremium, isFamily, currentPlan, subscription, referralStats } = usePremium();
  const [isEditingName, setIsEditingName] = useState(false);
  const [editName, setEditName] = useState(user?.displayName || '');
  const [connectedEmails, setConnectedEmails] = useState<Record<EmailProvider, string | null>>({
    gmail: null, outlook: null, yahoo: null,
  });
  const [connectingProvider, setConnectingProvider] = useState<EmailProvider | null>(null);
  const [devMode, setDevModeState] = useState(false);
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

  // Listen for OAuth redirects
  useEffect(() => {
    const handleUrl = async (event: { url: string }) => {
      const parsed = parseOAuthRedirect(event.url);
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

    const subscription = Linking.addEventListener('url', handleUrl);
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
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <LinearGradient
          colors={['#1A1210', '#100C0A', COLORS.background]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.headerCard}
        >
          <View style={styles.headerGoldLine} />

          {/* Avatar */}
          <View style={[styles.avatar, { backgroundColor: avatarColor }]}>
            <Text style={styles.avatarText}>{initial}</Text>
          </View>

          {/* Display Name */}
          {isEditingName ? (
            <View style={styles.editNameRow}>
              <TextInput
                style={styles.nameInput}
                value={editName}
                onChangeText={setEditName}
                autoFocus
                maxLength={30}
                placeholderTextColor={COLORS.textSecondary}
                selectionColor={COLORS.primary}
                onSubmitEditing={handleSaveName}
                returnKeyType="done"
              />
              <TouchableOpacity style={styles.saveBtn} onPress={handleSaveName}>
                <Text style={styles.saveBtnText}>Save</Text>
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
              <Text style={styles.displayName}>{user?.displayName || 'User'}</Text>
              <Text style={styles.editHint}>tap to edit</Text>
            </TouchableOpacity>
          )}

          {/* Phone */}
          {user?.phone ? (
            <View style={styles.phoneRow}>
              <Text style={styles.phoneIcon}>📱</Text>
              <Text style={styles.phoneText}>+91 {user.phone}</Text>
              <View style={styles.verifiedBadge}>
                <Text style={styles.verifiedText}>Verified</Text>
              </View>
            </View>
          ) : null}
        </LinearGradient>

        {/* ── Premium Status ─────────────────────────────────────── */}
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

        {/* ── Refer & Earn ──────────────────────────────────────── */}
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

        {/* ── Family Plan Upsell ────────────────────────────────── */}
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

        {/* ── Connect Email ─────────────────────────────────────── */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>EMAIL TRANSACTION DETECTION</Text>
        </View>

        <View style={styles.emailCard}>
          <Text style={styles.emailCardDesc}>
            We only connect your email if you allow us to — and only for detecting transaction alerts. Your data stays private, is never shared, and you can disconnect and delete it anytime.
          </Text>

          {(['gmail', 'outlook', 'yahoo'] as EmailProvider[]).map((provider) => {
            const email = connectedEmails[provider];
            const isConnecting = connectingProvider === provider;
            const color = getProviderColor(provider);

            return (
              <View key={provider} style={styles.emailProviderRow}>
                <View style={[styles.emailProviderIcon, { backgroundColor: `${color}18`, borderColor: `${color}30` }]}>
                  <Text style={[styles.emailProviderLetter, { color }]}>
                    {provider === 'gmail' ? 'G' : provider === 'outlook' ? 'O' : 'Y'}
                  </Text>
                </View>
                <View style={styles.emailProviderInfo}>
                  <Text style={styles.emailProviderName}>{getProviderDisplayName(provider)}</Text>
                  {email ? (
                    <Text style={styles.emailProviderEmail} numberOfLines={1}>{email}</Text>
                  ) : (
                    <Text style={styles.emailProviderStatus}>Not connected</Text>
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
                      Alert.alert(
                        `Connect ${getProviderDisplayName(provider)}`,
                        'Email OAuth setup is required before this feature works. See RELEASE_CHECKLIST.md for setup instructions.\n\nOnce configured, tapping Connect will open your browser to sign in.',
                        [{ text: 'OK' }],
                      );
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
          <Text style={styles.sectionTitle}>PRIVACY & DATA</Text>
        </View>

        <View style={styles.privacyCard}>
          <View style={styles.privacyHeader}>
            <View style={styles.shieldIcon}>
              <Text style={styles.shieldEmoji}>🛡️</Text>
            </View>
            <Text style={styles.privacyTitle}>Your data is safe</Text>
          </View>
          <View style={styles.privacyDivider} />
          <Text style={styles.privacyText}>
            Trackk uses event-driven SMS detection — it only wakes up when a
            new bank SMS arrives. No background polling, no battery drain. You
            can switch off tracking anytime.
          </Text>
          <View style={styles.privacyBadgeRow}>
            <View style={styles.privacyBadge}>
              <Text style={styles.privacyBadgeText}>Low Battery Usage</Text>
            </View>
            <View style={styles.privacyBadge}>
              <Text style={styles.privacyBadgeText}>SMS Only When Active</Text>
            </View>
          </View>
        </View>

        {/* About Section */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>ABOUT</Text>
        </View>

        <View style={styles.aboutCard}>
          <TouchableOpacity style={styles.aboutRow} onPress={handleVersionTap} activeOpacity={0.7}>
            <Text style={styles.aboutLabel}>App Version</Text>
            <Text style={styles.aboutValue}>1.0.0{devMode ? ' (Dev)' : ''}</Text>
          </TouchableOpacity>
          <View style={styles.aboutDivider} />
          <View style={styles.aboutRow}>
            <Text style={styles.aboutLabel}>Storage</Text>
            <Text style={styles.aboutValue}>Personal data local, groups synced via cloud</Text>
          </View>
        </View>

        {/* Sign Out */}
        <TouchableOpacity
          style={styles.signOutBtn}
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
          <Text style={styles.signOutBtnText}>Sign Out</Text>
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
    fontWeight: '800',
    color: '#FFFFFF',
  },

  /* ── Name ────────────────────────────────────────────────────── */
  nameRow: {
    alignItems: 'center',
    marginBottom: 8,
  },
  displayName: {
    fontSize: 24,
    fontWeight: '800',
    color: COLORS.text,
    letterSpacing: -0.5,
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
    fontWeight: '800',
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
});
