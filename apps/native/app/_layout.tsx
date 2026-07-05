import * as Notifications from 'expo-notifications';
import { Stack, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider, useAuth } from '../src/auth/AuthContext';
import { AuthScreen } from '../src/auth/AuthScreen';
import { IncomingCallOverlay } from '../src/calls/IncomingCallOverlay';
import { StoreProvider } from '../src/store';
import { colors, fonts } from '../src/theme';

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
      </Stack>
      <IncomingCallOverlay />
    </>
  );
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <AuthProvider>
          <StoreProvider>
            <StatusBar style="light" />
            <Gate />
          </StoreProvider>
        </AuthProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
