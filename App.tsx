import React, { useEffect } from 'react';
import { View, StyleSheet } from 'react-native';
import { StatusBar } from 'expo-status-bar';

import { AuthProvider, useAuth } from './src/store/AuthContext';
import { GroupProvider, useGroups } from './src/store/GroupContext';
import { TrackerProvider } from './src/store/TrackerContext';
import { PremiumProvider } from './src/store/PremiumContext';
import { NetworkProvider } from './src/store/NetworkContext';
import { AppNavigator } from './src/navigation/AppNavigator';
import { registerBackgroundHandler } from './src/services/NotificationService';
import { setupReminderChannel, checkAndSendReminders } from './src/services/DebtReminderService';
import { getGroupTransactions } from './src/services/StorageService';
import { calculateDebts } from './src/services/DebtCalculator';
import SplashScreen from './src/components/SplashScreen';
import OfflineBanner from './src/components/OfflineBanner';

import { COLORS } from './src/utils/helpers';
import './src/i18n'; // Initialize i18n
import { loadSavedLanguage } from './src/i18n';
import { loadSavedCurrency, fetchExchangeRates } from './src/utils/currencies';

// Must be called at top level for background notifications
registerBackgroundHandler();

function AppContent() {
  const { user, loading, isAuthenticated } = useAuth();
  const { groups } = useGroups();

  // Load saved language and currency on app start
  useEffect(() => {
    loadSavedLanguage();
    loadSavedCurrency();
    fetchExchangeRates();
  }, []);

  // Set up gentle debt reminders on app open
  useEffect(() => {
    if (!isAuthenticated || !user || groups.length === 0) return;
    (async () => {
      await setupReminderChannel();
      // Build debt map for all groups
      const debtsByGroup: Record<string, any[]> = {};
      for (const g of groups) {
        try {
          const txns = await getGroupTransactions(g.id);
          debtsByGroup[g.id] = calculateDebts(txns);
        } catch {
          debtsByGroup[g.id] = [];
        }
      }
      await checkAndSendReminders(groups, debtsByGroup, user.id);
    })();
  }, [isAuthenticated, user?.id, groups.length]);

  if (loading) {
    return <SplashScreen />;
  }

  // If not authenticated, AppNavigator will show LoginScreen
  if (!isAuthenticated || !user) {
    return (
      <View style={{ flex: 1 }}>
        <AppNavigator />
        <OfflineBanner />
      </View>
    );
  }

  return (
    <PremiumProvider userId={user.id}>
      <TrackerProvider groups={groups} userId={user.id}>
        <View style={{ flex: 1 }}>
          <AppNavigator />
          <OfflineBanner />
        </View>
      </TrackerProvider>
    </PremiumProvider>
  );
}



export default function App() {
  return (
    <NetworkProvider>
      <AuthProvider>
        <GroupProvider>
          <StatusBar style="light" />
          <AppContent />
        </GroupProvider>
      </AuthProvider>
    </NetworkProvider>
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
