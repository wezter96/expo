import { Tabs } from 'expo-router';
import React from 'react';
import { AddButton } from '../../src/components/AddButton';
import { KinlyTabBar } from '../../src/components/KinlyTabBar';
import { BASE_FONTS } from '../../src/theme';
import { useTheme } from '../../src/theme-context';

export default function TabsLayout() {
  const { colors } = useTheme();
  return (
    <Tabs
      // Order matters: the middle route ("assistant") becomes the raised button.
      tabBar={(props) => <KinlyTabBar {...props} />}
      screenOptions={{
        headerStyle: { backgroundColor: colors.primary },
        headerTintColor: colors.textOnDark,
        // Header text stays a fixed, compact size (it must not grow with the
        // in-app text-size setting or it collides with the header actions).
        headerTitleStyle: { fontSize: BASE_FONTS.heading, fontWeight: '800' },
        headerTitleAlign: 'center',
        // Theme the scene background so dark mode is actually dark on the tab
        // screens (not just their cards).
        sceneStyle: { backgroundColor: colors.background },
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Messages', headerRight: () => <AddButton /> }} />
      <Tabs.Screen name="assistant" options={{ title: 'Assistant' }} />
      <Tabs.Screen name="settings" options={{ title: 'Settings' }} />
    </Tabs>
  );
}
