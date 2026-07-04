import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Avatar } from '../src/components/Avatar';
import { BigButton } from '../src/components/BigButton';
import { useStore } from '../src/store';
import { colors, fonts, radius, spacing } from '../src/theme';
import { relativeTime } from '../src/time';

export default function Home() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { conversations, ready } = useStore();

  // The three or four most recent conversations, shown as big tap-to-open rows.
  const recent = conversations.filter((c) => c.messages.length > 0).slice(0, 4);

  return (
    <ScrollView
      contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + spacing.xl }]}
    >
      {/* Primary action: talk to the assistant. */}
      <BigButton
        label="Talk to Assistant"
        sublabel="Say who to call or message"
        icon="mic"
        variant="success"
        onPress={() => router.push('/assistant')}
      />

      <BigButton
        label="Messages"
        sublabel="Read and write to your people"
        icon="chatbubbles"
        variant="primary"
        onPress={() => router.push('/contacts')}
      />

      <Text style={styles.sectionTitle}>Recent</Text>

      {!ready ? (
        <Text style={styles.muted}>Loading…</Text>
      ) : recent.length === 0 ? (
        <Text style={styles.muted}>No conversations yet.</Text>
      ) : (
        recent.map(({ contact, messages }) => {
          const last = messages[messages.length - 1];
          return (
            <Pressable
              key={contact.id}
              accessibilityRole="button"
              accessibilityLabel={`Open chat with ${contact.name}`}
              onPress={() => router.push(`/chat/${contact.id}`)}
              style={({ pressed }) => [styles.recentRow, pressed && styles.pressed]}
            >
              <Avatar name={contact.name} isGroup={contact.isGroup} size={62} />
              <View style={styles.recentText}>
                <Text style={styles.recentName} numberOfLines={1}>
                  {contact.name}
                </Text>
                <Text style={styles.recentPreview} numberOfLines={1}>
                  {last.mine ? 'You: ' : ''}
                  {last.text}
                </Text>
              </View>
              <View style={styles.recentMeta}>
                <Text style={styles.recentTime}>{relativeTime(last.at)}</Text>
                <Ionicons name="chevron-forward" size={26} color={colors.textMuted} />
              </View>
            </Pressable>
          );
        })
      )}

      <View style={{ height: spacing.md }} />
      <BigButton
        label="See All People"
        icon="people"
        variant="neutral"
        onPress={() => router.push('/contacts')}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.md, gap: spacing.md },
  sectionTitle: {
    fontSize: fonts.heading,
    fontWeight: '800',
    color: colors.text,
    marginTop: spacing.sm,
    marginLeft: spacing.xs,
  },
  muted: { fontSize: fonts.body, color: colors.textMuted, padding: spacing.md },
  recentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: spacing.md,
    gap: spacing.md,
    borderWidth: 2,
    borderColor: colors.border,
  },
  pressed: { opacity: 0.75 },
  recentText: { flex: 1 },
  recentName: { fontSize: fonts.body + 2, fontWeight: '800', color: colors.text },
  recentPreview: { fontSize: fonts.small, color: colors.textMuted, marginTop: 2 },
  recentMeta: { alignItems: 'flex-end', gap: 2 },
  recentTime: { fontSize: fonts.small - 2, color: colors.textMuted },
});
