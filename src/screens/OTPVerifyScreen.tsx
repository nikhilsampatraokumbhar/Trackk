import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Alert,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { useRoute, RouteProp } from '@react-navigation/native';
import { COLORS } from '../utils/helpers';
import { verifyOtp, updateUserProfile, getUserProfile } from '../services/FirebaseService';
import { useAuth } from '../store/AuthContext';

type OTPRouteParams = {
  OTPVerify: { phone: string; confirmation: any };
};
type RouteProps = RouteProp<OTPRouteParams, 'OTPVerify'>;

const DEV_MODE = true; // mirrors DEV_MOCK_OTP in FirebaseService

export function OTPVerifyScreen() {
  const route = useRoute<RouteProps>();
  const { phone, confirmation } = route.params;
  const { onOtpVerified } = useAuth();

  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState<'otp' | 'name'>('otp');
  // Store uid after first successful verification so we don't re-verify
  const [verifiedUid, setVerifiedUid] = useState<string | null>(null);

  const handleVerify = async () => {
    if (code.length < 6) {
      Alert.alert('Invalid OTP', 'Please enter the 6-digit code');
      return;
    }
    setLoading(true);
    try {
      const uid = await verifyOtp(confirmation, code);
      setVerifiedUid(uid);
      const existing = await getUserProfile(uid);
      if (existing?.displayName && existing.displayName !== 'User') {
        // Returning user — go straight in
        await onOtpVerified(uid, existing.displayName, phone);
      } else {
        // New user — ask for name
        setStep('name');
      }
    } catch (err: any) {
      Alert.alert('Wrong OTP', err.message || 'The code is incorrect. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleSaveName = async () => {
    if (!name.trim()) {
      Alert.alert('Name required', 'Please enter your name');
      return;
    }
    if (!verifiedUid) return;
    setLoading(true);
    try {
      await updateUserProfile(verifiedUid, {
        id: verifiedUid,
        displayName: name.trim(),
        phone,
        createdAt: Date.now(),
      });
      await onOtpVerified(verifiedUid, name.trim(), phone);
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Could not save profile. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  if (step === 'name') {
    return (
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.inner}>
          <View style={styles.card}>
            <Text style={styles.cardTitle}>What's your name?</Text>
            <Text style={styles.cardSubtitle}>This is shown to your group members</Text>
            <TextInput
              style={styles.nameInput}
              value={name}
              onChangeText={setName}
              placeholder="Your name"
              placeholderTextColor={COLORS.textLight}
              autoFocus
              maxLength={40}
            />
            <TouchableOpacity
              style={[styles.primaryButton, (!name.trim() || loading) && styles.buttonDisabled]}
              onPress={handleSaveName}
              disabled={!name.trim() || loading}
              activeOpacity={0.8}>
              {loading ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text style={styles.primaryButtonText}>Get Started</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.inner}>
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Enter OTP</Text>
          <Text style={styles.cardSubtitle}>
            We sent a 6-digit code to{'\n'}
            <Text style={styles.phoneHighlight}>{phone}</Text>
          </Text>

          {DEV_MODE && (
            <View style={styles.devBanner}>
              <Text style={styles.devBannerText}>
                Dev mode — enter any 6 digits to continue
              </Text>
            </View>
          )}

          <TextInput
            style={styles.otpInput}
            value={code}
            onChangeText={v => setCode(v.replace(/\D/g, '').slice(0, 6))}
            placeholder="------"
            placeholderTextColor={COLORS.textLight}
            keyboardType="number-pad"
            maxLength={6}
            autoFocus
            textAlign="center"
          />

          <TouchableOpacity
            style={[styles.primaryButton, (code.length < 6 || loading) && styles.buttonDisabled]}
            onPress={handleVerify}
            disabled={code.length < 6 || loading}
            activeOpacity={0.8}>
            {loading ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={styles.primaryButtonText}>Verify & Continue</Text>
            )}
          </TouchableOpacity>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.primary },
  inner: { flex: 1, justifyContent: 'center', padding: 20 },
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: 20,
    padding: 24,
    elevation: 4,
  },
  cardTitle: { fontSize: 24, fontWeight: '800', color: COLORS.text, marginBottom: 8 },
  cardSubtitle: { fontSize: 14, color: COLORS.textSecondary, lineHeight: 20, marginBottom: 16 },
  phoneHighlight: { fontWeight: '700', color: COLORS.text },
  devBanner: {
    backgroundColor: COLORS.warning + '25',
    borderWidth: 1,
    borderColor: COLORS.warning + '60',
    borderRadius: 8,
    padding: 10,
    marginBottom: 16,
  },
  devBannerText: {
    fontSize: 12,
    color: COLORS.warning,
    fontWeight: '600',
    textAlign: 'center',
  },
  otpInput: {
    fontSize: 32,
    fontWeight: '900',
    color: COLORS.text,
    letterSpacing: 10,
    borderWidth: 1.5,
    borderColor: COLORS.border,
    borderRadius: 12,
    paddingVertical: 16,
    marginBottom: 20,
  },
  nameInput: {
    fontSize: 18,
    fontWeight: '600',
    color: COLORS.text,
    borderWidth: 1.5,
    borderColor: COLORS.border,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginBottom: 20,
  },
  primaryButton: {
    backgroundColor: COLORS.primary,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    elevation: 2,
  },
  buttonDisabled: { opacity: 0.5 },
  primaryButtonText: { color: '#FFFFFF', fontSize: 17, fontWeight: '700' },
});
