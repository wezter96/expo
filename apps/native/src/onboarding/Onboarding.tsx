import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Dimensions, NativeScrollEvent, NativeSyntheticEvent, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { type Colors, type Fonts, radius, spacing, TAP_TARGET } from '../theme';
import { useTheme } from '../theme-context';

const KEY = 'kinly.onboarded.v1';

type Slide = { icon: keyof typeof Ionicons.glyphMap; title: string; body: string };
const SLIDES: Slide[] = [
  { icon: 'chatbubbles', title: 'Welcome to Kinly', body: 'A simple, private way to stay close to your family and friends.' },
  { icon: 'text', title: 'Big and easy to read', body: 'Everything is large and clear. You can make the text even bigger in Settings → Display.' },
  { icon: 'sparkles', title: 'Just ask', body: 'Tap the ✨ Assistant button and say what you want — like "Call Mary" or "Tell Tom I\'ll be late".' },
  { icon: 'lock-closed', title: 'Private by default', body: 'Your messages are end-to-end encrypted. Only you and your family can read them — not even we can.' },
];

/** First-run welcome flow. Renders nothing once the user has finished it. */
export function Onboarding() {
  const insets = useSafeAreaInsets();
  const { colors, fonts } = useTheme();
  const styles = useMemo(() => makeStyles(colors, fonts), [colors, fonts]);
  const [done, setDone] = useState<boolean | null>(null);
  const [page, setPage] = useState(0);
  const scroller = useRef<ScrollView>(null);
  const width = Dimensions.get('window').width;

  useEffect(() => {
    AsyncStorage.getItem(KEY)
      .then((v) => setDone(v === '1'))
      .catch(() => setDone(false));
  }, []);

  if (done !== false) return null;

  const finish = () => {
    setDone(true);
    AsyncStorage.setItem(KEY, '1').catch(() => {});
  };

  const next = () => {
    if (page >= SLIDES.length - 1) return finish();
    const p = page + 1;
    setPage(p);
    scroller.current?.scrollTo({ x: p * width, animated: true });
  };

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    setPage(Math.round(e.nativeEvent.contentOffset.x / width));
  };

  return (
    <View style={[styles.cover, { paddingTop: insets.top, paddingBottom: insets.bottom + spacing.lg }]}>
      <Pressable accessibilityRole="button" onPress={finish} style={styles.skip} hitSlop={10}>
        <Text style={styles.skipText}>Skip</Text>
      </Pressable>

      <ScrollView
        ref={scroller}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={onScroll}
        style={styles.flex}
      >
        {SLIDES.map((s) => (
          <View key={s.title} style={[styles.slide, { width }]}>
            <View style={styles.iconCircle}>
              <Ionicons name={s.icon} size={72} color={colors.textOnDark} />
            </View>
            <Text style={styles.title}>{s.title}</Text>
            <Text style={styles.body}>{s.body}</Text>
          </View>
        ))}
      </ScrollView>

      <View style={styles.dots}>
        {SLIDES.map((s, i) => (
          <View key={s.title} style={[styles.dot, i === page && styles.dotActive]} />
        ))}
      </View>

      <Pressable accessibilityRole="button" onPress={next} style={({ pressed }) => [styles.button, pressed && styles.dim]}>
        <Text style={styles.buttonText}>{page >= SLIDES.length - 1 ? 'Get started' : 'Next'}</Text>
        <Ionicons name="arrow-forward" size={24} color={colors.textOnDark} />
      </Pressable>
    </View>
  );
}

function makeStyles(colors: Colors, fonts: Fonts) {
  return StyleSheet.create({
    cover: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: colors.background, zIndex: 2000 },
    flex: { flex: 1 },
    skip: { position: 'absolute', top: spacing.lg, right: spacing.lg, zIndex: 1, padding: spacing.sm },
    skipText: { fontSize: fonts.body, color: colors.textMuted, fontWeight: '700' },
    slide: { alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.xl, gap: spacing.lg },
    iconCircle: {
      width: 140,
      height: 140,
      borderRadius: 70,
      backgroundColor: colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
    },
    title: { fontSize: fonts.huge, fontWeight: '800', color: colors.text, textAlign: 'center' },
    body: { fontSize: fonts.body + 2, color: colors.textMuted, textAlign: 'center', lineHeight: fonts.body + 12 },
    dots: { flexDirection: 'row', justifyContent: 'center', gap: spacing.sm, marginVertical: spacing.lg },
    dot: { width: 12, height: 12, borderRadius: 6, backgroundColor: colors.border },
    dotActive: { backgroundColor: colors.primary, width: 28 },
    button: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.sm,
      minHeight: TAP_TARGET + 8,
      marginHorizontal: spacing.lg,
      borderRadius: radius.lg,
      backgroundColor: colors.accent,
    },
    buttonText: { fontSize: fonts.button, fontWeight: '800', color: colors.textOnDark },
    dim: { opacity: 0.85 },
  });
}
