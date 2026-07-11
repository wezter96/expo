import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { cancelScheduled, fetchScheduled, type ScheduledMessage } from '../src/api/pocketbase';
import { Avatar } from '../src/components/Avatar';
import { useTranslation } from '../src/i18n';
import { useStore } from '../src/store';
import { type Colors, type Fonts, radius, spacing } from '../src/theme';
import { useTheme } from '../src/theme-context';

/** Messages waiting to be sent later, with the option to cancel them. */
export default function Scheduled() {
  const insets = useSafeAreaInsets();
  const { colors, fonts } = useTheme();
  const { t } = useTranslation();
  const { getContact } = useStore();
  const styles = useMemo(() => makeStyles(colors, fonts), [colors, fonts]);
  const [items, setItems] = useState<ScheduledMessage[]>([]);

  const reload = () => fetchScheduled().then(setItems);
  useEffect(() => {
    reload();
  }, []);

  const cancel = (m: ScheduledMessage) => {
    Alert.alert(t('scheduled.cancel'), m.text, [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('scheduled.cancel'),
        style: 'destructive',
        onPress: async () => {
          await cancelScheduled(m.id);
          await reload();
        },
      },
    ]);
  };

  return (
    <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + spacing.xl }]}>
      {items.length === 0 ? (
        <View style={styles.empty}>
          <Ionicons name="time-outline" size={64} color={colors.textMuted} />
          <Text style={styles.emptyTitle}>{t('scheduled.empty')}</Text>
          <Text style={styles.emptyBody}>{t('scheduled.emptyBody')}</Text>
        </View>
      ) : null}

      {items.map((m) => {
        const c = getContact(m.contactId);
        return (
          <View key={m.id} style={styles.card}>
            <Avatar name={c?.name ?? '?'} isGroup={c?.isGroup} uri={c?.avatar} size={48} />
            <View style={styles.cardText}>
              <Text style={styles.name}>{c?.name ?? ''}</Text>
              <Text style={styles.snippet} numberOfLines={2}>{m.text}</Text>
              <Text style={styles.when}>
                {new Date(m.sendAt).toLocaleString(undefined, {
                  weekday: 'short',
                  hour: '2-digit',
                  minute: '2-digit',
                  day: 'numeric',
                  month: 'short',
                })}
              </Text>
            </View>
            <Pressable accessibilityRole="button" accessibilityLabel={t('scheduled.cancel')} onPress={() => cancel(m)} hitSlop={8}>
              <Ionicons name="trash-outline" size={24} color={colors.danger} />
            </Pressable>
          </View>
        );
      })}
    </ScrollView>
  );
}

function makeStyles(colors: Colors, fonts: Fonts) {
  return StyleSheet.create({
    content: { padding: spacing.md, gap: spacing.sm },
    empty: { alignItems: 'center', justifyContent: 'center', gap: spacing.sm, paddingVertical: spacing.xl },
    emptyTitle: { fontSize: fonts.title, fontWeight: '800', color: colors.text, marginTop: spacing.sm },
    emptyBody: { fontSize: fonts.body, color: colors.textMuted, textAlign: 'center', lineHeight: fonts.body + 8 },
    card: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      padding: spacing.md,
      backgroundColor: colors.card,
      borderRadius: radius.lg,
      borderWidth: 2,
      borderColor: colors.border,
    },
    cardText: { flex: 1 },
    name: { fontSize: fonts.body, fontWeight: '800', color: colors.text },
    snippet: { fontSize: fonts.body, color: colors.textMuted, marginTop: 2 },
    when: { fontSize: fonts.small, color: colors.primary, fontWeight: '700', marginTop: 4 },
  });
}
