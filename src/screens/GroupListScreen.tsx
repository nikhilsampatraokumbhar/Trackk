import React from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useGroups } from '../store/GroupContext';
import { useTracker } from '../store/TrackerContext';
import { TrackerToggle } from '../components/TrackerToggle';
import { RootStackParamList } from '../models/types';
import { COLORS, getColorForId } from '../utils/helpers';

type Nav = NativeStackNavigationProp<RootStackParamList>;

export function GroupListScreen() {
  const navigation = useNavigation<Nav>();
  const { groups, loading } = useGroups();
  const { trackerState, toggleGroup } = useTracker();

  return (
    <View style={styles.container}>
      <FlatList
        data={groups}
        keyExtractor={item => item.id}
        ListHeaderComponent={
          <View>
            <Text style={styles.subtitle}>
              Create groups to split expenses automatically. Enable tracking
              on a group to auto-detect and split transactions.
            </Text>
          </View>
        }
        renderItem={({ item }) => (
          <View>
            {/* Group card */}
            <TouchableOpacity
              style={styles.groupCard}
              onPress={() => navigation.navigate('GroupDetail', { groupId: item.id })}
              activeOpacity={0.7}>
              <View style={styles.groupHeader}>
                <View
                  style={[
                    styles.groupIcon,
                    { backgroundColor: getColorForId(item.id) },
                  ]}>
                  <Text style={styles.groupIconText}>
                    {item.name[0].toUpperCase()}
                  </Text>
                </View>
                <View style={styles.groupInfo}>
                  <Text style={styles.groupName}>{item.name}</Text>
                  <Text style={styles.groupMeta}>
                    {item.members.length} member{item.members.length !== 1 ? 's' : ''}
                  </Text>
                </View>
                <Text style={styles.chevron}>›</Text>
              </View>

              {/* Member avatars */}
              <View style={styles.memberRow}>
                {item.members.slice(0, 5).map((member, idx) => (
                  <View
                    key={idx}
                    style={[
                      styles.memberAvatar,
                      {
                        backgroundColor: getColorForId(member.userId || member.phone),
                        marginLeft: idx > 0 ? -8 : 0,
                      },
                    ]}>
                    <Text style={styles.memberAvatarText}>
                      {member.displayName[0].toUpperCase()}
                    </Text>
                  </View>
                ))}
                {item.members.length > 5 && (
                  <View style={[styles.memberAvatar, styles.moreAvatar]}>
                    <Text style={styles.moreText}>+{item.members.length - 5}</Text>
                  </View>
                )}
              </View>
            </TouchableOpacity>

            {/* Tracking toggle for this group */}
            <TrackerToggle
              label={`Track ${item.name}`}
              subtitle="Auto-add transactions & split"
              isActive={trackerState.activeGroupIds.includes(item.id)}
              color={COLORS.groupColor}
              onToggle={() => toggleGroup(item.id)}
            />
          </View>
        )}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            {loading ? (
              <Text style={styles.emptyTitle}>Loading groups...</Text>
            ) : (
              <>
                <Text style={styles.emptyTitle}>No groups yet</Text>
                <Text style={styles.emptySubtitle}>
                  Create a group to start splitting expenses
                </Text>
              </>
            )}
          </View>
        }
        ListFooterComponent={<View style={{ height: 80 }} />}
      />

      {/* Create group FAB */}
      <TouchableOpacity
        style={styles.fab}
        onPress={() => navigation.navigate('CreateGroup')}
        activeOpacity={0.8}>
        <Text style={styles.fabText}>+ New Group</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  subtitle: {
    fontSize: 13,
    color: COLORS.textSecondary,
    paddingHorizontal: 16,
    paddingVertical: 12,
    lineHeight: 18,
  },
  groupCard: {
    backgroundColor: COLORS.surface,
    marginHorizontal: 16,
    marginTop: 8,
    borderRadius: 12,
    padding: 16,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
  },
  groupHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  groupIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  groupIconText: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '700',
  },
  groupInfo: {
    flex: 1,
  },
  groupName: {
    fontSize: 17,
    fontWeight: '700',
    color: COLORS.text,
  },
  groupMeta: {
    fontSize: 13,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  chevron: {
    fontSize: 24,
    color: COLORS.textLight,
  },
  memberRow: {
    flexDirection: 'row',
    marginTop: 12,
    paddingLeft: 4,
  },
  memberAvatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: COLORS.surface,
  },
  memberAvatarText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '700',
  },
  moreAvatar: {
    backgroundColor: COLORS.textLight,
    marginLeft: -8,
  },
  moreText: {
    color: '#FFFFFF',
    fontSize: 9,
    fontWeight: '700',
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 60,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: COLORS.textSecondary,
  },
  emptySubtitle: {
    fontSize: 14,
    color: COLORS.textLight,
    marginTop: 8,
  },
  fab: {
    position: 'absolute',
    bottom: 20,
    right: 20,
    backgroundColor: COLORS.groupColor,
    borderRadius: 28,
    paddingHorizontal: 24,
    paddingVertical: 14,
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
  },
  fabText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
});
