import React from 'react';
import { ActivityIndicator, View, Text, StyleSheet } from 'react-native';

import { AuthProvider, useAuth } from './src/store/AuthContext';
import { GroupProvider, useGroups } from './src/store/GroupContext';
import { TrackerProvider } from './src/store/TrackerContext';
import { GoalsProvider, useGoals } from './src/store/GoalsContext';
import { AppNavigator } from './src/navigation/AppNavigator';
import { registerBackgroundHandler } from './src/services/NotificationService';
import { COLORS } from './src/utils/helpers';

// Register background notification handler (must be at top level)
registerBackgroundHandler();

function AppContent() {
  const { loading } = useAuth();
  const { groups } = useGroups();
  const { recordSpend } = useGoals(); // GoalsProvider is above, so this works

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={COLORS.primary} />
        <Text style={styles.loadingText}>Loading...</Text>
      </View>
    );
  }

  return (
    <TrackerProvider groups={groups} onPersonalExpense={recordSpend}>
      <AppNavigator />
    </TrackerProvider>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <GroupProvider>
        <GoalsProvider>
          <AppContent />
        </GoalsProvider>
      </GroupProvider>
    </AuthProvider>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.background,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: COLORS.textSecondary,
  },
});
