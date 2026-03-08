import React, { useState, useRef, useEffect } from 'react';
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity,
  ActivityIndicator, KeyboardAvoidingView, Platform,
  Animated, Alert,
} from 'react-native';
import { COLORS } from '../utils/helpers';
import { sendOTP, verifyOTP } from '../services/FirebaseConfig';

type Step = 'phone' | 'otp';

interface Props {
  onAuthSuccess: (uid: string, phone: string) => void;
}

export default function LoginScreen({ onAuthSuccess }: Props) {
  const [step, setStep] = useState<Step>('phone');
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState(['', '', '', '', '', '']);
  const [loading, setLoading] = useState(false);
  const [confirmation, setConfirmation] = useState<any>(null);
  const [resendTimer, setResendTimer] = useState(0);
  const [error, setError] = useState('');

  const otpRefs = useRef<Array<TextInput | null>>([]);
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(30)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 600, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: 0, duration: 600, useNativeDriver: true }),
    ]).start();
  }, [step]);

  // Resend timer countdown
  useEffect(() => {
    if (resendTimer <= 0) return;
    const interval = setInterval(() => setResendTimer(t => t - 1), 1000);
    return () => clearInterval(interval);
  }, [resendTimer]);

  const formatPhone = (text: string) => {
    const digits = text.replace(/\D/g, '').slice(0, 10);
    setPhone(digits);
    setError('');
  };

  const handleSendOTP = async () => {
    if (phone.length !== 10) {
      setError('Enter a valid 10-digit mobile number');
      return;
    }

    setLoading(true);
    setError('');
    try {
      const conf = await sendOTP(phone);
      setConfirmation(conf);
      setStep('otp');
      setResendTimer(30);
      // Reset animations for OTP screen
      fadeAnim.setValue(0);
      slideAnim.setValue(30);
    } catch (e: any) {
      const msg = e?.message || 'Failed to send OTP';
      if (msg.includes('too-many-requests')) {
        setError('Too many attempts. Please try again later.');
      } else if (msg.includes('invalid-phone-number')) {
        setError('Invalid phone number. Please check and try again.');
      } else {
        setError(msg);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleOtpChange = (text: string, index: number) => {
    const digit = text.replace(/\D/g, '').slice(-1);
    const newOtp = [...otp];
    newOtp[index] = digit;
    setOtp(newOtp);
    setError('');

    // Auto-focus next input
    if (digit && index < 5) {
      otpRefs.current[index + 1]?.focus();
    }

    // Auto-verify when all 6 digits entered
    if (digit && index === 5 && newOtp.every(d => d)) {
      verifyCode(newOtp.join(''));
    }
  };

  const handleOtpKeyPress = (key: string, index: number) => {
    if (key === 'Backspace' && !otp[index] && index > 0) {
      otpRefs.current[index - 1]?.focus();
      const newOtp = [...otp];
      newOtp[index - 1] = '';
      setOtp(newOtp);
    }
  };

  const verifyCode = async (code: string) => {
    if (!confirmation) return;

    setLoading(true);
    setError('');
    try {
      const result = await verifyOTP(confirmation, code);
      if (result?.user) {
        onAuthSuccess(result.user.uid, phone);
      }
    } catch (e: any) {
      const msg = e?.message || 'Invalid OTP';
      if (msg.includes('invalid-verification-code')) {
        setError('Incorrect OTP. Please try again.');
      } else if (msg.includes('session-expired')) {
        setError('OTP expired. Please request a new one.');
      } else {
        setError(msg);
      }
      setOtp(['', '', '', '', '', '']);
      otpRefs.current[0]?.focus();
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    if (resendTimer > 0) return;
    setOtp(['', '', '', '', '', '']);
    setError('');
    setLoading(true);
    try {
      const conf = await sendOTP(phone);
      setConfirmation(conf);
      setResendTimer(30);
      Alert.alert('OTP Sent', `A new OTP has been sent to +91 ${phone}`);
    } catch {
      setError('Failed to resend OTP. Try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleBack = () => {
    setStep('phone');
    setOtp(['', '', '', '', '', '']);
    setError('');
    setConfirmation(null);
    fadeAnim.setValue(0);
    slideAnim.setValue(30);
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.inner}>
        {/* Logo / Brand */}
        <View style={styles.brand}>
          <View style={styles.logoContainer}>
            <Text style={styles.logoText}>T</Text>
          </View>
          <Text style={styles.appName}>Trackk</Text>
          <Text style={styles.tagline}>Expense tracking, simplified</Text>
        </View>

        <Animated.View
          style={[
            styles.formContainer,
            { opacity: fadeAnim, transform: [{ translateY: slideAnim }] },
          ]}
        >
          {step === 'phone' ? (
            <>
              {/* Phone Input Step */}
              <Text style={styles.title}>Enter your mobile number</Text>
              <Text style={styles.subtitle}>
                We'll send you a 6-digit verification code
              </Text>

              <View style={styles.phoneRow}>
                <View style={styles.countryCode}>
                  <Text style={styles.countryFlag}>🇮🇳</Text>
                  <Text style={styles.countryCodeText}>+91</Text>
                </View>
                <TextInput
                  style={styles.phoneInput}
                  placeholder="Mobile number"
                  placeholderTextColor={COLORS.textLight}
                  value={phone}
                  onChangeText={formatPhone}
                  keyboardType="number-pad"
                  maxLength={10}
                  autoFocus
                />
              </View>

              {error ? <Text style={styles.error}>{error}</Text> : null}

              <TouchableOpacity
                style={[styles.primaryBtn, phone.length < 10 && styles.disabledBtn]}
                onPress={handleSendOTP}
                disabled={loading || phone.length < 10}
                activeOpacity={0.8}
              >
                {loading ? (
                  <ActivityIndicator color="#0A0A0F" />
                ) : (
                  <Text style={styles.primaryBtnText}>Send OTP</Text>
                )}
              </TouchableOpacity>

              <Text style={styles.disclaimer}>
                By continuing, you agree to our Terms of Service and Privacy Policy.
                Your phone number is used for authentication and group features only.
              </Text>
            </>
          ) : (
            <>
              {/* OTP Input Step */}
              <TouchableOpacity onPress={handleBack} style={styles.backBtn}>
                <Text style={styles.backBtnText}>← Change number</Text>
              </TouchableOpacity>

              <Text style={styles.title}>Verify your number</Text>
              <Text style={styles.subtitle}>
                Enter the 6-digit code sent to{'\n'}
                <Text style={styles.phoneHighlight}>+91 {phone}</Text>
              </Text>

              <View style={styles.otpRow}>
                {otp.map((digit, i) => (
                  <TextInput
                    key={i}
                    ref={ref => { otpRefs.current[i] = ref; }}
                    style={[
                      styles.otpInput,
                      digit && styles.otpInputFilled,
                    ]}
                    value={digit}
                    onChangeText={text => handleOtpChange(text, i)}
                    onKeyPress={({ nativeEvent }) => handleOtpKeyPress(nativeEvent.key, i)}
                    keyboardType="number-pad"
                    maxLength={1}
                    autoFocus={i === 0}
                    selectTextOnFocus
                  />
                ))}
              </View>

              {error ? <Text style={styles.error}>{error}</Text> : null}

              {loading && (
                <View style={styles.verifyingRow}>
                  <ActivityIndicator color={COLORS.primary} size="small" />
                  <Text style={styles.verifyingText}>Verifying...</Text>
                </View>
              )}

              <TouchableOpacity
                style={[
                  styles.primaryBtn,
                  !otp.every(d => d) && styles.disabledBtn,
                ]}
                onPress={() => verifyCode(otp.join(''))}
                disabled={loading || !otp.every(d => d)}
                activeOpacity={0.8}
              >
                <Text style={styles.primaryBtnText}>Verify & Continue</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.resendBtn}
                onPress={handleResend}
                disabled={resendTimer > 0}
                activeOpacity={0.7}
              >
                <Text style={[
                  styles.resendText,
                  resendTimer > 0 && styles.resendDisabled,
                ]}>
                  {resendTimer > 0
                    ? `Resend OTP in ${resendTimer}s`
                    : 'Resend OTP'}
                </Text>
              </TouchableOpacity>
            </>
          )}
        </Animated.View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  inner: {
    flex: 1,
    paddingHorizontal: 24,
    justifyContent: 'center',
  },

  // Brand
  brand: {
    alignItems: 'center',
    marginBottom: 48,
  },
  logoContainer: {
    width: 72,
    height: 72,
    borderRadius: 20,
    backgroundColor: `${COLORS.primary}20`,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
    borderWidth: 1,
    borderColor: `${COLORS.primary}40`,
  },
  logoText: {
    fontSize: 36,
    fontWeight: '900',
    color: COLORS.primary,
  },
  appName: {
    fontSize: 28,
    fontWeight: '900',
    color: COLORS.text,
    letterSpacing: -0.5,
    marginBottom: 6,
  },
  tagline: {
    fontSize: 14,
    color: COLORS.textSecondary,
    fontWeight: '500',
  },

  // Form
  formContainer: {
    width: '100%',
  },
  title: {
    fontSize: 20,
    fontWeight: '800',
    color: COLORS.text,
    marginBottom: 8,
    letterSpacing: -0.3,
  },
  subtitle: {
    fontSize: 14,
    color: COLORS.textSecondary,
    lineHeight: 20,
    marginBottom: 28,
  },
  phoneHighlight: {
    color: COLORS.primary,
    fontWeight: '700',
  },

  // Phone input
  phoneRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 20,
  },
  countryCode: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surfaceHigh,
    borderRadius: 14,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
    gap: 6,
  },
  countryFlag: {
    fontSize: 18,
  },
  countryCodeText: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.text,
  },
  phoneInput: {
    flex: 1,
    backgroundColor: COLORS.surfaceHigh,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 16,
    fontSize: 18,
    color: COLORS.text,
    fontWeight: '600',
    letterSpacing: 1,
  },

  // OTP input
  otpRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8,
    marginBottom: 20,
  },
  otpInput: {
    flex: 1,
    aspectRatio: 1,
    maxWidth: 52,
    backgroundColor: COLORS.surfaceHigh,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: COLORS.border,
    fontSize: 22,
    fontWeight: '800',
    color: COLORS.text,
    textAlign: 'center',
  },
  otpInputFilled: {
    borderColor: COLORS.primary,
    backgroundColor: `${COLORS.primary}10`,
  },

  // Error
  error: {
    fontSize: 13,
    color: COLORS.danger,
    fontWeight: '600',
    marginBottom: 16,
    textAlign: 'center',
  },

  // Buttons
  primaryBtn: {
    backgroundColor: COLORS.primary,
    borderRadius: 16,
    padding: 18,
    alignItems: 'center',
    marginBottom: 16,
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  disabledBtn: {
    opacity: 0.4,
  },
  primaryBtnText: {
    color: '#0A0A0F',
    fontWeight: '800',
    fontSize: 16,
    letterSpacing: 0.3,
  },

  backBtn: {
    alignSelf: 'flex-start',
    marginBottom: 20,
    paddingVertical: 4,
  },
  backBtnText: {
    fontSize: 14,
    color: COLORS.primary,
    fontWeight: '600',
  },

  resendBtn: {
    alignItems: 'center',
    paddingVertical: 12,
  },
  resendText: {
    fontSize: 14,
    color: COLORS.primary,
    fontWeight: '600',
  },
  resendDisabled: {
    color: COLORS.textSecondary,
  },

  verifyingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 16,
  },
  verifyingText: {
    fontSize: 14,
    color: COLORS.primary,
    fontWeight: '600',
  },

  disclaimer: {
    fontSize: 11,
    color: COLORS.textLight,
    textAlign: 'center',
    lineHeight: 16,
    marginTop: 8,
  },
});
