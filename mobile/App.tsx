import React, { useEffect, useRef } from 'react';
import { ActivityIndicator, View, StyleSheet } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { NavigationContainer, NavigationContainerRef } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import { AuthProvider, useAuth } from './src/context/AuthContext';
import { RealtimeProvider } from './src/context/RealtimeContext';
import { RootStackParamList, TabParamList, TasksStackParamList, LeaveStackParamList, DocumentsStackParamList, SupportStackParamList, MoreStackParamList, CalendarStackParamList, WorkStackParamList } from './src/types';
import ErrorBoundary, { CrashFallback } from './src/components/ErrorBoundary';
import { colors, spacing, typography } from './src/theme';
import { NotificationsProvider, useNotifications } from './src/notifications/NotificationContext';
import { navigateToNotificationRoute } from './src/utils/notifications';
import { NotificationBanner } from './src/components/NotificationBanner';

import LoginScreen from './src/screens/LoginScreen';
import HomeScreen from './src/screens/HomeScreen';
import CameraScreen from './src/screens/CameraScreen';
import AttendanceScreen from './src/screens/AttendanceScreen';
import DashboardScreen from './src/screens/DashboardScreen';
import AnnouncementsScreen from './src/screens/AnnouncementsScreen';
import NotificationsScreen from './src/screens/NotificationsScreen';
import TasksScreen from './src/screens/TasksScreen';
import TaskDetailScreen from './src/screens/TaskDetailScreen';
import LeaveScreen from './src/screens/LeaveScreen';
import ApplyLeaveScreen from './src/screens/ApplyLeaveScreen';
import DocumentsScreen from './src/screens/DocumentsScreen';
import DocumentDetailScreen from './src/screens/DocumentDetailScreen';
import UploadDocumentScreen from './src/screens/UploadDocumentScreen';
import SupportHomeScreen from './src/screens/SupportHomeScreen';
import NewRequestScreen from './src/screens/NewRequestScreen';
import RequestDetailScreen from './src/screens/RequestDetailScreen';
import MoreScreen from './src/screens/MoreScreen';
import DirectoryScreen from './src/screens/DirectoryScreen';
import EmployeeProfileScreen from './src/screens/EmployeeProfileScreen';
import MyProfileScreen from './src/screens/MyProfileScreen';
import EditProfileScreen from './src/screens/EditProfileScreen';
import SettingsScreen from './src/screens/SettingsScreen';
import ChangePasswordScreen from './src/screens/ChangePasswordScreen';
import CalendarHomeScreen from './src/screens/CalendarHomeScreen';
import CalendarItemScreen from './src/screens/CalendarItemScreen';
import WorkSummaryScreen from './src/screens/WorkSummaryScreen';
import WorkScreen from './src/screens/WorkScreen';
import ProjectDetailScreen from './src/screens/ProjectDetailScreen';
import SearchScreen from './src/screens/SearchScreen';

const Stack = createNativeStackNavigator<RootStackParamList>();
const Tab = createBottomTabNavigator<TabParamList>();
const TasksStack = createNativeStackNavigator<TasksStackParamList>();
const LeaveStack = createNativeStackNavigator<LeaveStackParamList>();
const DocumentsStack = createNativeStackNavigator<DocumentsStackParamList>();
const SupportStack = createNativeStackNavigator<SupportStackParamList>();
const MoreStack = createNativeStackNavigator<MoreStackParamList>();
const CalendarStack = createNativeStackNavigator<CalendarStackParamList>();
const WorkStack = createNativeStackNavigator<WorkStackParamList>();
const AttStack = createNativeStackNavigator();

const navigationRef = React.createRef<NavigationContainerRef<RootStackParamList>>();

function TasksStackNavigator() {
  return (
    <TasksStack.Navigator screenOptions={{ headerShown: false }}>
      <TasksStack.Screen name='TasksList' component={TasksScreen} />
      <TasksStack.Screen name='TaskDetail' component={TaskDetailScreen} />
    </TasksStack.Navigator>
  );
}

function LeaveStackNavigator() {
  return (
    <LeaveStack.Navigator screenOptions={{ headerShown: false }}>
      <LeaveStack.Screen name='LeaveHome' component={LeaveScreen} />
      <LeaveStack.Screen name='ApplyLeave' component={ApplyLeaveScreen} />
    </LeaveStack.Navigator>
  );
}

function DocumentsStackNavigator() {
  return (
    <DocumentsStack.Navigator screenOptions={{ headerShown: false }}>
      <DocumentsStack.Screen name='DocumentsHome' component={DocumentsScreen} />
      <DocumentsStack.Screen name='DocumentDetail' component={DocumentDetailScreen} />
      <DocumentsStack.Screen name='UploadDocument' component={UploadDocumentScreen} />
    </DocumentsStack.Navigator>
  );
}

function SupportStackNavigator() {
  return (
    <SupportStack.Navigator screenOptions={{ headerShown: false }}>
      <SupportStack.Screen name='SupportHome' component={SupportHomeScreen} />
      <SupportStack.Screen name='NewRequest' component={NewRequestScreen} />
      <SupportStack.Screen name='RequestDetail' component={RequestDetailScreen} />
    </SupportStack.Navigator>
  );
}

function MoreStackNavigator() {
  return (
    <MoreStack.Navigator screenOptions={{ headerShown: false }}>
      <MoreStack.Screen name='MoreHome' component={MoreScreen} />
      <MoreStack.Screen name='Directory' component={DirectoryScreen} />
      <MoreStack.Screen name='EmployeeProfile' component={EmployeeProfileScreen} />
      <MoreStack.Screen name='MyProfile' component={MyProfileScreen} />
      <MoreStack.Screen name='EditProfile' component={EditProfileScreen} />
      <MoreStack.Screen name='Settings' component={SettingsScreen} />
      <MoreStack.Screen name='ChangePassword' component={ChangePasswordScreen} />
    </MoreStack.Navigator>
  );
}

function CalendarStackNavigator() {
  return (
    <CalendarStack.Navigator screenOptions={{ headerShown: false }}>
      <CalendarStack.Screen name='CalendarHome' component={CalendarHomeScreen} />
      <CalendarStack.Screen name='CalendarItem' component={CalendarItemScreen} />
    </CalendarStack.Navigator>
  );
}

function WorkStackNavigator() {
  return (
    <WorkStack.Navigator screenOptions={{ headerShown: false }}>
      <WorkStack.Screen name='WorkHome' component={WorkScreen} />
      <WorkStack.Screen name='ProjectDetail' component={ProjectDetailScreen} />
    </WorkStack.Navigator>
  );
}

function AttendanceStack() {
  return (
    <AttStack.Navigator screenOptions={{ headerShown: false }}>
      <AttStack.Screen name='Home' component={HomeScreen} />
      <AttStack.Screen name='Camera' component={CameraScreen} />
      <AttStack.Screen name='Attendance' component={AttendanceScreen} />
    </AttStack.Navigator>
  );
}

// Bounded wait for NavigationContainer to settle (20 x 600ms = 12s max).
const MAX_NAVIGATION_ATTEMPTS = 20;

// Navigates the app to the screen a tapped notification points to.
function NotificationRouter() {
  const { pendingRoute, consumePendingRoute } = useNotifications();
  const { employee, loading } = useAuth();
  const retryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!pendingRoute) return;
    // Never route into the protected stack without a signed-in session;
    // while auth is still restoring, hold the route until it resolves.
    if (loading) return;
    if (!employee) {
      consumePendingRoute();
      return;
    }

    let cancelled = false;
    let attempts = 0;

    const attempt = () => {
      if (cancelled) return;
      const navigation = navigationRef.current;
      if (!navigation?.isReady()) {
        attempts += 1;
        if (attempts >= MAX_NAVIGATION_ATTEMPTS) {
          consumePendingRoute();
          return;
        }
        retryTimer.current = setTimeout(attempt, 600);
        return;
      }
      navigateToNotificationRoute(navigation, pendingRoute);
      consumePendingRoute();
    };

    attempt();
    return () => {
      cancelled = true;
      if (retryTimer.current) clearTimeout(retryTimer.current);
    };
  }, [pendingRoute, consumePendingRoute, employee, loading]);

  // In-app banner for notifications that arrive while the app is open.
  return (
    <NotificationBanner
      onOpen={route => {
        const navigation = navigationRef.current;
        if (!navigation?.isReady()) return;
        if (route) navigateToNotificationRoute(navigation, route);
        else navigation.navigate('Notifications');
      }}
    />
  );
}

function MainTabs() {
  const insets = useSafeAreaInsets();
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textSecondary,
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopWidth: 1,
          borderTopColor: colors.border,
          paddingBottom: insets.bottom > 0 ? insets.bottom : spacing.sm,
          paddingTop: spacing.xs,
          height: insets.bottom > 0 ? 60 + insets.bottom : 60,
          elevation: 0,
          shadowOpacity: 0,
        },
        tabBarLabelStyle: {
          ...typography.caption,
          fontWeight: '600',
          marginTop: -spacing.xs,
        },
        tabBarIconStyle: {
          marginTop: spacing.xs,
        },
      }}>
      <Tab.Screen
        name='Dashboard'
        component={AttendanceStack}
        options={{
          tabBarLabel: 'Home',
          tabBarIcon: ({ color, size }) => (
            <MaterialCommunityIcons name='home-outline' size={size} color={color} />
          ),
        }}
      />
      <Tab.Screen
        name='Attendance'
        component={DashboardScreen}
        options={{
          tabBarLabel: 'Attendance',
          tabBarIcon: ({ color, size }) => (
            <MaterialCommunityIcons name='calendar-check-outline' size={size} color={color} />
          ),
        }}
      />
      <Tab.Screen
        name='Tasks'
        component={TasksStackNavigator}
        options={{
          tabBarLabel: 'Tasks',
          tabBarIcon: ({ color, size }) => (
            <MaterialCommunityIcons name='clipboard-text-outline' size={size} color={color} />
          ),
        }}
      />
      <Tab.Screen
        name='Work'
        component={WorkStackNavigator}
        options={{
          tabBarLabel: 'Work',
          tabBarIcon: ({ color, size }) => (
            <MaterialCommunityIcons name='briefcase-outline' size={size} color={color} />
          ),
        }}
      />
      <Tab.Screen
        name='Announcements'
        component={AnnouncementsScreen}
        options={{
          tabBarLabel: 'Announcements',
          tabBarIcon: ({ color, size }) => (
            <MaterialCommunityIcons name='bullhorn-outline' size={size} color={color} />
          ),
        }}
      />
    </Tab.Navigator>
  );
}

function AppNavigator() {
  const { employee, loading } = useAuth();

  if (loading) {
    return (
      <View style={styles.loadingContainer} accessibilityRole='progressbar'>
        <ActivityIndicator size='large' color={colors.primary} />
      </View>
    );
  }

  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      {!employee ? (
        <Stack.Screen name='Login' component={LoginScreen} />
      ) : (
<>
          <Stack.Screen name='MainTabs' component={MainTabs} />
          <Stack.Screen name='Camera' component={CameraScreen} />
          <Stack.Screen name='Attendance' component={AttendanceScreen} />
          <Stack.Screen name='Notifications' component={NotificationsScreen} />
          <Stack.Screen name='Documents' component={DocumentsStackNavigator} />
          <Stack.Screen name='Support' component={SupportStackNavigator} />
          <Stack.Screen name='Calendar' component={CalendarStackNavigator} />
          <Stack.Screen name='More' component={MoreStackNavigator} />
          <Stack.Screen name='Leave' component={LeaveStackNavigator} />
          <Stack.Screen name='WorkSummary' component={WorkSummaryScreen} />
          <Stack.Screen name='Search' component={SearchScreen} />
        </>
      )}
    </Stack.Navigator>
  );
}

function AppContent() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <RealtimeProvider>
          <NotificationsProvider>
            <NavigationContainer ref={navigationRef}>
              <AppNavigator />
              <NotificationRouter />
              <StatusBar style='dark' backgroundColor={colors.surface} />
            </NavigationContainer>
          </NotificationsProvider>
        </RealtimeProvider>
      </AuthProvider>
    </SafeAreaProvider>
  );
}

export default function App() {
  const [crashError, setCrashError] = React.useState<Error | null>(null);

  const handleRetry = () => {
    setCrashError(null);
  };

  return (
    <ErrorBoundary fallback={<CrashFallback onRetry={handleRetry} errorMessage={crashError?.message} />}>
      <AppContent />
    </ErrorBoundary>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.background,
  },
});

