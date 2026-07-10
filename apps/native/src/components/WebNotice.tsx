import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useMemo, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { type Colors, type Fonts, spacing } from '../theme';
import { useTheme } from '../theme-context';

const KEY = 'kinly.webnotice.dismissed.v1';

/**
 * Web-only banner: a browser tab can't safely hold your private key, so
 * end-to-end encryption is only available in the phone and desktop apps. We
 * steer web users to those. Dismissible.
 */
export function WebNotice() {
  const insets = useSafeAreaInsets();
  const { colors, fonts } = useTheme();
  const styles = useMemo(() => makeStyles(colors, fonts), [colors, fonts]);
  const [hidden, setHidden] = useState(true);

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    AsyncStorage.getItem(KEY)
      .then((v) => setHidden(v === '1'))
      .catch(() => setHidden(false));
  }, []);

  if (Platform.OS !== 'web' || hidden) return null;

  const dismiss = () => {
    setHidden(true);
    AsyncStorage.setItem(KEY, '1').catch(() => {});
  };

  return (
    <View style={[styles.bar, { paddingTop: insets.top + spacing.xs }]}>
      <Ionicons name="lock-open" size={20} color={colors.textOnDark} />
      <Text style={styles.text}>
        This web version is not end-to-end encrypted. For private messaging, use the Kinly app on your phone or the
        desktop app.
      </Text>
      <Pressable accessibilityRole="button" accessibilityLabel="Dismiss" onPress={dismiss} hitSlop={10}>
        <Ionicons name="close" size={22} color={colors.textOnDark} />
      </Pressable>
    </View>
  );
}

function makeStyles(colors: Colors, fonts: Fonts) {
  return StyleSheet.create({
    bar: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      paddingHorizontal: spacing.md,
      paddingBottom: spacing.xs,
      backgroundColor: colors.warning,
    },
    text: { flex: 1, fontSize: fonts.small, color: colors.textOnDark, fontWeight: '700' },
  });
}
