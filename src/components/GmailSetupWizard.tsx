import React, { useState, useEffect } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  ActivityIndicator,
} from 'react-native';
import { COLORS } from '../utils/helpers';
import { useTracker } from '../store/TrackerContext';

// ── Step definitions ──────────────────────────────────────────────────────────

const STEPS = [
  {
    icon: '📧',
    title: 'Auto-detect bank\ntransactions',
    body: 'On iPhone, SMS access isn\'t available — so we read only your bank transaction emails (HDFC, ICICI, SBI, etc.). No other emails are ever touched.',
    cta: 'How is it kept private?',
  },
  {
    icon: '🔒',
    title: 'Stays completely\nprivate',
    body: 'All reading happens on your device only. No raw email content is ever sent to our servers. You see and approve every transaction before anything is saved.',
    cta: 'Got it — connect now',
  },
  {
    icon: '✉️',
    title: 'Connect your Gmail\naccount',
    body: "Tap below. You'll see Google's standard sign-in screen — the same one used by millions of apps.",
    cta: 'Connect Gmail Account',
  },
];

// ── Component ─────────────────────────────────────────────────────────────────

interface Props {
  visible: boolean;
  onDismiss: () => void;
}

export function GmailSetupWizard({ visible, onDismiss }: Props) {
  const [step, setStep] = useState(0);
  const [connecting, setConnecting] = useState(false);
  const { connectGmail } = useTracker();

  // Reset to first step whenever wizard opens
  useEffect(() => {
    if (visible) setStep(0);
  }, [visible]);

  const handleCta = async () => {
    if (step < STEPS.length - 1) {
      setStep(s => s + 1);
      return;
    }
    // Last step: trigger Google sign-in
    setConnecting(true);
    try {
      await connectGmail();
      onDismiss();
    } catch {
      // stay open so user can retry or skip
    } finally {
      setConnecting(false);
    }
  };

  const handleSkip = () => {
    setStep(0);
    onDismiss();
  };

  const current = STEPS[step];
  const isLastStep = step === STEPS.length - 1;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={handleSkip}>
      <View style={styles.overlay}>
        <SafeAreaView style={styles.sheet}>
          {/* Drag handle */}
          <View style={styles.handle} />

          {/* Step progress dots */}
          <View style={styles.dots}>
            {STEPS.map((_, i) => (
              <View key={i} style={[styles.dot, i === step && styles.dotActive]} />
            ))}
          </View>

          {/* Icon */}
          <View style={[styles.iconRing, isLastStep && styles.iconRingConnect]}>
            <Text style={styles.iconText}>{current.icon}</Text>
          </View>

          {/* Text content */}
          <Text style={styles.title}>{current.title}</Text>
          <Text style={styles.body}>{current.body}</Text>

          {/* Primary CTA — one big tap per step */}
          <TouchableOpacity
            style={[styles.cta, isLastStep && styles.ctaConnect]}
            onPress={handleCta}
            activeOpacity={0.82}
            disabled={connecting}>
            {connecting ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={styles.ctaText}>{current.cta}</Text>
            )}
          </TouchableOpacity>

          {/* Skip */}
          <TouchableOpacity onPress={handleSkip} style={styles.skip} activeOpacity={0.6}>
            <Text style={styles.skipText}>Skip for now</Text>
          </TouchableOpacity>
        </SafeAreaView>
      </View>
    </Modal>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: '#000000B0',
  },
  sheet: {
    backgroundColor: COLORS.surfaceElevated,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 28,
    paddingBottom: 12,
    alignItems: 'center',
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: COLORS.border,
    marginTop: 14,
    marginBottom: 24,
  },

  // Dots
  dots: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 32,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: COLORS.border,
  },
  dotActive: {
    width: 28,
    backgroundColor: COLORS.primary,
  },

  // Icon ring
  iconRing: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: COLORS.primary + '18',
    borderWidth: 1,
    borderColor: COLORS.primary + '35',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
  },
  iconRingConnect: {
    backgroundColor: '#EA433518',
    borderColor: '#EA433535',
  },
  iconText: { fontSize: 38 },

  // Text
  title: {
    fontSize: 26,
    fontWeight: '900',
    color: COLORS.text,
    textAlign: 'center',
    lineHeight: 32,
    marginBottom: 14,
    letterSpacing: 0.2,
  },
  body: {
    fontSize: 15,
    color: COLORS.textSecondary,
    textAlign: 'center',
    lineHeight: 23,
    marginBottom: 36,
  },

  // CTA button
  cta: {
    width: '100%',
    backgroundColor: COLORS.primary,
    borderRadius: 16,
    paddingVertical: 17,
    alignItems: 'center',
    marginBottom: 14,
  },
  ctaConnect: {
    backgroundColor: '#EA4335',
  },
  ctaText: {
    fontSize: 16,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: 0.3,
  },

  // Skip link
  skip: {
    paddingVertical: 10,
    marginBottom: 6,
  },
  skipText: {
    fontSize: 14,
    color: COLORS.textLight,
    fontWeight: '500',
  },
});
