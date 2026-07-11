import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useMemo } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Avatar } from '../src/components/Avatar';
import { useTranslation } from '../src/i18n';
import { useStore } from '../src/store';
import { relativeTime } from '../src/time';
import { type Colors, type Fonts, radius, spacing } from '../src/theme';
import { useTheme } from '../src/theme-context';

/** A local list of messages the user starred, newest first. */
export default function Saved() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { colors, fonts } = useTheme();
  const { t } = useTranslation();
  const { savedMessages, getContact, toggleSaved } = useStore();
  const styles = useMemo(() => makeStyles(colors, fonts), [colors, fonts]);
  const items = savedMessages();

  const preview = (kind: string, text: string) =>
    kind === 'photo' ? '📷 Photo' : kind === 'voice' ? '🎤 Voice message' : text;

  if (items.length === 0) {
    return (
      <View style={styles.empty}>
        <Ionicons name="bookmark-outline" size={64} color={colors.textMuted} />
        <Text style={styles.emptyTitle}>{t('saved.empty')}</Text>
        <Text style={styles.emptyBody}>{t('saved.emptyBody')}</Text>
      </View>
    );
  }

  return (
    <FlatList
      data={items}
      keyExtractor={(m) => m.id}
      contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + spacing.xl }]}
      renderItem={({ item }) => {
        const c = getContact(item.contactId);
        return (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${c?.name ?? ''}: ${preview(item.kind, item.text)}`}
            onPress={() => router.push(`/chat/${item.contactId}`)}
            style={({ pressed }) => [styles.row, pressed && styles.pressed]}
          >
            <Avatar name={c?.name ?? '?'} isGroup={c?.isGroup} uri={c?.avatar} size={48} />
            <View style={styles.rowText}>
              <View style={styles.rowHead}>
                <Text style={styles.name} numberOfLines={1}>{c?.name ?? 'Unknown'}</Text>
                <Text style={styles.time}>{relativeTime(item.at)}</Text>
              </View>
              <Text style={styles.snippet} numberOfLines={2}>{preview(item.kind, item.text)}</Text>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('chat.unsave')}
              onPress={() => toggleSaved(item.id)}
              hitSlop={10}
            >
              <Ionicons name="bookmark" size={26} color={colors.primary} />
            </Pressable>
          </Pressable>
        );
      }}
    />
  );
}

function makeStyles(colors: Colors, fonts: Fonts) {
  return StyleSheet.create({
    content: { padding: spacing.md, gap: spacing.sm },
    empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.sm, padding: spacing.xl, backgroundColor: colors.background },
    emptyTitle: { fontSize: fonts.title, fontWeight: '800', color: colors.text, marginTop: spacing.sm },
    emptyBody: { fontSize: fonts.body, color: colors.textMuted, textAlign: 'center', lineHeight: fonts.body + 8 },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      padding: spacing.md,
      backgroundColor: colors.card,
      borderRadius: radius.lg,
      borderWidth: 2,
      borderColor: colors.border,
    },
    pressed: { opacity: 0.7 },
    rowText: { flex: 1 },
    rowHead: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.sm },
    name: { flex: 1, fontSize: fonts.body, fontWeight: '800', color: colors.text },
    time: { fontSize: fonts.small, color: colors.textMuted },
    snippet: { fontSize: fonts.body, color: colors.textMuted, marginTop: 2 },
  });
}
