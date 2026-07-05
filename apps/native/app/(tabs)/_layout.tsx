import { Tabs } from 'expo-router';
import React from 'react';
import { AddButton } from '../../src/components/AddButton';
import { KinlyTabBar } from '../../src/components/KinlyTabBar';
import { colors, fonts } from '../../src/theme';

export default function TabsLayout() {
  return (
    <Tabs
      // Order matters: the middle route ("assistant") becomes the raised button.
      tabBar={(props) => <KinlyTabBar {...props} />}
      screenOptions={{
        headerStyle: { backgroundColor: colors.primary },
        headerTintColor: colors.textOnDark,
        headerTitleStyle: { fontSize: fonts.heading, fontWeight: '800' },
        headerTitleAlign: 'center',
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Messages', headerRight: () => <AddButton /> }} />
      <Tabs.Screen name="assistant" options={{ title: 'Assistant' }} />
      <Tabs.Screen name="settings" options={{ title: 'Settings' }} />
    </Tabs>
  );
}
