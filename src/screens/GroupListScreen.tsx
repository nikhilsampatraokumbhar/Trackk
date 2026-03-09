import React, { useCallback, useState } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  ActivityIndicator, RefreshControl,
} from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/AppNavigator';
import { useGroups } from '../store/GroupContext';
import { useTracker } from '../store/TrackerContext';
import TrackerToggle from '../components/TrackerToggle';
import { COLORS, getColorForId } from '../utils/helpers';

type Nav = NativeStackNavigationProp<RootStackParamList>;

export default function GroupListScreen() {
  const nav = useNavigation<Nav>();
  const { groups, loading, refreshGroups } = useGroups();
  const { trackerState, toggleGroup } = useTracker();
  const [refreshing, setRefreshing] = useState(false);

  useFocusEffect(useCallback(() => { refreshGroups(); }, [refreshGroups]));

  const onRefresh = async () => {
    setRefreshing(true);
    await refreshGroups();
    setRefreshing(false);
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <FlatList
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={COLORS.primary}
            colors={[COLORS.primary]}
          />
        }
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={() => (
          <Text style={styles.sectionTitle}>YOUR GROUPS</Text>
        )}
        ListEmptyComponent={() => (
          <View style={styles.empty}>
            <View style={styles.emptyIcon}>
              <Text style={styles.emptyEmoji}>👥</Text>
            </View>
            <Text style={styles.emptyText}>No groups yet</Text>
            <Text style={styles.emptySubtext}>
              Create a group to split expenses with friends
            </Text>
          </View>
        )}
        data={groups}
        keyExtractor={item => item.id}
        renderItem={({ item }) => {
          const color = getColorForId(item.id);
          const isActive = trackerState.activeGroupIds.includes(item.id);
          return (
            <View style={[styles.groupCard, isActive && { borderColor: `${COLORS.groupColor}50` }]}>
              {/* Group info row */}
              <TouchableOpacity
                style={styles.groupInfoRow}
                onPress={() => nav.navigate('GroupDetail', { groupId: item.id })}
                activeOpacity={0.7}
              >
                <View style={[styles.groupIcon, { backgroundColor: `${color}22` }]}>
                  <Text style={[styles.groupInitial, { color }]}>
                    {(item.name || 'G')[0].toUpperCase()}
                  </Text>
                </View>
                <View style={styles.groupTextWrap}>
                  <Text style={styles.groupName}>{item.name}</Text>
                  <View style={styles.membersRow}>
                    {item.members.slice(0, 4).map((m, i) => (
                      <View
                        key={m.userId}
                        style={[styles.memberAvatar, {
                          backgroundColor: `${getColorForId(m.userId)}30`,
                          borderColor: COLORS.surface,
                          marginLeft: i > 0 ? -8 : 0,
                          zIndex: 10 - i,
                        }]}
                      >
                        <Text style={[styles.memberInitial, { color: getColorForId(m.userId) }]}>
                          {m.displayName[0].toUpperCase()}
                        </Text>
                      </View>
                    ))}
                    {item.members.length > 4 && (
                      <View style={[styles.memberAvatar, styles.memberMore, { marginLeft: -8 }]}>
                        <Text style={styles.memberMoreText}>+{item.members.length - 4}</Text>
                      </View>
                    )}
                    <Text style={styles.memberCount}>{item.members.length} members</Text>
                  </View>
                </View>
                <Text style={styles.chevron}>›</Text>
              </TouchableOpacity>

              {/* Tracker toggle row */}
              <View style={styles.toggleRow}>
                <TrackerToggle
                  label="Track for this group"
                  subtitle="Auto-split expenses"
                  isActive={isActive}
                  onToggle={() => toggleGroup(item.id)}
                  color={COLORS.groupColor}
                />
              </View>
            </View>
          );
        }}
      />

      {/* FAB */}
      <TouchableOpacity
        style={styles.fab}
        onPress={() => nav.navigate('CreateGroup')}
        activeOpacity={0.8}
      >
        <Text style={styles.fabIcon}>+</Text>
        <Text style={styles.fabText}>New Group</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  content: { padding: 16, paddingBottom: 100 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: COLORS.background },

  sectionTitle: {
    fontSize: 10,
    fontWeight: '700',
    color: COLORS.textSecondary,
    letterSpacing: 1.5,
    marginBottom: 14,
  },

  empty: { alignItems: 'center', paddingVertical: 60 },
  emptyIcon: {
    width: 72,
    height: 72,
    borderRadius: 22,
    backgroundColor: COLORS.surfaceHigh,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  emptyEmoji: { fontSize: 32 },
  emptyText: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.text,
  },
  emptySubtext: {
    fontSize: 13,
    color: COLORS.textSecondary,
    textAlign: 'center',
    marginTop: 8,
    lineHeight: 20,
  },

  groupCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    overflow: 'hidden',
  },
  groupInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  groupIcon: {
    width: 48,
    height: 48,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  groupInitial: { fontSize: 20, fontWeight: '800' },
  groupTextWrap: { flex: 1 },
  groupName: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.text,
    marginBottom: 6,
  },
  membersRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  memberAvatar: {
    width: 22,
    height: 22,
    borderRadius: 7,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
  },
  memberInitial: { fontSize: 9, fontWeight: '800' },
  memberMore: {
    backgroundColor: COLORS.surfaceHigher,
    borderColor: COLORS.border,
  },
  memberMoreText: { fontSize: 9, fontWeight: '700', color: COLORS.textSecondary },
  memberCount: {
    fontSize: 11,
    color: COLORS.textSecondary,
    marginLeft: 8,
  },
  chevron: {
    fontSize: 22,
    color: COLORS.textSecondary,
    marginLeft: 8,
  },
  toggleRow: {
    paddingHorizontal: 12,
    paddingBottom: 4,
    paddingTop: 4,
  },

  fab: {
    position: 'absolute',
    right: 20,
    bottom: 20,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.primary,
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderRadius: 30,
    elevation: 8,
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
  },
  fabIcon: {
    color: '#0A0A0F',
    fontSize: 20,
    fontWeight: '800',
    marginRight: 6,
  },
  fabText: {
    color: '#0A0A0F',
    fontWeight: '800',
    fontSize: 14,
    letterSpacing: 0.3,
  },
});
