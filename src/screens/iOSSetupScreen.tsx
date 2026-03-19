import React, { useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Linking,
  Alert, Clipboard,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../store/ThemeContext';
import { COLORS } from '../utils/helpers';
import { getTestDeepLink } from '../services/DeepLinkService';

// ─── Pre-built Shortcut URLs ────────────────────────────────────────────────
// These are iCloud Shortcut links that users can tap to install directly.
// To generate: Build the shortcut in Shortcuts app > Share > Copy iCloud Link
// Replace these with actual hosted shortcut links after creating them.
const SHORTCUT_SMS_URL = 'https://www.icloud.com/shortcuts/trackk-sms-automation';
const SHORTCUT_APPLEPAY_URL = 'https://www.icloud.com/shortcuts/trackk-applepay-automation';

const DEEP_LINK_URL = 'trackk://transaction?amount=AMOUNT&merchant=MERCHANT&bank=BANK';

const SMS_STEPS = [
  {
    number: '1',
    title: 'Install the Shortcut',
    detail: 'Tap the button below to install our pre-built SMS automation shortcut. It detects bank SMS containing "debited" or "spent" and forwards the data to Trackk.',
    hasAction: true,
    actionLabel: 'Install SMS Shortcut',
    actionUrl: SHORTCUT_SMS_URL,
  },
  {
    number: '2',
    title: 'Enable the Automation',
    detail: 'Open Shortcuts app > Automation tab > find "Trackk SMS" > enable "Run Immediately" and disable "Notify When Run".',
  },
  {
    number: '3',
    title: 'Done!',
    detail: 'Your bank SMS will now automatically forward transaction data to Trackk. Test it with the button below.',
  },
];

const APPLEPAY_STEPS = [
  {
    number: '1',
    title: 'Install Apple Pay Shortcut',
    detail: 'Tap to install the pre-built Apple Pay automation (requires iOS 17+). It triggers on every Apple Pay transaction.',
    hasAction: true,
    actionLabel: 'Install Apple Pay Shortcut',
    actionUrl: SHORTCUT_APPLEPAY_URL,
  },
  {
    number: '2',
    title: 'Select Your Cards',
    detail: 'In the automation settings, choose which Apple Pay cards to track or select "Any Card" for all.',
  },
  {
    number: '3',
    title: 'Enable the Automation',
    detail: 'Set "Run Immediately" and turn off notifications. Trackk will receive the amount and merchant instantly.',
  },
];

const MANUAL_STEPS = [
  {
    number: '1',
    title: 'Open Shortcuts App',
    detail: 'Open the built-in Shortcuts app on your iPhone.',
  },
  {
    number: '2',
    title: 'Create New Automation',
    detail: 'Tap "Automation" tab > "+" > "Message" trigger > set "Message Contains" to "debited" > enable "Run Immediately".',
  },
  {
    number: '3',
    title: 'Add Open URL Action',
    detail: 'Add "Open URLs" action with the Trackk URL scheme below. Use Shortcuts text parsing to extract amount and merchant.',
  },
  {
    number: '4',
    title: 'Repeat for "spent"',
    detail: 'Create another automation with "spent" as the trigger word for broader bank SMS coverage.',
  },
];

export default function IOSSetupScreen() {
  const { colors } = useTheme();
  const [showManual, setShowManual] = useState(false);
  const [copiedUrl, setCopiedUrl] = useState(false);

  const handleTestDeepLink = () => {
    const url = getTestDeepLink();
    Linking.openURL(url);
  };

  const handleInstallShortcut = async (url: string) => {
    try {
      const canOpen = await Linking.canOpenURL(url);
      if (canOpen) {
        await Linking.openURL(url);
      } else {
        Alert.alert(
          'Shortcut Link',
          'The pre-built shortcut will be available once published to iCloud. For now, use the manual setup below.',
          [{ text: 'OK' }],
        );
      }
    } catch {
      Alert.alert('Error', 'Could not open the shortcut link.');
    }
  };

  const handleCopyUrl = () => {
    Clipboard.setString(DEEP_LINK_URL);
    setCopiedUrl(true);
    setTimeout(() => setCopiedUrl(false), 2000);
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={[styles.headerCard, { backgroundColor: colors.surface, borderColor: `${colors.primary}30` }]}>
          <View style={styles.headerGoldLine} />
          <Text style={styles.headerEmoji}>📱</Text>
          <Text style={styles.headerTitle}>iPhone Auto-Tracking</Text>
          <Text style={styles.headerSub}>
            Get near-instant transaction detection using iOS Shortcuts automation
          </Text>
        </View>

        {/* How it works */}
        <View style={styles.infoCard}>
          <Text style={styles.infoTitle}>How it works</Text>
          <Text style={styles.infoText}>
            iOS doesn't allow apps to read SMS directly. Instead, we use Apple's
            Shortcuts automation to detect bank SMS keywords and forward transaction
            data to Trackk instantly — the closest replacement for SMS reading on iOS.
          </Text>
          <View style={styles.latencyBadge}>
            <Text style={styles.latencyText}>Latency: ~instant</Text>
          </View>
        </View>

        {/* Method 1: One-tap SMS Install */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>METHOD 1: SMS AUTOMATION</Text>
          <View style={styles.recommendedBadge}>
            <Text style={styles.recommendedText}>RECOMMENDED</Text>
          </View>
        </View>

        {SMS_STEPS.map((step, i) => (
          <View key={i} style={styles.stepCard}>
            <View style={styles.stepNumber}>
              <Text style={styles.stepNumberText}>{step.number}</Text>
            </View>
            <View style={styles.stepContent}>
              <Text style={styles.stepTitle}>{step.title}</Text>
              <Text style={styles.stepDetail}>{step.detail}</Text>
              {step.hasAction && (
                <TouchableOpacity
                  style={[styles.installBtn, { backgroundColor: colors.primary }]}
                  onPress={() => handleInstallShortcut(step.actionUrl!)}
                  activeOpacity={0.8}
                >
                  <View style={styles.installBtnGradient}>
                    <Text style={styles.installBtnText}>{step.actionLabel}</Text>
                  </View>
                </TouchableOpacity>
              )}
            </View>
          </View>
        ))}

        {/* Method 2: Apple Pay */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>METHOD 2: APPLE PAY (iOS 17+)</Text>
        </View>

        {APPLEPAY_STEPS.map((step, i) => (
          <View key={i} style={styles.stepCard}>
            <View style={[styles.stepNumber, { backgroundColor: `${COLORS.success}20` }]}>
              <Text style={[styles.stepNumberText, { color: COLORS.success }]}>{step.number}</Text>
            </View>
            <View style={styles.stepContent}>
              <Text style={styles.stepTitle}>{step.title}</Text>
              <Text style={styles.stepDetail}>{step.detail}</Text>
              {step.hasAction && (
                <TouchableOpacity
                  style={styles.installBtn}
                  onPress={() => handleInstallShortcut(step.actionUrl!)}
                  activeOpacity={0.8}
                >
                  <View style={[styles.installBtnGradient, { backgroundColor: `${COLORS.success}20` }]}>
                    <Text style={[styles.installBtnText, { color: COLORS.success }]}>{step.actionLabel}</Text>
                  </View>
                </TouchableOpacity>
              )}
            </View>
          </View>
        ))}

        {/* URL Scheme Reference */}
        <TouchableOpacity style={styles.codeCard} onPress={handleCopyUrl} activeOpacity={0.8}>
          <View style={styles.codeHeader}>
            <Text style={styles.codeLabel}>URL SCHEME</Text>
            <Text style={styles.copyText}>{copiedUrl ? 'Copied!' : 'Tap to copy'}</Text>
          </View>
          <Text style={styles.codeText}>{DEEP_LINK_URL}</Text>
        </TouchableOpacity>

        {/* Manual Setup Toggle */}
        <TouchableOpacity
          style={styles.manualToggle}
          onPress={() => setShowManual(!showManual)}
          activeOpacity={0.7}
        >
          <Text style={styles.manualToggleText}>
            {showManual ? 'Hide Manual Setup' : 'Show Manual Setup (Advanced)'}
          </Text>
          <Text style={styles.manualToggleArrow}>{showManual ? '▲' : '▼'}</Text>
        </TouchableOpacity>

        {showManual && (
          <>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>MANUAL SETUP</Text>
            </View>
            {MANUAL_STEPS.map((step, i) => (
              <View key={i} style={styles.stepCard}>
                <View style={[styles.stepNumber, { backgroundColor: `${COLORS.warning}20` }]}>
                  <Text style={[styles.stepNumberText, { color: COLORS.warning }]}>{step.number}</Text>
                </View>
                <View style={styles.stepContent}>
                  <Text style={styles.stepTitle}>{step.title}</Text>
                  <Text style={styles.stepDetail}>{step.detail}</Text>
                </View>
              </View>
            ))}
          </>
        )}

        {/* Test button */}
        <TouchableOpacity style={styles.testBtn} onPress={handleTestDeepLink}>
          <Text style={styles.testBtnText}>Test Deep Link</Text>
          <Text style={styles.testBtnSub}>Sends a sample transaction to verify setup</Text>
        </TouchableOpacity>

        {/* Email note */}
        <View style={styles.emailNote}>
          <Text style={styles.emailNoteTitle}>Also connect your email</Text>
          <Text style={styles.emailNoteText}>
            For backup detection, connect Gmail/Outlook in Profile {'>'} Email Connections.
            Email + Shortcuts together = maximum coverage.
          </Text>
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  scroll: { padding: 16, paddingBottom: 32 },

  headerCard: {
    borderRadius: 20, padding: 24, marginBottom: 20,
    borderWidth: 1, borderColor: `${COLORS.primary}30`,
    alignItems: 'center', overflow: 'hidden',
  },
  headerGoldLine: {
    position: 'absolute', top: 0, left: 0, right: 0,
    height: 2, backgroundColor: COLORS.primary,
  },
  headerEmoji: { fontSize: 40, marginBottom: 12 },
  headerTitle: { fontSize: 22, fontWeight: '800', color: COLORS.text, marginBottom: 8 },
  headerSub: { fontSize: 13, color: COLORS.textSecondary, textAlign: 'center', lineHeight: 20 },

  infoCard: {
    backgroundColor: `${COLORS.primary}10`, borderRadius: 14, padding: 16,
    marginBottom: 20, borderWidth: 1, borderColor: `${COLORS.primary}25`,
  },
  infoTitle: { fontSize: 14, fontWeight: '700', color: COLORS.primary, marginBottom: 8 },
  infoText: { fontSize: 13, color: COLORS.textSecondary, lineHeight: 20 },
  latencyBadge: {
    backgroundColor: `${COLORS.success}15`, paddingHorizontal: 10, paddingVertical: 4,
    borderRadius: 8, alignSelf: 'flex-start', marginTop: 10,
  },
  latencyText: { fontSize: 11, fontWeight: '700', color: COLORS.success, letterSpacing: 0.5 },

  sectionHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 12, marginTop: 4, gap: 10 },
  sectionTitle: { fontSize: 10, fontWeight: '700', color: COLORS.textSecondary, letterSpacing: 1.5 },
  recommendedBadge: { backgroundColor: `${COLORS.success}20`, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  recommendedText: { fontSize: 9, fontWeight: '700', color: COLORS.success, letterSpacing: 1 },

  stepCard: {
    flexDirection: 'row', backgroundColor: COLORS.surfaceHigh, borderRadius: 14,
    padding: 14, marginBottom: 10, borderWidth: 1, borderColor: COLORS.border, gap: 14,
  },
  stepNumber: { width: 36, height: 36, borderRadius: 10, backgroundColor: `${COLORS.primary}20`, alignItems: 'center', justifyContent: 'center' },
  stepNumberText: { fontSize: 16, fontWeight: '800', color: COLORS.primary },
  stepContent: { flex: 1 },
  stepTitle: { fontSize: 14, fontWeight: '700', color: COLORS.text, marginBottom: 4 },
  stepDetail: { fontSize: 12, color: COLORS.textSecondary, lineHeight: 18 },

  installBtn: { borderRadius: 10, overflow: 'hidden', marginTop: 10 },
  installBtnGradient: { paddingVertical: 10, paddingHorizontal: 16, alignItems: 'center', borderRadius: 10 },
  installBtnText: { fontSize: 13, fontWeight: '700', color: '#FFFFFF' },

  codeCard: {
    backgroundColor: COLORS.surface, borderRadius: 12, padding: 14,
    marginBottom: 16, borderWidth: 1, borderColor: COLORS.border,
  },
  codeHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  codeLabel: { fontSize: 9, fontWeight: '700', color: COLORS.textSecondary, letterSpacing: 1.5 },
  copyText: { fontSize: 10, fontWeight: '600', color: COLORS.primary },
  codeText: { fontSize: 12, color: COLORS.primary, fontFamily: 'monospace', lineHeight: 20 },

  manualToggle: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    padding: 14, backgroundColor: COLORS.glass, borderRadius: 12,
    marginBottom: 16, borderWidth: 1, borderColor: COLORS.glassBorder,
  },
  manualToggleText: { fontSize: 13, fontWeight: '600', color: COLORS.textSecondary },
  manualToggleArrow: { fontSize: 10, color: COLORS.textSecondary },

  testBtn: { backgroundColor: COLORS.primary, borderRadius: 14, paddingVertical: 16, alignItems: 'center', marginTop: 8 },
  testBtnText: { fontSize: 15, fontWeight: '700', color: COLORS.background },
  testBtnSub: { fontSize: 11, color: `${COLORS.background}90`, marginTop: 4 },

  emailNote: {
    backgroundColor: `${COLORS.primary}08`, borderRadius: 12, padding: 14,
    marginTop: 16, borderWidth: 1, borderColor: `${COLORS.primary}15`,
  },
  emailNoteTitle: { fontSize: 13, fontWeight: '700', color: COLORS.primary, marginBottom: 4 },
  emailNoteText: { fontSize: 12, color: COLORS.textSecondary, lineHeight: 18 },
});
