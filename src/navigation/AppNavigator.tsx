import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Text, View } from 'react-native';

import { Platform } from 'react-native';
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
import IOSSetupScreen from '../screens/iOSSetupScreen';
import PricingScreen from '../screens/PricingScreen';
import ReferralScreen from '../screens/ReferralScreen';
import LoginScreen from '../screens/LoginScreen';

import { COLORS } from '../utils/helpers';
import { useAuth } from '../store/AuthContext';

export type RootStackParamList = {
  Login: undefined;
  MainTabs: undefined;
  GroupDetail: { groupId: string };
  CreateGroup: undefined;
  TransactionDetail: { transactionId: string };
  TrackerSettings: undefined;
  Reimbursement: undefined;
  IOSSetup: undefined;
  Pricing: undefined;
  Referral: undefined;
};

export type TabParamList = {
  Home: undefined;
  Personal: undefined;
  Groups: undefined;
  Goals: undefined;
  Profile: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();
const Tab = createBottomTabNavigator<TabParamList>();

// Simple emoji-based icons since we keep it dependency-light
const EMOJI_ICONS: Record<string, string> = {
  Home:     '🏠',
  Personal: '💳',
  Groups:   '👥',
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

function MainTabs() {
  const LABELS: Record<string, string> = {
    Home: 'Home',
    Personal: 'Personal',
    Groups: 'Groups',
    Goals: 'Goals',
    Profile: 'Profile',
  };

  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        tabBarIcon: ({ focused }) => <TabIcon name={route.name} focused={focused} />,
        tabBarLabel: LABELS[route.name] || route.name,
        tabBarActiveTintColor: COLORS.primary,
        tabBarInactiveTintColor: COLORS.textSecondary,
        tabBarStyle: {
          backgroundColor: COLORS.surface,
          borderTopColor: COLORS.border,
          borderTopWidth: 1,
          paddingBottom: 6,
          paddingTop: 4,
          height: 60,
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
      <Tab.Screen name="Home" component={HomeScreen} />
      <Tab.Screen name="Personal" component={PersonalExpenseScreen} />
      <Tab.Screen name="Groups" component={GroupListScreen} />
      <Tab.Screen name="Goals" component={GoalsScreen} />
      <Tab.Screen name="Profile" component={ProfileScreen} />
    </Tab.Navigator>
  );
}

export function AppNavigator() {
  const { isAuthenticated } = useAuth();

  return (
    <NavigationContainer
      theme={{
        dark: true,
        colors: {
          primary: COLORS.primary,
          background: COLORS.background,
          card: COLORS.surface,
          text: COLORS.text,
          border: COLORS.border,
          notification: COLORS.primary,
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
            backgroundColor: COLORS.surface,
          },
          headerTintColor: COLORS.text,
          headerTitleStyle: {
            fontWeight: '700',
            color: COLORS.text,
            fontSize: 16,
          },
          headerShadowVisible: false,
          contentStyle: { backgroundColor: COLORS.background },
        }}
      >
        {!isAuthenticated ? (
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
              name="GroupDetail"
              component={GroupDetailScreen}
              options={{ title: 'Group', headerBackTitle: '' }}
            />
            <Stack.Screen
              name="CreateGroup"
              component={CreateGroupScreen}
              options={{ title: 'New Group', presentation: 'modal' }}
            />
            <Stack.Screen
              name="TransactionDetail"
              component={TransactionDetailScreen}
              options={{ title: 'Transaction', presentation: 'modal' }}
            />
            <Stack.Screen
              name="TrackerSettings"
              component={TrackerSettingsScreen}
              options={{ title: 'Tracker Settings', presentation: 'modal' }}
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
            {Platform.OS === 'ios' && (
              <Stack.Screen
                name="IOSSetup"
                component={IOSSetupScreen}
                options={{ title: 'iPhone Setup', presentation: 'modal' }}
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
