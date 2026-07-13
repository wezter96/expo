import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, fonts, radius, spacing } from '../theme';
import type { VideoCallProps } from './types';

/**
 * Web / fallback implementation.
 *
 * Real WebRTC video needs native modules that aren't available in the web
 * bundle (or Expo Go), so on those targets we show a friendly placeholder.
 * The native implementation lives in `VideoCall.native.tsx` and is what Metro
 * picks on iOS/Android.
 */
export function VideoCall({ name, onLeave }: VideoCallProps) {
  return (
    <View style={styles.container}>
      <View style={styles.iconWrap}>
        <Ionicons name="videocam" size={64} color={colors.textOnDark} />
      </View>
      <Text style={styles.title}>Video call with {name}</Text>
      <Text style={styles.body}>
        Video calls open in the Kinly app on your phone. Install Kinly to see and hear your family.
      </Text>
      <Pressable onPress={onLeave} style={({ pressed }) => [styles.leave, pressed && styles.pressed]}>
        <Ionicons name="arrow-back" size={28} color={colors.textOnDark} />
        <Text style={styles.leaveText}>Go back</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.primaryDark,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
    gap: spacing.md,
  },
  iconWrap: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  title: { fontSize: fonts.title, fontWeight: '800', color: colors.textOnDark, textAlign: 'center' },
  body: { fontSize: fonts.body, color: '#CFE8DA', textAlign: 'center', lineHeight: fonts.body + 8 },
  leave: {
    marginTop: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.primary,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xl,
    borderRadius: radius.pill,
  },
  pressed: { opacity: 0.8 },
  leaveText: { fontSize: fonts.button, fontWeight: '800', color: colors.textOnDark },
});
