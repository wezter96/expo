import React, { useMemo } from 'react';
import { ScrollView, StyleSheet, Text } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from '../src/i18n';
import { type Colors, type Fonts, spacing } from '../src/theme';
import { useTheme } from '../src/theme-context';

/** In-app privacy policy & terms. Stores also require a hosted URL for the
 *  listing — publish this same text there before submission. */
export default function Legal() {
  const insets = useSafeAreaInsets();
  const { colors, fonts } = useTheme();
  const { t } = useTranslation();
  const styles = useMemo(() => makeStyles(colors, fonts), [colors, fonts]);

  return (
    <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + spacing.xl }]}>
      <Text style={styles.h1}>{t('legal.privacyTitle')}</Text>
      <Text style={styles.p}>{t('legal.privacyIntro')}</Text>
      <Text style={styles.h2}>{t('legal.dataTitle')}</Text>
      <Text style={styles.p}>{t('legal.dataBody')}</Text>
      <Text style={styles.h2}>{t('legal.e2eeTitle')}</Text>
      <Text style={styles.p}>{t('legal.e2eeBody')}</Text>
      <Text style={styles.h2}>{t('legal.rightsTitle')}</Text>
      <Text style={styles.p}>{t('legal.rightsBody')}</Text>

      <Text style={styles.h1}>{t('legal.termsTitle')}</Text>
      <Text style={styles.p}>{t('legal.termsBody')}</Text>

      <Text style={styles.updated}>{t('legal.updated')}</Text>
    </ScrollView>
  );
}

function makeStyles(colors: Colors, fonts: Fonts) {
  return StyleSheet.create({
    content: { padding: spacing.lg, gap: spacing.sm },
    h1: { fontSize: fonts.title, fontWeight: '800', color: colors.text, marginTop: spacing.lg },
    h2: { fontSize: fonts.body + 1, fontWeight: '800', color: colors.text, marginTop: spacing.md },
    p: { fontSize: fonts.body, color: colors.text, lineHeight: fonts.body + 10 },
    updated: { fontSize: fonts.small, color: colors.textMuted, marginTop: spacing.lg, textAlign: 'center' },
  });
}
