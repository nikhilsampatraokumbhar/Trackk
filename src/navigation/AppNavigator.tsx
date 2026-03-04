import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { RootStackParamList, MainTabParamList, AuthStackParamList } from '../models/types';
import { COLORS } from '../utils/helpers';
import { useAuth } from '../store/AuthContext';

// Screens — Main app
import { HomeScreen } from '../screens/HomeScreen';
import { PersonalExpenseScreen } from '../screens/PersonalExpenseScreen';
import { GroupListScreen } from '../screens/GroupListScreen';
import { ReimbursementScreen } from '../screens/ReimbursementScreen';
import { GoalsScreen } from '../screens/GoalsScreen';
import { GroupDetailScreen } from '../screens/GroupDetailScreen';
import { CreateGroupScreen } from '../screens/CreateGroupScreen';
import { TransactionDetailScreen } from '../screens/TransactionDetailScreen';
import { TrackerSettingsScreen } from '../screens/TrackerSettingsScreen';
import { SettleDebtScreen } from '../screens/SettleDebtScreen';
import { GroupSummaryScreen } from '../screens/GroupSummaryScreen';

// Screens — Auth
import { LoginScreen } from '../screens/LoginScreen';
import { OTPVerifyScreen } from '../screens/OTPVerifyScreen';

const RootStack = createNativeStackNavigator<RootStackParamList>();
const Tab = createBottomTabNavigator<MainTabParamList>();
const AuthStack = createNativeStackNavigator<AuthStackParamList>();

function AuthNavigator() {
  return (
    <AuthStack.Navigator screenOptions={{ headerShown: false }}>
      <AuthStack.Screen name="Login" component={LoginScreen} />
      <AuthStack.Screen
        name="OTPVerify"
        component={OTPVerifyScreen}
        options={{
          headerShown: true,
          headerTitle: 'Verify OTP',
          headerStyle: { backgroundColor: COLORS.primary },
          headerTintColor: '#FFFFFF',
          headerTitleStyle: { fontWeight: '700' },
        }}
      />
    </AuthStack.Navigator>
  );
}

function MainTabs() {
  return (
    <Tab.Navigator
      screenOptions={{
        tabBarActiveTintColor: COLORS.primary,
        tabBarInactiveTintColor: COLORS.textLight,
        tabBarStyle: {
          backgroundColor: COLORS.surface,
          borderTopColor: COLORS.border,
          borderTopWidth: 1,
          paddingBottom: 8,
          paddingTop: 8,
          height: 62,
        },
        tabBarLabelStyle: { fontSize: 10, fontWeight: '700', letterSpacing: 0.5 },
        headerStyle: { backgroundColor: COLORS.surface, elevation: 0, shadowOpacity: 0, borderBottomWidth: 1, borderBottomColor: COLORS.border },
        headerTintColor: COLORS.text,
        headerTitleStyle: { fontWeight: '800', fontSize: 16, letterSpacing: 0.2 },
      }}>
      <Tab.Screen
        name="Home"
        component={HomeScreen}
        options={{ tabBarLabel: 'Home', headerTitle: 'Expense Tracker' }}
      />
      <Tab.Screen
        name="Personal"
        component={PersonalExpenseScreen}
        options={{ tabBarLabel: 'Personal', headerTitle: 'Personal Expenses' }}
      />
      <Tab.Screen
        name="Groups"
        component={GroupListScreen}
        options={{ tabBarLabel: 'Groups', headerTitle: 'Group Expenses' }}
      />
      <Tab.Screen
        name="Goals"
        component={GoalsScreen}
        options={{ tabBarLabel: 'Goals', headerTitle: 'Savings Goals' }}
      />
      <Tab.Screen
        name="Reimbursement"
        component={ReimbursementScreen}
        options={{ tabBarLabel: 'Reimburse', headerTitle: 'Reimbursement' }}
      />
    </Tab.Navigator>
  );
}

export function AppNavigator() {
  const { user, loading } = useAuth();

  if (loading) return null;

  return (
    <NavigationContainer>
      {user ? (
        <RootStack.Navigator
          screenOptions={{
            headerStyle: { backgroundColor: COLORS.surface, elevation: 0, shadowOpacity: 0, borderBottomWidth: 1, borderBottomColor: COLORS.border },
            headerTintColor: COLORS.text,
            headerTitleStyle: { fontWeight: '800', fontSize: 16 },
          }}>
          <RootStack.Screen
            name="MainTabs"
            component={MainTabs}
            options={{ headerShown: false }}
          />
          <RootStack.Screen
            name="GroupDetail"
            component={GroupDetailScreen}
            options={{ headerTitle: 'Group Details' }}
          />
          <RootStack.Screen
            name="CreateGroup"
            component={CreateGroupScreen}
            options={{ headerTitle: 'Create Group' }}
          />
          <RootStack.Screen
            name="TransactionDetail"
            component={TransactionDetailScreen}
            options={{ headerTitle: 'Transaction' }}
          />
          <RootStack.Screen
            name="TrackerSettings"
            component={TrackerSettingsScreen}
            options={{ headerTitle: 'Tracker Settings' }}
          />
          <RootStack.Screen
            name="SettleDebt"
            component={SettleDebtScreen}
            options={{ headerTitle: 'Settle Up' }}
          />
          <RootStack.Screen
            name="GroupSummary"
            component={GroupSummaryScreen}
            options={{ headerTitle: 'Group Summary' }}
          />
        </RootStack.Navigator>
      ) : (
        <AuthNavigator />
      )}
    </NavigationContainer>
  );
}
