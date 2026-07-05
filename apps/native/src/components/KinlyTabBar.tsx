import { Ionicons } from '@expo/vector-icons';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, fonts, spacing } from '../theme';

/**
 * A big, elderly-friendly bottom tab bar with a raised circular AI button in
 * the middle. Three destinations only:
 *   left  = Messages (chat)
 *   center= Assistant (AI sparkles) — the star of the show, so it's elevated
 *   right = Settings
 */

const ICONS: Record<string, keyof typeof Ionicons.glyphMap> = {
  index: 'chatbubbles',
  assistant: 'sparkles',
  settings: 'settings-sharp',
};

const LABELS: Record<string, string> = {
  index: 'Messages',
  assistant: 'Assistant',
  settings: 'Settings',
};

export function KinlyTabBar({ state, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.bar, { paddingBottom: Math.max(insets.bottom, spacing.sm) }]}>
      {state.routes.map((route, index) => {
        const focused = state.index === index;
        const isCenter = route.name === 'assistant';

        const onPress = () => {
          const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
          if (!focused && !event.defaultPrevented) navigation.navigate(route.name);
        };

        if (isCenter) {
          return (
            <View key={route.key} style={styles.centerSlot}>
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ selected: focused }}
                accessibilityLabel={LABELS[route.name]}
                onPress={onPress}
                style={({ pressed }) => [styles.centerButton, pressed && styles.centerPressed]}
              >
                <Ionicons name="sparkles" size={38} color={colors.textOnDark} />
              </Pressable>
              <Text style={styles.centerLabel}>Assistant</Text>
            </View>
          );
        }

        const tint = focused ? colors.primary : colors.textMuted;
        return (
          <Pressable
            key={route.key}
            accessibilityRole="button"
            accessibilityState={{ selected: focused }}
            accessibilityLabel={LABELS[route.name]}
            onPress={onPress}
            style={styles.sideTab}
          >
            <Ionicons name={ICONS[route.name] ?? 'ellipse'} size={30} color={tint} />
            <Text style={[styles.sideLabel, { color: tint }]}>{LABELS[route.name]}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const BAR_HEIGHT = 74;
const CENTER_SIZE = 74;

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-around',
    minHeight: BAR_HEIGHT,
    backgroundColor: colors.card,
    borderTopWidth: 2,
    borderTopColor: colors.border,
    // let the raised center button overflow above the bar
    overflow: 'visible',
  },
  sideTab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: spacing.sm,
    gap: 3,
  },
  sideLabel: { fontSize: fonts.small - 1, fontWeight: '700' },

  centerSlot: {
    flex: 1,
    alignItems: 'center',
    // raise the whole slot so the circle floats above the bar
    marginTop: -(CENTER_SIZE / 2),
  },
  centerButton: {
    width: CENTER_SIZE,
    height: CENTER_SIZE,
    borderRadius: CENTER_SIZE / 2,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 5,
    borderColor: colors.card,
    // shadow (iOS) + elevation (Android)
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 10,
  },
  centerPressed: { opacity: 0.85, transform: [{ scale: 0.96 }] },
  centerLabel: {
    marginTop: 4,
    fontSize: fonts.small - 1,
    fontWeight: '800',
    color: colors.primary,
  },
});
