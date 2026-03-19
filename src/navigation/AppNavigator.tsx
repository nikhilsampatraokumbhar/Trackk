import React, { useState, useEffect, useCallback } from 'react';
import { NavigationContainer, useNavigation } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Text, View, BackHandler, Alert, Platform, TouchableOpacity, Animated } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import HomeScreen from '../screens/HomeScreen';
import PersonalExpenseScreen from '../screens/PersonalExpenseScreen';
import ReimbursementScreen from '../screens/ReimbursementScreen';
import GroupListScreen from '../screens/GroupListScreen';
import GroupDetailScreen from '../screens/GroupDetailScreen';
import CreateGroupScreen from '../screens/CreateGroupScreen';
import TransactionDetailScreen from '../screens/TransactionDetailScreen';
import TrackerSettingsScreen from '../screens/TrackerSettingsScreen';
import ProfileScreen from '../screens/ProfileScreen';
import GoalsScreen from '../screens/GoalsScreen';
import InsightsScreen from '../screens/InsightsScreen';
import IOSSetupScreen from '../screens/iOSSetupScreen';
import PricingScreen from '../screens/PricingScreen';
import ReferralScreen from '../screens/ReferralScreen';
import SplitEditorScreen from '../screens/SplitEditorScreen';
import NightlyReviewScreen from '../screens/NightlyReviewScreen';
import QuickAddScreen from '../screens/QuickAddScreen';
import SubscriptionsScreen from '../screens/SubscriptionsScreen';
import InvestmentsScreen from '../screens/InvestmentsScreen';
import EMIsScreen from '../screens/EMIsScreen';
import GroupSettingsScreen from '../screens/GroupSettingsScreen';
import LoginScreen from '../screens/LoginScreen';
import OnboardingScreen from '../screens/OnboardingScreen';

import { COLORS } from '../utils/helpers';
import { useAuth } from '../store/AuthContext';
import { useTheme } from '../store/ThemeContext';

const ONBOARDING_KEY = '@et_onboarding_done';

export type RootStackParamList = {
  Onboarding: undefined;
  Login: undefined;
  SplitEditor: {
    groupId: string;
    amount?: number;
    description?: string;
    merchant?: string;
    isManual?: boolean;
  };
  MainTabs: undefined;
  Goals: undefined;
  GroupDetail: { groupId: string };
  GroupSettings: { groupId: string };
  CreateGroup: undefined;
  TransactionDetail: { transactionId: string };
  TrackerSettings: undefined;
  Reimbursement: undefined;
  IOSSetup: undefined;
  NightlyReview: undefined;
  QuickAdd: { amount?: number; description?: string } | undefined;
  Pricing: undefined;
  Referral: undefined;
  Subscriptions: undefined;
  Investments: undefined;
  EMIs: undefined;
};

export type TabParamList = {
  Home: undefined;
  Personal: undefined;
  Groups: undefined;
  Insights: undefined;
  Profile: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();
const Tab = createBottomTabNavigator<TabParamList>();

// Simple emoji-based icons since we keep it dependency-light
const EMOJI_ICONS: Record<string, string> = {
  Home:     '🏠',
  Personal: '💳',
  Groups:   '👥',
  Insights: '📊',
  Goals:    '🎯',
  Profile:  '👤',
};

function TabIcon({ name, focused }: { name: string; focused: boolean }) {
  return (
    <View style={{ alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ fontSize: 20, opacity: focused ? 1 : 0.35 }}>
        {EMOJI_ICONS[name] || '•'}
      </Text>
    </View>
  );
}

function ModalCloseButton() {
  const nav = useNavigation();
  return (
    <TouchableOpacity
      onPress={() => nav.goBack()}
      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
      style={{ padding: 4 }}
    >
      <Text style={{ fontSize: 16, color: COLORS.textSecondary }}>✕</Text>
    </TouchableOpacity>
  );
}

function useExitConfirmation() {
  const navigation = useNavigation<any>();

  useFocusEffect(
    useCallback(() => {
      if (Platform.OS !== 'android') return;
      const onBack = () => {
        // If there are screens above MainTabs in the stack, let the stack navigator handle it
        const parent = navigation.getParent?.();
        if (parent) {
          const state = parent.getState?.();
          if (state && state.index > 0) {
            // There's a screen above MainTabs — let the default back behavior pop it
            return false;
          }
        }
        // We're at the root (Home tab on MainTabs) — show exit confirmation
        Alert.alert(
          'Exit Trackk?',
          'Are you sure you want to exit the app?',
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Exit', style: 'destructive', onPress: () => BackHandler.exitApp() },
          ],
        );
        return true;
      };
      const sub = BackHandler.addEventListener('hardwareBackPress', onBack);
      return () => sub.remove();
    }, [navigation]),
  );
}

/** On non-Home tabs, back button navigates to Home instead of exiting the app */
function useBackToHome() {
  const navigation = useNavigation<any>();

  useFocusEffect(
    useCallback(() => {
      if (Platform.OS !== 'android') return;
      const onBack = () => {
        // If there are screens above MainTabs in the stack, let the stack navigator handle it
        const parent = navigation.getParent?.();
        if (parent) {
          const state = parent.getState?.();
          if (state && state.index > 0) {
            return false;
          }
        }
        navigation.navigate('Home');
        return true;
      };
      const sub = BackHandler.addEventListener('hardwareBackPress', onBack);
      return () => sub.remove();
    }, [navigation]),
  );
}

function HomeWithExitConfirmation() {
  useExitConfirmation();
  return <HomeScreen />;
}

function PersonalWithBackToHome() {
  useBackToHome();
  return <PersonalExpenseScreen />;
}

function GroupsWithBackToHome() {
  useBackToHome();
  return <GroupListScreen />;
}

function InsightsWithBackToHome() {
  useBackToHome();
  return <InsightsScreen />;
}

function ProfileWithBackToHome() {
  useBackToHome();
  return <ProfileScreen />;
}

function MainTabs() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const LABELS: Record<string, string> = {
    Home: 'Home',
    Personal: 'Personal',
    Groups: 'Groups',
    Insights: 'Insights',
    Profile: 'Profile',
  };

  return (
    <Tab.Navigator
      backBehavior="initialRoute"
      screenOptions={({ route }) => ({
        tabBarIcon: ({ focused }) => <TabIcon name={route.name} focused={focused} />,
        tabBarLabel: LABELS[route.name] || route.name,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textSecondary,
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.border,
          borderTopWidth: 1,
          paddingBottom: Math.max(insets.bottom, 8),
          paddingTop: 6,
          height: 56 + Math.max(insets.bottom, 8),
          elevation: 0,
          shadowOpacity: 0,
        },
        tabBarLabelStyle: {
          fontSize: 10,
          fontWeight: '700',
          letterSpacing: 0.3,
          marginTop: 2,
        },
        headerShown: false,
      })}
    >
      <Tab.Screen name="Home" component={HomeWithExitConfirmation} />
      <Tab.Screen name="Personal" component={PersonalWithBackToHome} />
      <Tab.Screen name="Groups" component={GroupsWithBackToHome} />
      <Tab.Screen name="Insights" component={InsightsWithBackToHome} />
      <Tab.Screen name="Profile" component={ProfileWithBackToHome} />
    </Tab.Navigator>
  );
}

export function AppNavigator() {
  const { isAuthenticated } = useAuth();
  const { colors, isDark } = useTheme();
  const [hasOnboarded, setHasOnboarded] = useState<boolean | null>(null);

  useEffect(() => {
    AsyncStorage.getItem(ONBOARDING_KEY).then(val => {
      setHasOnboarded(val === 'true');
    });
  }, []);

  const handleOnboardingComplete = async () => {
    await AsyncStorage.setItem(ONBOARDING_KEY, 'true');
    setHasOnboarded(true);
  };

  // Wait until onboarding state is loaded
  if (hasOnboarded === null) return null;

  return (
    <NavigationContainer
      theme={{
        dark: isDark,
        colors: {
          primary: colors.primary,
          background: colors.background,
          card: colors.surface,
          text: colors.text,
          border: colors.border,
          notification: colors.primary,
        },
        fonts: {
          regular: { fontFamily: 'System', fontWeight: '400' },
          medium: { fontFamily: 'System', fontWeight: '500' },
          bold: { fontFamily: 'System', fontWeight: '700' },
          heavy: { fontFamily: 'System', fontWeight: '800' },
        },
      }}
    >
      <Stack.Navigator
        screenOptions={{
          headerStyle: {
            backgroundColor: colors.surface,
          },
          headerTintColor: colors.text,
          headerTitleStyle: {
            fontWeight: '700',
            color: colors.text,
            fontSize: 16,
          },
          headerShadowVisible: false,
          contentStyle: { backgroundColor: colors.background },
          gestureEnabled: true,
          animation: 'slide_from_right',
          animationDuration: 250,
          ...(Platform.OS === 'ios' ? { fullScreenGestureEnabled: true } : {}),
        }}
      >
        {!hasOnboarded ? (
          <Stack.Screen name="Onboarding" options={{ headerShown: false }}>
            {() => <OnboardingScreen onComplete={handleOnboardingComplete} />}
          </Stack.Screen>
        ) : !isAuthenticated ? (
          // Auth flow - Login screen
          <Stack.Screen
            name="Login"
            options={{ headerShown: false }}
          >
            {() => <LoginScreenWrapper />}
          </Stack.Screen>
        ) : (
          // Main app flow
          <>
            <Stack.Screen name="MainTabs" component={MainTabs} options={{ headerShown: false }} />
            <Stack.Screen
              name="Goals"
              component={GoalsScreen}
              options={{ title: 'Savings Goals', headerBackTitle: '' }}
            />
            <Stack.Screen
              name="GroupDetail"
              component={GroupDetailScreen}
              options={{ title: 'Group', headerBackTitle: '' }}
            />
            <Stack.Screen
              name="GroupSettings"
              component={GroupSettingsScreen}
              options={{ title: 'Group Settings', headerBackTitle: '' }}
            />
            <Stack.Screen
              name="CreateGroup"
              component={CreateGroupScreen}
              options={{
                title: 'New Group',
                presentation: 'modal',
                animation: 'slide_from_bottom',
                headerLeft: () => <ModalCloseButton />,
              }}
            />
            <Stack.Screen
              name="TransactionDetail"
              component={TransactionDetailScreen}
              options={{
                title: 'Transaction',
                presentation: 'modal',
                animation: 'slide_from_bottom',
                headerLeft: () => <ModalCloseButton />,
              }}
            />
            <Stack.Screen
              name="TrackerSettings"
              component={TrackerSettingsScreen}
              options={{
                title: 'Tracker Settings',
                presentation: 'modal',
                animation: 'slide_from_bottom',
                headerLeft: () => <ModalCloseButton />,
              }}
            />
            <Stack.Screen
              name="Reimbursement"
              component={ReimbursementScreen}
              options={{ title: 'Reimbursement', headerBackTitle: '' }}
            />
            <Stack.Screen
              name="Pricing"
              component={PricingScreen}
              options={{ title: 'Premium Plans', headerBackTitle: '' }}
            />
            <Stack.Screen
              name="Referral"
              component={ReferralScreen}
              options={{ title: 'Refer & Earn', headerBackTitle: '' }}
            />
            <Stack.Screen
              name="SplitEditor"
              component={SplitEditorScreen}
              options={{
                title: 'Split Expense',
                presentation: 'modal',
                animation: 'slide_from_bottom',
                headerLeft: () => <ModalCloseButton />,
              }}
            />
            <Stack.Screen
              name="NightlyReview"
              component={NightlyReviewScreen}
              options={{ title: 'Nightly Review', headerBackTitle: '' }}
            />
            <Stack.Screen
              name="QuickAdd"
              component={QuickAddScreen}
              options={{ title: 'Quick Add', presentation: 'modal', animation: 'fade_from_bottom', headerShown: false }}
            />
            <Stack.Screen
              name="Subscriptions"
              component={SubscriptionsScreen}
              options={{ headerShown: false }}
            />
            <Stack.Screen
              name="Investments"
              component={InvestmentsScreen}
              options={{ headerShown: false }}
            />
            <Stack.Screen
              name="EMIs"
              component={EMIsScreen}
              options={{ headerShown: false }}
            />
            {Platform.OS === 'ios' && (
              <Stack.Screen
                name="IOSSetup"
                component={IOSSetupScreen}
                options={{
                  title: 'iPhone Setup',
                  presentation: 'modal',
                  animation: 'slide_from_bottom',
                  headerLeft: () => <ModalCloseButton />,
                }}
              />
            )}
          </>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}

/** Wrapper to connect LoginScreen to AuthContext */
function LoginScreenWrapper() {
  const { signIn } = useAuth();
  return <LoginScreen onAuthSuccess={signIn} />;
}
