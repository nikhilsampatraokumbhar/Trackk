import React from 'react';
import {
  View, TouchableOpacity, StyleSheet, KeyboardAvoidingView, Platform,
} from 'react-native';
import { Portal, Modal as PaperModal } from 'react-native-paper';
import { useTheme } from '../store/ThemeContext';

interface Props {
  visible: boolean;
  onClose: () => void;
  children: React.ReactNode;
}

export default function BottomSheet({ visible, onClose, children }: Props) {
  const { colors } = useTheme();

  return (
    <PaperModal
      visible={visible}
      onDismiss={onClose}
      contentContainerStyle={[styles.sheet, {
        backgroundColor: colors.surface,
        borderTopColor: colors.border,
      }]}
      style={styles.modal}
    >
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={[styles.handle, { backgroundColor: colors.surfaceHigher }]} />
        {children}
      </KeyboardAvoidingView>
    </PaperModal>
  );
}

const styles = StyleSheet.create({
  modal: {
    justifyContent: 'flex-end',
    margin: 0,
  },
  sheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 40,
    borderTopWidth: 1,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 20,
  },
});
