import {
  AtkinsonHyperlegible_400Regular,
  AtkinsonHyperlegible_700Bold,
  useFonts,
} from '@expo-google-fonts/atkinson-hyperlegible';
import * as Notifications from 'expo-notifications';
import { Stack, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AppLockProvider, LockOverlay } from '../src/applock';
import { AuthProvider, useAuth } from '../src/auth/AuthContext';
import { AuthScreen } from '../src/auth/AuthScreen';
import { IncomingCallOverlay } from '../src/calls/IncomingCallOverlay';
import { WebNotice } from '../src/components/WebNotice';
import { applyGlobalFont } from '../src/global-font';
import { StoreProvider } from '../src/store';
import { ThemeProvider, useTheme } from '../src/theme-context';

/** Opens the right chat when a push notification is tapped. */
function useNotificationRouting() {
  const router = useRouter();
  useEffect(() => {
    const sub = Notifications.addNotificationResponseReceivedListener((response) => {
      const id = response.notification.request.content.data?.conversationId;
      if (typeof id === 'string') router.push(`/chat/${id}`);
    });
    return () => sub.remove();
  }, [router]);
}

function Gate() {
  const { ready, needsAuth } = useAuth();
  const { colors, fonts } = useTheme();
  useNotificationRouting();

  if (!ready) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background }}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (needsAuth) return <AuthScreen />;

  return (
    <>
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: colors.primary },
          headerTintColor: colors.textOnDark,
          headerTitleStyle: { fontSize: fonts.heading, fontWeight: '800' },
          headerBackTitle: 'Back',
          contentStyle: { backgroundColor: colors.background },
        }}
      >
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="chat/[id]" options={{ title: 'Chat' }} />
        <Stack.Screen name="call/[id]" options={{ headerShown: false, animation: 'fade' }} />
        <Stack.Screen name="new-chat" options={{ title: 'Add a person', presentation: 'modal' }} />
        <Stack.Screen name="new-group" options={{ title: 'New group', presentation: 'modal' }} />
        <Stack.Screen name="profile" options={{ title: 'Your profile', presentation: 'modal' }} />
        <Stack.Screen name="emergency" options={{ title: 'Emergency contact', presentation: 'modal' }} />
        <Stack.Screen name="group/[id]" options={{ title: 'Group', presentation: 'modal' }} />
        <Stack.Screen name="display" options={{ title: 'Display', presentation: 'modal' }} />
        <Stack.Screen name="encryption" options={{ title: 'Encryption', presentation: 'modal' }} />
        <Stack.Screen name="link-device" options={{ title: 'Link a device', presentation: 'modal' }} />
        <Stack.Screen name="verify" options={{ title: 'Verify', presentation: 'modal' }} />
      </Stack>
      <IncomingCallOverlay />
    </>
  );
}

function ThemedStatusBar() {
  const { isDark } = useTheme();
  return <StatusBar style={isDark ? 'light' : 'light'} />;
}

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    AtkinsonHyperlegible_400Regular,
    AtkinsonHyperlegible_700Bold,
  });
  if (fontsLoaded) applyGlobalFont();

  if (!fontsLoaded) {
    // Brief splash while the legibility typeface loads.
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F8F9FA' }}>
        <ActivityIndicator size="large" color="#1A4B84" />
      </View>
    );
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ThemeProvider>
          <AppLockProvider>
            <AuthProvider>
              <StoreProvider>
                <ThemedStatusBar />
                <WebNotice />
                <Gate />
                <LockOverlay />
              </StoreProvider>
            </AuthProvider>
          </AppLockProvider>
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
