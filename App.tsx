import React, { useEffect } from 'react';
import { ActivityIndicator, View, StyleSheet } from 'react-native';

import { AuthProvider, useAuth } from './src/store/AuthContext';
import { GroupProvider, useGroups } from './src/store/GroupContext';
import { TrackerProvider } from './src/store/TrackerContext';
import { PremiumProvider, usePremium } from './src/store/PremiumContext';
import { AppNavigator } from './src/navigation/AppNavigator';
import { registerBackgroundHandler } from './src/services/NotificationService';
import { runRetentionCleanup } from './src/services/DataRetentionService';
import { COLORS } from './src/utils/helpers';

// Must be called at top level for background notifications
registerBackgroundHandler();

function AppContent() {
  const { user, loading, isAuthenticated } = useAuth();
  const { groups } = useGroups();

  if (loading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  // If not authenticated, AppNavigator will show LoginScreen
  if (!isAuthenticated || !user) {
    return <AppNavigator />;
  }

  return (
    <PremiumProvider userId={user.id}>
      <TrackerProvider groups={groups} userId={user.id}>
        <RetentionCleanupRunner groups={groups} />
        <AppNavigator />
      </TrackerProvider>
    </PremiumProvider>
  );
}

/** Runs silent data retention cleanup on mount for free users */
function RetentionCleanupRunner({ groups }: { groups: Array<{ id: string }> }) {
  const { isPremium } = usePremium();

  useEffect(() => {
    if (isPremium || groups.length === 0) return;
    runRetentionCleanup(groups.map(g => g.id)).catch(() => {});
  }, [isPremium, groups]);

  return null;
}

export default function App() {
  return (
    <AuthProvider>
      <GroupProvider>
        <AppContent />
      </GroupProvider>
    </AuthProvider>
  );
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.background,
  },
});
