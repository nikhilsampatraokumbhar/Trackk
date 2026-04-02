import React, { useEffect, useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { PaperProvider, MD3LightTheme, MD3DarkTheme } from 'react-native-paper';

import { AuthProvider, useAuth } from './src/store/AuthContext';
import { GroupProvider, useGroups } from './src/store/GroupContext';
import { TrackerProvider } from './src/store/TrackerContext';
import { PremiumProvider } from './src/store/PremiumContext';
import { NetworkProvider } from './src/store/NetworkContext';
import { ThemeProvider, useTheme, LIGHT_COLORS, DARK_COLORS } from './src/store/ThemeContext';
import { TourProvider } from './src/store/TourContext';
import { AppNavigator } from './src/navigation/AppNavigator';
import { registerBackgroundHandler, setupNotificationChannel } from './src/services/NotificationService';
import { setupReminderChannel, checkAndSendReminders } from './src/services/DebtReminderService';
import { getGroupTransactions } from './src/services/StorageService';
import { calculateDebts } from './src/services/DebtCalculator';
import SplashScreen from './src/components/SplashScreen';
import OfflineBanner from './src/components/OfflineBanner';
import AppTour, { shouldShowTour } from './src/components/AppTour';
import ErrorBoundary from './src/components/ErrorBoundary';

import { COLORS } from './src/utils/helpers';
import './src/i18n'; // Initialize i18n
import { loadSavedLanguage } from './src/i18n';
import { loadSavedCurrency, fetchExchangeRates } from './src/utils/currencies';

// Must be called at top level for background notifications
try { registerBackgroundHandler(); } catch (e) { console.log('Background handler failed:', e); }

// Custom Paper themes mapped to our color palette
const paperLightTheme = {
  ...MD3LightTheme,
  colors: {
    ...MD3LightTheme.colors,
    primary: LIGHT_COLORS.primary,
    onPrimary: '#FFFFFF',
    primaryContainer: LIGHT_COLORS.primaryGlow,
    secondary: LIGHT_COLORS.secondary,
    background: LIGHT_COLORS.background,
    surface: LIGHT_COLORS.surface,
    surfaceVariant: LIGHT_COLORS.surfaceHigh,
    error: LIGHT_COLORS.danger,
    onBackground: LIGHT_COLORS.text,
    onSurface: LIGHT_COLORS.text,
    outline: LIGHT_COLORS.border,
    elevation: {
      level0: 'transparent',
      level1: LIGHT_COLORS.surface,
      level2: LIGHT_COLORS.surfaceHigh,
      level3: LIGHT_COLORS.surfaceHigher,
      level4: LIGHT_COLORS.surfaceHigher,
      level5: LIGHT_COLORS.surfaceHigher,
    },
  },
};

const paperDarkTheme = {
  ...MD3DarkTheme,
  colors: {
    ...MD3DarkTheme.colors,
    primary: DARK_COLORS.primary,
    onPrimary: '#FFFFFF',
    primaryContainer: DARK_COLORS.primaryGlow,
    secondary: DARK_COLORS.secondary,
    background: DARK_COLORS.background,
    surface: DARK_COLORS.surface,
    surfaceVariant: DARK_COLORS.surfaceHigh,
    error: DARK_COLORS.danger,
    onBackground: DARK_COLORS.text,
    onSurface: DARK_COLORS.text,
    outline: DARK_COLORS.border,
    elevation: {
      level0: 'transparent',
      level1: DARK_COLORS.surface,
      level2: DARK_COLORS.surfaceHigh,
      level3: DARK_COLORS.surfaceHigher,
      level4: DARK_COLORS.surfaceHigher,
      level5: DARK_COLORS.surfaceHigher,
    },
  },
};

function AppContent() {
  const { user, loading, isAuthenticated } = useAuth();
  const { groups } = useGroups();
  const { isDark } = useTheme();
  const [showTour, setShowTour] = useState(false);
  const [showSplash, setShowSplash] = useState(true);
  const [authReady, setAuthReady] = useState(false);

  // Load saved language and currency on app start + set up notification channel
  useEffect(() => {
    loadSavedLanguage();
    loadSavedCurrency();
    fetchExchangeRates();
    setupNotificationChannel();
  }, []);

  // Track when auth is done loading
  useEffect(() => {
    if (!loading) {
      setAuthReady(true);
    }
  }, [loading]);

  // Check if we should show the app tour after auth
  useEffect(() => {
    if (isAuthenticated && user) {
      shouldShowTour().then(show => {
        if (show) setShowTour(true);
      });
    }
  }, [isAuthenticated, user?.id]);

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

  // Show splash animation until it completes AND auth is ready
  if (showSplash) {
    return (
      <SplashScreen
        onAnimationComplete={() => {
          if (authReady) {
            setShowSplash(false);
          } else {
            // Auth still loading — wait for it, then hide splash
            const check = setInterval(() => {
              setShowSplash(false);
              clearInterval(check);
            }, 200);
          }
        }}
      />
    );
  }

  // Still loading auth after splash (rare — splash is ~3.3s)
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
        <TourProvider>
          <View style={{ flex: 1 }}>
            <AppNavigator />
            <OfflineBanner />
            <AppTour visible={showTour} onComplete={() => setShowTour(false)} />
          </View>
        </TourProvider>
      </TrackerProvider>
    </PremiumProvider>
  );
}



function StatusBarWrapper() {
  const { isDark } = useTheme();
  return <StatusBar style={isDark ? 'light' : 'dark'} />;
}

function PaperWrapper({ children }: { children: React.ReactNode }) {
  const { isDark } = useTheme();
  return (
    <PaperProvider theme={isDark ? paperDarkTheme : paperLightTheme}>
      {children}
    </PaperProvider>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <SafeAreaProvider>
        <ThemeProvider>
          <PaperWrapper>
            <NetworkProvider>
              <AuthProvider>
                <GroupProvider>
                  <StatusBarWrapper />
                  <AppContent />
                </GroupProvider>
              </AuthProvider>
            </NetworkProvider>
          </PaperWrapper>
        </ThemeProvider>
      </SafeAreaProvider>
    </ErrorBoundary>
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
