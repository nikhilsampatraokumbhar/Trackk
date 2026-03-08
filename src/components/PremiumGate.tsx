import React from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Modal,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/AppNavigator';
import { COLORS } from '../utils/helpers';

type Nav = NativeStackNavigationProp<RootStackParamList>;

interface PremiumGateProps {
  visible: boolean;
  onClose: () => void;
  feature: string;
  description: string;
}

const CLEVER_NUDGES = [
  'Upgrade for less than your morning chai',
  'Premium pays for itself in week one',
  'Your wallet will thank you later',
  'Smart money moves start here',
];

export default function PremiumGate({ visible, onClose, feature, description }: PremiumGateProps) {
  const nav = useNavigation<Nav>();
  const nudge = CLEVER_NUDGES[Math.floor(Math.random() * CLEVER_NUDGES.length)];

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={onClose}>
        <View style={styles.content}>
          <Text style={styles.lockIcon}>🔒</Text>
          <Text style={styles.title}>{feature}</Text>
          <Text style={styles.description}>{description}</Text>

          <View style={styles.divider} />

          <Text style={styles.nudge}>{nudge}</Text>

          <TouchableOpacity
            style={styles.upgradeBtn}
            onPress={() => {
              onClose();
              nav.navigate('Pricing' as any);
            }}
            activeOpacity={0.8}
          >
            <Text style={styles.upgradeBtnText}>See Premium Plans</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.laterBtn} onPress={onClose}>
            <Text style={styles.laterBtnText}>Maybe Later</Text>
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  content: {
    backgroundColor: COLORS.surface,
    borderRadius: 24,
    padding: 28,
    width: '100%',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: `${COLORS.primary}30`,
  },
  lockIcon: { fontSize: 48, marginBottom: 16 },
  title: {
    fontSize: 20,
    fontWeight: '800',
    color: COLORS.text,
    marginBottom: 8,
    textAlign: 'center',
  },
  description: {
    fontSize: 14,
    color: COLORS.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
  },
  divider: {
    height: 1,
    backgroundColor: COLORS.border,
    width: '100%',
    marginVertical: 20,
  },
  nudge: {
    fontSize: 14,
    color: COLORS.primaryLight,
    fontStyle: 'italic',
    textAlign: 'center',
    marginBottom: 20,
  },
  upgradeBtn: {
    backgroundColor: COLORS.primary,
    borderRadius: 14,
    paddingVertical: 16,
    paddingHorizontal: 32,
    width: '100%',
    alignItems: 'center',
    marginBottom: 10,
  },
  upgradeBtnText: {
    fontSize: 15,
    fontWeight: '800',
    color: COLORS.background,
  },
  laterBtn: {
    paddingVertical: 12,
  },
  laterBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.textSecondary,
  },
});
