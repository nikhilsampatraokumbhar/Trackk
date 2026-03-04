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
    icon: '💳',
    title: 'Track corporate\ncard spends',
    body: 'When your company card is swiped, the bank sends an alert to your work Outlook inbox. We read only those alert emails — nothing else.',
    cta: 'How does it stay private?',
  },
  {
    icon: '🔒',
    title: 'Work email\nstays private',
    body: 'All reading happens on your device only. No email content is sent to our servers. Only the amount and merchant are extracted — and you approve every entry.',
    cta: 'Got it — connect now',
  },
  {
    icon: '📨',
    title: 'Connect your\nwork email',
    body: "Tap below. You'll see Microsoft's standard sign-in screen. Sign in with the Outlook account that receives your corporate card alerts.",
    cta: 'Connect Work Email',
  },
];

// ── Component ─────────────────────────────────────────────────────────────────

interface Props {
  visible: boolean;
  onDismiss: () => void;
}

export function OutlookSetupWizard({ visible, onDismiss }: Props) {
  const [step, setStep] = useState(0);
  const [connecting, setConnecting] = useState(false);
  const { connectOutlook } = useTracker();

  useEffect(() => {
    if (visible) setStep(0);
  }, [visible]);

  const handleCta = async () => {
    if (step < STEPS.length - 1) {
      setStep(s => s + 1);
      return;
    }
    setConnecting(true);
    try {
      await connectOutlook();
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
          <View style={styles.handle} />

          {/* Step dots */}
          <View style={styles.dots}>
            {STEPS.map((_, i) => (
              <View key={i} style={[styles.dot, i === step && styles.dotActive]} />
            ))}
          </View>

          {/* Icon */}
          <View style={[styles.iconRing, isLastStep && styles.iconRingConnect]}>
            <Text style={styles.iconText}>{current.icon}</Text>
          </View>

          <Text style={styles.title}>{current.title}</Text>
          <Text style={styles.body}>{current.body}</Text>

          {/* Primary CTA */}
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
    backgroundColor: COLORS.reimbursementColor,
  },
  iconRing: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: COLORS.reimbursementColor + '18',
    borderWidth: 1,
    borderColor: COLORS.reimbursementColor + '35',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
  },
  iconRingConnect: {
    backgroundColor: '#0078D418',
    borderColor: '#0078D435',
  },
  iconText: { fontSize: 38 },
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
  cta: {
    width: '100%',
    backgroundColor: COLORS.reimbursementColor,
    borderRadius: 16,
    paddingVertical: 17,
    alignItems: 'center',
    marginBottom: 14,
  },
  ctaConnect: {
    backgroundColor: '#0078D4', // Microsoft blue
  },
  ctaText: {
    fontSize: 16,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: 0.3,
  },
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
