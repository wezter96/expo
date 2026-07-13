import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Dimensions, NativeScrollEvent, NativeSyntheticEvent, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from '../i18n';
import { useStore } from '../store';
import { type Colors, type Fonts, radius, spacing, TAP_TARGET, type UiStyle } from '../theme';
import { useTheme } from '../theme-context';

const KEY = 'kinly.onboarded.v1';

type Slide = { icon: keyof typeof Ionicons.glyphMap; key: string };
const SLIDES: Slide[] = [
  { icon: 'chatbubbles', key: 'welcome' },
  { icon: 'text', key: 'readable' },
  { icon: 'sparkles', key: 'assistant' },
  { icon: 'lock-closed', key: 'private' },
];

type AgeBand = 'under40' | 'mid' | 'senior';
const AGES: AgeBand[] = ['under40', 'mid', 'senior'];

/** First-run welcome flow: intro slides, then an age question that recommends
 *  the Modern or Easy look. Renders nothing once the user has finished it. */
export function Onboarding() {
  const insets = useSafeAreaInsets();
  const { colors, fonts, setUiStyle, setTextSize } = useTheme();
  const { setSimpleMode } = useStore();
  const { t } = useTranslation();
  const styles = useMemo(() => makeStyles(colors, fonts), [colors, fonts]);
  const [done, setDone] = useState<boolean | null>(null);
  const [page, setPage] = useState(0);
  const [choosing, setChoosing] = useState(false);
  const [age, setAge] = useState<AgeBand | null>(null);
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

  const recommended: UiStyle | null = age ? (age === 'senior' ? 'simple' : 'normal') : null;

  const applyStyle = (style: UiStyle) => {
    setUiStyle(style);
    setSimpleMode(style === 'simple');
    // 65+ also starts with larger text — adjustable any time in Display.
    if (style === 'simple' && age === 'senior') setTextSize('large');
    finish();
  };

  const next = () => {
    if (page >= SLIDES.length - 1) return setChoosing(true);
    const p = page + 1;
    setPage(p);
    scroller.current?.scrollTo({ x: p * width, animated: true });
  };

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    setPage(Math.round(e.nativeEvent.contentOffset.x / width));
  };

  if (choosing) {
    return (
      <View style={[styles.cover, { paddingTop: insets.top + spacing.xl, paddingBottom: insets.bottom + spacing.lg }]}>
        <View style={styles.fitWrap}>
          <Text style={styles.title}>{t('onboarding.fit.title')}</Text>
          <Text style={styles.body}>{t('onboarding.fit.body')}</Text>

          <View style={styles.ageRow}>
            {AGES.map((a) => (
              <Pressable
                key={a}
                accessibilityRole="button"
                accessibilityState={{ selected: age === a }}
                onPress={() => setAge(a)}
                style={[styles.ageChip, age === a && styles.ageChipOn]}
              >
                <Text style={[styles.ageText, age === a && styles.ageTextOn]}>{t(`onboarding.fit.${a}`)}</Text>
              </Pressable>
            ))}
          </View>

          {(['normal', 'simple'] as UiStyle[]).map((s) => (
            <Pressable
              key={s}
              accessibilityRole="button"
              accessibilityLabel={t(s === 'normal' ? 'display.styleModern' : 'display.styleEasy')}
              onPress={() => applyStyle(s)}
              style={({ pressed }) => [
                styles.styleCard,
                recommended === s && styles.styleCardRec,
                pressed && styles.dim,
              ]}
            >
              <Ionicons name={s === 'normal' ? 'sparkles-outline' : 'grid'} size={34} color={colors.primary} />
              <View style={styles.styleText}>
                <View style={styles.styleHead}>
                  <Text style={styles.styleTitle}>{t(s === 'normal' ? 'display.styleModern' : 'display.styleEasy')}</Text>
                  {recommended === s ? (
                    <Text style={styles.recBadge}>{t('onboarding.fit.recommended')}</Text>
                  ) : null}
                </View>
                <Text style={styles.styleHint}>
                  {t(s === 'normal' ? 'display.styleModernHint' : 'display.styleEasyHint')}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={26} color={colors.textMuted} />
            </Pressable>
          ))}

          <Text style={styles.fitNote}>{t('onboarding.fit.note')}</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.cover, { paddingTop: insets.top, paddingBottom: insets.bottom + spacing.lg }]}>
      <Pressable accessibilityRole="button" onPress={() => setChoosing(true)} style={styles.skip} hitSlop={10}>
        <Text style={styles.skipText}>{t('common.skip')}</Text>
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
          <View key={s.key} style={[styles.slide, { width }]}>
            <View style={styles.iconCircle}>
              <Ionicons name={s.icon} size={72} color={colors.textOnDark} />
            </View>
            <Text style={styles.title}>{t(`onboarding.${s.key}.title`)}</Text>
            <Text style={styles.body}>{t(`onboarding.${s.key}.body`)}</Text>
          </View>
        ))}
      </ScrollView>

      <View style={styles.dots}>
        {SLIDES.map((s, i) => (
          <View key={s.key} style={[styles.dot, i === page && styles.dotActive]} />
        ))}
      </View>

      <Pressable accessibilityRole="button" onPress={next} style={({ pressed }) => [styles.button, pressed && styles.dim]}>
        <Text style={styles.buttonText}>{page >= SLIDES.length - 1 ? t('common.getStarted') : t('common.next')}</Text>
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

    fitWrap: { flex: 1, paddingHorizontal: spacing.lg, gap: spacing.md },
    ageRow: { flexDirection: 'row', gap: spacing.sm, marginVertical: spacing.sm },
    ageChip: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: TAP_TARGET - 8,
      borderRadius: radius.pill,
      borderWidth: 2,
      borderColor: colors.border,
      backgroundColor: colors.card,
    },
    ageChipOn: { backgroundColor: colors.primary, borderColor: colors.primary },
    ageText: { fontSize: fonts.small + 1, fontWeight: '800', color: colors.text },
    ageTextOn: { color: colors.textOnDark },
    styleCard: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      padding: spacing.md,
      minHeight: TAP_TARGET + 24,
      borderRadius: radius.lg,
      borderWidth: 2,
      borderColor: colors.border,
      backgroundColor: colors.card,
    },
    styleCardRec: { borderColor: colors.accent },
    styleText: { flex: 1 },
    styleHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    styleTitle: { fontSize: fonts.title, fontWeight: '800', color: colors.text },
    recBadge: {
      fontSize: fonts.small - 2,
      fontWeight: '800',
      color: colors.textOnDark,
      backgroundColor: colors.accent,
      borderRadius: radius.pill,
      paddingHorizontal: spacing.sm,
      paddingVertical: 3,
      overflow: 'hidden',
    },
    styleHint: { fontSize: fonts.small, color: colors.textMuted, marginTop: 2 },
    fitNote: { fontSize: fonts.small, color: colors.textMuted, textAlign: 'center', marginTop: spacing.sm },
  });
}
