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
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { AuthStackParamList } from '../models/types';
import { COLORS } from '../utils/helpers';
import { sendOtp } from '../services/FirebaseService';

type Nav = NativeStackNavigationProp<AuthStackParamList, 'Login'>;

export function LoginScreen() {
  const navigation = useNavigation<Nav>();
  const [phone, setPhone] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSendOtp = async () => {
    const cleaned = phone.replace(/\s/g, '');
    if (cleaned.length < 10) {
      Alert.alert('Invalid number', 'Please enter a valid 10-digit mobile number');
      return;
    }

    // Prepend country code if not present
    const fullPhone = cleaned.startsWith('+') ? cleaned : `+91${cleaned}`;

    setLoading(true);
    try {
      const confirmation = await sendOtp(fullPhone);
      navigation.navigate('OTPVerify', { phone: fullPhone, confirmation } as any);
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to send OTP. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.inner}>
        {/* Logo / brand */}
        <View style={styles.brandSection}>
          <View style={styles.logoCircle}>
            <Text style={styles.logoText}>₹</Text>
          </View>
          <Text style={styles.appName}>TrackSplit</Text>
          <Text style={styles.tagline}>Smart expense tracking & group splits</Text>
        </View>

        {/* Phone input */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Welcome!</Text>
          <Text style={styles.cardSubtitle}>
            Enter your mobile number to sign in or create an account
          </Text>

          <View style={styles.phoneRow}>
            <View style={styles.countryCode}>
              <Text style={styles.countryCodeText}>+91</Text>
            </View>
            <TextInput
              style={styles.phoneInput}
              value={phone}
              onChangeText={setPhone}
              placeholder="Mobile number"
              placeholderTextColor={COLORS.textLight}
              keyboardType="phone-pad"
              maxLength={10}
              autoFocus
            />
          </View>

          <TouchableOpacity
            style={[styles.sendButton, (loading || phone.length < 10) && styles.sendButtonDisabled]}
            onPress={handleSendOtp}
            disabled={loading || phone.length < 10}
            activeOpacity={0.8}>
            {loading ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={styles.sendButtonText}>Send OTP</Text>
            )}
          </TouchableOpacity>

          <Text style={styles.privacyNote}>
            We only use your number to identify you within the app. It is never shared with third parties.
          </Text>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.primary },
  inner: { flex: 1, justifyContent: 'center', padding: 20 },
  brandSection: { alignItems: 'center', marginBottom: 32 },
  logoCircle: {
    width: 72,
    height: 72,
    borderRadius: 24,
    backgroundColor: '#FFFFFF25',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  logoText: { fontSize: 36, color: '#FFFFFF', fontWeight: '900' },
  appName: { fontSize: 28, fontWeight: '900', color: '#FFFFFF' },
  tagline: { fontSize: 14, color: '#FFFFFF99', marginTop: 4 },
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: 20,
    padding: 24,
    elevation: 4,
  },
  cardTitle: { fontSize: 22, fontWeight: '800', color: COLORS.text, marginBottom: 6 },
  cardSubtitle: { fontSize: 14, color: COLORS.textSecondary, lineHeight: 20, marginBottom: 20 },
  phoneRow: {
    flexDirection: 'row',
    borderWidth: 1.5,
    borderColor: COLORS.border,
    borderRadius: 12,
    overflow: 'hidden',
    marginBottom: 16,
  },
  countryCode: {
    backgroundColor: COLORS.background,
    paddingHorizontal: 14,
    justifyContent: 'center',
    borderRightWidth: 1,
    borderRightColor: COLORS.border,
  },
  countryCodeText: { fontSize: 16, fontWeight: '700', color: COLORS.text },
  phoneInput: {
    flex: 1,
    fontSize: 18,
    fontWeight: '600',
    color: COLORS.text,
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  sendButton: {
    backgroundColor: COLORS.primary,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    elevation: 2,
  },
  sendButtonDisabled: { opacity: 0.5 },
  sendButtonText: { color: '#FFFFFF', fontSize: 17, fontWeight: '700' },
  privacyNote: {
    fontSize: 12,
    color: COLORS.textLight,
    textAlign: 'center',
    marginTop: 14,
    lineHeight: 18,
  },
});
