import React from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { COLORS } from '../utils/helpers';
import { getTestDeepLink } from '../services/DeepLinkService';

const STEPS = [
  {
    emoji: '1',
    title: 'Open Shortcuts App',
    detail: 'Open the built-in Shortcuts app on your iPhone (comes pre-installed with iOS).',
  },
  {
    emoji: '2',
    title: 'Create SMS Automation',
    detail: 'Tap "Automation" tab > tap "+" > select "Message" trigger > set "Message Contains" to "debited" > enable "Run Immediately".',
  },
  {
    emoji: '3',
    title: 'Add Open URL Action',
    detail: 'Add the action "Open URLs" and set the URL to open Trackk with transaction data from the SMS.',
  },
  {
    emoji: '4',
    title: 'Repeat for "spent"',
    detail: 'Create another automation with trigger word "spent" to catch more bank SMS formats.',
  },
];

const APPLE_PAY_STEPS = [
  {
    emoji: '1',
    title: 'Create Transaction Automation',
    detail: 'In Shortcuts > Automation > tap "+" > select "Transaction" trigger (iOS 17+).',
  },
  {
    emoji: '2',
    title: 'Select Your Cards',
    detail: 'Choose which Apple Pay cards to track, or select "Any Card" for all transactions.',
  },
  {
    emoji: '3',
    title: 'Add Open URL Action',
    detail: 'Use "Open URLs" to send the transaction amount and merchant to Trackk automatically.',
  },
];

export default function IOSSetupScreen() {
  const handleTestDeepLink = () => {
    const url = getTestDeepLink();
    Linking.openURL(url);
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <LinearGradient
          colors={['#1C1708', '#0E0C04', COLORS.background]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.headerCard}
        >
          <View style={styles.headerGoldLine} />
          <Text style={styles.headerEmoji}>📱</Text>
          <Text style={styles.headerTitle}>iPhone Setup</Text>
          <Text style={styles.headerSub}>
            Set up iOS Shortcuts to automatically send your bank transactions to Trackk
          </Text>
        </LinearGradient>

        {/* How it works */}
        <View style={styles.infoCard}>
          <Text style={styles.infoTitle}>How it works</Text>
          <Text style={styles.infoText}>
            iOS doesn't allow apps to read SMS directly. Instead, Trackk uses
            Apple's Shortcuts app to detect bank SMS and forward transaction
            data seamlessly — no manual entry needed.
          </Text>
        </View>

        {/* Method 1: SMS Automation */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>METHOD 1: SMS AUTOMATION</Text>
          <View style={styles.recommendedBadge}>
            <Text style={styles.recommendedText}>RECOMMENDED</Text>
          </View>
        </View>

        {STEPS.map((step, i) => (
          <View key={i} style={styles.stepCard}>
            <View style={styles.stepNumber}>
              <Text style={styles.stepNumberText}>{step.emoji}</Text>
            </View>
            <View style={styles.stepContent}>
              <Text style={styles.stepTitle}>{step.title}</Text>
              <Text style={styles.stepDetail}>{step.detail}</Text>
            </View>
          </View>
        ))}

        {/* Deep link URL reference */}
        <View style={styles.codeCard}>
          <Text style={styles.codeLabel}>URL SCHEME</Text>
          <Text style={styles.codeText}>
            trackk://transaction?amount=500{'\n'}&merchant=Swiggy&bank=HDFC
          </Text>
        </View>

        {/* Method 2: Apple Pay */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>METHOD 2: APPLE PAY (iOS 17+)</Text>
        </View>

        {APPLE_PAY_STEPS.map((step, i) => (
          <View key={i} style={styles.stepCard}>
            <View style={[styles.stepNumber, { backgroundColor: `${COLORS.success}20` }]}>
              <Text style={[styles.stepNumberText, { color: COLORS.success }]}>{step.emoji}</Text>
            </View>
            <View style={styles.stepContent}>
              <Text style={styles.stepTitle}>{step.title}</Text>
              <Text style={styles.stepDetail}>{step.detail}</Text>
            </View>
          </View>
        ))}

        {/* Test button */}
        <TouchableOpacity style={styles.testBtn} onPress={handleTestDeepLink}>
          <Text style={styles.testBtnText}>Test Deep Link</Text>
          <Text style={styles.testBtnSub}>Sends a sample transaction to verify setup</Text>
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

  headerCard: {
    borderRadius: 20,
    padding: 24,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: `${COLORS.primary}30`,
    alignItems: 'center',
    position: 'relative',
    overflow: 'hidden',
  },
  headerGoldLine: {
    position: 'absolute',
    top: 0, left: 0, right: 0,
    height: 2,
    backgroundColor: COLORS.primary,
  },
  headerEmoji: {
    fontSize: 40,
    marginBottom: 12,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: COLORS.text,
    marginBottom: 8,
  },
  headerSub: {
    fontSize: 13,
    color: COLORS.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
  },

  infoCard: {
    backgroundColor: `${COLORS.primary}10`,
    borderRadius: 14,
    padding: 16,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: `${COLORS.primary}25`,
  },
  infoTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.primary,
    marginBottom: 8,
  },
  infoText: {
    fontSize: 13,
    color: COLORS.textSecondary,
    lineHeight: 20,
  },

  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    marginTop: 4,
    gap: 10,
  },
  sectionTitle: {
    fontSize: 10,
    fontWeight: '700',
    color: COLORS.textSecondary,
    letterSpacing: 1.5,
  },
  recommendedBadge: {
    backgroundColor: `${COLORS.success}20`,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  recommendedText: {
    fontSize: 9,
    fontWeight: '700',
    color: COLORS.success,
    letterSpacing: 1,
  },

  stepCard: {
    flexDirection: 'row',
    backgroundColor: COLORS.surfaceHigh,
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
    gap: 14,
  },
  stepNumber: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: `${COLORS.primary}20`,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepNumberText: {
    fontSize: 16,
    fontWeight: '800',
    color: COLORS.primary,
  },
  stepContent: {
    flex: 1,
  },
  stepTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.text,
    marginBottom: 4,
  },
  stepDetail: {
    fontSize: 12,
    color: COLORS.textSecondary,
    lineHeight: 18,
  },

  codeCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    padding: 14,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  codeLabel: {
    fontSize: 9,
    fontWeight: '700',
    color: COLORS.textSecondary,
    letterSpacing: 1.5,
    marginBottom: 8,
  },
  codeText: {
    fontSize: 12,
    color: COLORS.primary,
    fontFamily: 'monospace',
    lineHeight: 20,
  },

  testBtn: {
    backgroundColor: COLORS.primary,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 8,
  },
  testBtnText: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.background,
  },
  testBtnSub: {
    fontSize: 11,
    color: `${COLORS.background}90`,
    marginTop: 4,
  },
});
