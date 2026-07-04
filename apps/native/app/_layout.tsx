import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { colors, fonts } from '../src/theme';
import { StoreProvider } from '../src/store';

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <StoreProvider>
          <StatusBar style="light" />
          <Stack
            screenOptions={{
              headerStyle: { backgroundColor: colors.primary },
              headerTintColor: colors.textOnDark,
              headerTitleStyle: { fontSize: fonts.heading, fontWeight: '800' },
              headerBackTitle: 'Back',
              contentStyle: { backgroundColor: colors.background },
            }}
          >
            <Stack.Screen name="index" options={{ title: 'Kinly' }} />
            <Stack.Screen name="contacts" options={{ title: 'People' }} />
            <Stack.Screen name="assistant" options={{ title: 'Assistant' }} />
            <Stack.Screen name="chat/[id]" options={{ title: 'Chat' }} />
          </Stack>
        </StoreProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
