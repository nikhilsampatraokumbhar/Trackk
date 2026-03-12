import React from 'react';
import { View, StyleSheet } from 'react-native';
import { StatusBar } from 'expo-status-bar';

import { AuthProvider, useAuth } from './src/store/AuthContext';
import { GroupProvider, useGroups } from './src/store/GroupContext';
import { TrackerProvider } from './src/store/TrackerContext';
import { PremiumProvider } from './src/store/PremiumContext';
import { AppNavigator } from './src/navigation/AppNavigator';
import { registerBackgroundHandler } from './src/services/NotificationService';
import SplashScreen from './src/components/SplashScreen';

import { COLORS } from './src/utils/helpers';

// Must be called at top level for background notifications
registerBackgroundHandler();

function AppContent() {
  const { user, loading, isAuthenticated } = useAuth();
  const { groups } = useGroups();

  if (loading) {
    return <SplashScreen />;
  }

  // If not authenticated, AppNavigator will show LoginScreen
  if (!isAuthenticated || !user) {
    return <AppNavigator />;
  }

  return (
    <PremiumProvider userId={user.id}>
      <TrackerProvider groups={groups} userId={user.id}>
        <AppNavigator />
      </TrackerProvider>
    </PremiumProvider>
  );
}



export default function App() {
  return (
    <AuthProvider>
      <GroupProvider>
        <StatusBar style="light" />
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
