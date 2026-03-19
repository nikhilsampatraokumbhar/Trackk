import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { GroupMember, Debt } from '../models/types';
import { formatCurrency, getColorForId } from '../utils/helpers';
import { useTheme } from '../store/ThemeContext';

interface Props {
  member: GroupMember;
  debts: Debt[];
  currentUserId: string;
}

export default function GroupMemberCard({ member, debts, currentUserId }: Props) {
  const { colors } = useTheme();
  const isCurrentUser = member.userId === currentUserId;

  const owesMe = debts
    .filter(d => d.fromUserId === member.userId && d.toUserId === currentUserId)
    .reduce((sum, d) => sum + d.amount, 0);

  const iOwe = debts
    .filter(d => d.fromUserId === currentUserId && d.toUserId === member.userId)
    .reduce((sum, d) => sum + d.amount, 0);

  const avatarColor = getColorForId(member.userId);

  const statusText = owesMe > 0
    ? `Owes you ${formatCurrency(owesMe)}`
    : iOwe > 0
    ? `You owe ${formatCurrency(iOwe)}`
    : 'Settled up';

  const statusColor = owesMe > 0 ? colors.success : iOwe > 0 ? colors.danger : colors.textSecondary;

  return (
    <View style={[
      styles.card,
      {
        backgroundColor: isCurrentUser ? `${colors.primary}08` : colors.surface,
        borderColor: isCurrentUser ? `${colors.primary}30` : colors.border,
      },
    ]}>
      <View style={[styles.avatar, { backgroundColor: `${avatarColor}20` }]}>
        <Text style={[styles.avatarText, { color: avatarColor }]}>
          {member.displayName[0].toUpperCase()}
        </Text>
      </View>
      <View style={styles.info}>
        <Text style={[styles.name, { color: colors.text }]}>
          {isCurrentUser ? 'You (me)' : member.displayName}
        </Text>
        <Text style={[styles.status, { color: statusColor }]}>{statusText}</Text>
      </View>
      {(owesMe > 0 || iOwe > 0) && (
        <View style={[
          styles.badge,
          { backgroundColor: `${statusColor}12`, borderColor: `${statusColor}25` },
        ]}>
          <Text style={[styles.badgeText, { color: statusColor }]}>
            {formatCurrency(owesMe > 0 ? owesMe : iOwe)}
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 8,
  },
  avatar: {
    width: 42,
    height: 42,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  avatarText: { fontSize: 17, fontWeight: '700' },
  info: { flex: 1 },
  name: {
    fontSize: 14,
    fontWeight: '600',
  },
  status: {
    fontSize: 12,
    marginTop: 3,
    fontWeight: '500',
  },
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
    borderWidth: 1,
  },
  badgeText: {
    fontSize: 12,
    fontWeight: '700',
  },
});
