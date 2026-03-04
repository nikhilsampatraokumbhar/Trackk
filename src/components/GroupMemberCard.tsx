import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { GroupMember, Debt } from '../models/types';
import { formatCurrency, COLORS, getColorForId } from '../utils/helpers';

interface GroupMemberCardProps {
  member: GroupMember;
  debts: Debt[];
  currentUserId: string;
}

/**
 * Shows a group member with their debt status relative to the current user.
 */
export function GroupMemberCard({
  member,
  debts,
  currentUserId,
}: GroupMemberCardProps) {
  const isCurrentUser = member.userId === currentUserId;

  // Find debt between current user and this member
  const owesToYou = debts.find(
    d => d.fromUserId === member.userId && d.toUserId === currentUserId,
  );
  const youOwe = debts.find(
    d => d.fromUserId === currentUserId && d.toUserId === member.userId,
  );

  let statusText = 'Settled up';
  let statusColor = COLORS.textSecondary;

  if (owesToYou) {
    statusText = `Owes you ${formatCurrency(owesToYou.amount)}`;
    statusColor = COLORS.success;
  } else if (youOwe) {
    statusText = `You owe ${formatCurrency(youOwe.amount)}`;
    statusColor = COLORS.danger;
  }

  return (
    <View style={styles.container}>
      <View
        style={[
          styles.avatar,
          { backgroundColor: getColorForId(member.userId || member.phone) },
        ]}>
        <Text style={styles.avatarText}>
          {member.displayName[0].toUpperCase()}
        </Text>
      </View>
      <View style={styles.info}>
        <Text style={styles.name}>
          {member.displayName}
          {isCurrentUser ? ' (You)' : ''}
        </Text>
        {!isCurrentUser && (
          <Text style={[styles.status, { color: statusColor }]}>
            {statusText}
          </Text>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  avatarText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '700',
  },
  info: {
    flex: 1,
  },
  name: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.text,
  },
  status: {
    fontSize: 13,
    marginTop: 2,
  },
});
