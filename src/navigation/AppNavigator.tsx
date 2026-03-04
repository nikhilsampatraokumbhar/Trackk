import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { NavigationContainer, useNavigation } from '@react-navigation/native';
import { createNativeStackNavigator, NativeStackNavigationProp } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { RootStackParamList, MainTabParamList, AuthStackParamList } from '../models/types';
import { COLORS } from '../utils/helpers';
import { useAuth } from '../store/AuthContext';
import Icon from 'react-native-vector-icons/MaterialIcons';

// Screens — Main app
import { HomeScreen } from '../screens/HomeScreen';
import { PersonalExpenseScreen } from '../screens/PersonalExpenseScreen';
import { GroupListScreen } from '../screens/GroupListScreen';
import { ReimbursementScreen } from '../screens/ReimbursementScreen';
import { GoalsScreen } from '../screens/GoalsScreen';
import { ProfileScreen } from '../screens/ProfileScreen';
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

// ── Avatar button rendered in every tab's headerRight ─────────────────────────
// useNavigation inside a tab screen gives the tab nav; getParent() gives RootStack nav.
function HeaderAvatarButton() {
  const { user } = useAuth();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  const initials = (user?.displayName ?? '?')
    .split(' ')
    .map((w: string) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  return (
    <TouchableOpacity
      style={avatarStyles.btn}
      onPress={() => (navigation as any).getParent<NativeStackNavigationProp<RootStackParamList>>()?.navigate('Profile') ?? navigation.navigate('Profile')}
      activeOpacity={0.75}>
      <View style={avatarStyles.circle}>
        <Text style={avatarStyles.text}>{initials}</Text>
      </View>
    </TouchableOpacity>
  );
}

const avatarStyles = StyleSheet.create({
  btn: { marginRight: 12 },
  circle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: { fontSize: 12, fontWeight: '800', color: '#FFFFFF', letterSpacing: 0.5 },
});

// ── Auth navigator ─────────────────────────────────────────────────────────────
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

// ── Bottom tab navigator ───────────────────────────────────────────────────────
const sharedHeaderRight = () => <HeaderAvatarButton />;

function MainTabs() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        tabBarActiveTintColor: COLORS.primary,
        tabBarInactiveTintColor: COLORS.textLight,
        tabBarStyle: {
          backgroundColor: COLORS.surface,
          borderTopColor: COLORS.border,
          borderTopWidth: 1,
          paddingBottom: 8,
          paddingTop: 6,
          height: 66,
        },
        tabBarLabelStyle: { fontSize: 10, fontWeight: '700', letterSpacing: 0.4, marginTop: 2 },
        headerStyle: {
          backgroundColor: COLORS.surface,
          elevation: 0,
          shadowOpacity: 0,
          borderBottomWidth: 1,
          borderBottomColor: COLORS.border,
        },
        headerTintColor: COLORS.text,
        headerTitleStyle: { fontWeight: '800', fontSize: 16, letterSpacing: 0.2 },
        headerRight: sharedHeaderRight,
        tabBarIcon: ({ color, size }) => {
          const iconMap: Record<string, string> = {
            Home: 'home',
            Personal: 'account-balance-wallet',
            Groups: 'group',
            Goals: 'flag',
            Reimbursement: 'receipt',
          };
          return <Icon name={iconMap[route.name] ?? 'circle'} size={size} color={color} />;
        },
      })}>
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

// ── Root app navigator ─────────────────────────────────────────────────────────
export function AppNavigator() {
  const { user, loading } = useAuth();

  if (loading) return null;

  return (
    <NavigationContainer>
      {user ? (
        <RootStack.Navigator
          screenOptions={{
            headerStyle: {
              backgroundColor: COLORS.surface,
              elevation: 0,
              shadowOpacity: 0,
              borderBottomWidth: 1,
              borderBottomColor: COLORS.border,
            },
            headerTintColor: COLORS.text,
            headerTitleStyle: { fontWeight: '800', fontSize: 16 },
          }}>
          <RootStack.Screen
            name="MainTabs"
            component={MainTabs}
            options={{ headerShown: false }}
          />
          <RootStack.Screen
            name="Profile"
            component={ProfileScreen}
            options={{ headerTitle: 'My Profile' }}
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
