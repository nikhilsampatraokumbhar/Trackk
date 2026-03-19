import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Modal } from 'react-native';
import { Divider } from 'react-native-paper';
import { useTheme } from '../store/ThemeContext';

export interface ContextMenuItem {
  label: string;
  icon?: string;
  destructive?: boolean;
  onPress: () => void;
}

interface Props {
  visible: boolean;
  onClose: () => void;
  items: ContextMenuItem[];
  title?: string;
}

export default function ContextMenu({ visible, onClose, items, title }: Props) {
  const { colors } = useTheme();

  if (!visible) return null;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={onClose}>
        <View style={styles.menuContainer}>
          <View style={[styles.menu, {
            backgroundColor: colors.surface,
            borderColor: colors.border,
          }]}>
            {title && (
              <Text style={[styles.title, {
                color: colors.textSecondary,
                borderBottomColor: colors.border,
              }]}>
                {title}
              </Text>
            )}
            {items.map((item, idx) => (
              <TouchableOpacity
                key={idx}
                style={[
                  styles.menuItem,
                  idx < items.length - 1 && { borderBottomWidth: 1, borderBottomColor: colors.border },
                ]}
                onPress={() => { onClose(); item.onPress(); }}
                activeOpacity={0.7}
              >
                {item.icon && <Text style={styles.menuIcon}>{item.icon}</Text>}
                <Text style={[
                  styles.menuLabel,
                  { color: item.destructive ? colors.danger : colors.text },
                ]}>
                  {item.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          <TouchableOpacity
            style={[styles.cancelBtn, {
              backgroundColor: colors.surface,
              borderColor: colors.border,
            }]}
            onPress={onClose}
            activeOpacity={0.8}
          >
            <Text style={[styles.cancelText, { color: colors.textSecondary }]}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
    paddingHorizontal: 12,
    paddingBottom: 20,
  },
  menuContainer: {
    gap: 8,
  },
  menu: {
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
  },
  title: {
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'center',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: 20,
  },
  menuIcon: {
    fontSize: 18,
    marginRight: 14,
  },
  menuLabel: {
    fontSize: 16,
    fontWeight: '600',
  },
  cancelBtn: {
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: 'center',
    borderWidth: 1,
  },
  cancelText: {
    fontSize: 16,
    fontWeight: '600',
  },
});
