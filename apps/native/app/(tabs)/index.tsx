import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React from 'react';
import { Alert, Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Avatar } from '../../src/components/Avatar';
import { useStore } from '../../src/store';
import { Contact } from '../../src/types';
import { colors, fonts, radius, spacing, TAP_TARGET } from '../../src/theme';
import { relativeTime } from '../../src/time';

export default function Messages() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { conversations, ready, unreadCount } = useStore();

  function call(contact: Contact) {
    if (!contact.phone) {
      Alert.alert('No phone number', `There is no phone number saved for ${contact.name}.`);
      return;
    }
    Linking.openURL(`tel:${contact.phone}`).catch(() => Alert.alert('Could not start the call'));
  }

  return (
    <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + spacing.xl }]}>
      {!ready ? (
        <Text style={styles.muted}>Loading…</Text>
      ) : conversations.length === 0 ? (
        <View style={styles.emptyWrap}>
          <Ionicons name="chatbubbles-outline" size={72} color={colors.border} />
          <Text style={styles.emptyTitle}>No chats yet</Text>
          <Text style={styles.emptyBody}>Add a family member or friend by their phone number to start talking.</Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push('/new-chat')}
            style={({ pressed }) => [styles.emptyBtn, styles.emptyPrimary, pressed && styles.dim]}
          >
            <Ionicons name="person-add" size={26} color={colors.textOnDark} />
            <Text style={styles.emptyBtnText}>Add a person</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push('/new-group')}
            style={({ pressed }) => [styles.emptyBtn, styles.emptySecondary, pressed && styles.dim]}
          >
            <Ionicons name="people" size={26} color={colors.textOnDark} />
            <Text style={styles.emptyBtnText}>New group</Text>
          </Pressable>
        </View>
      ) : (
        conversations.map(({ contact, messages }) => {
          const last = messages.length ? messages[messages.length - 1] : undefined;
          const unread = unreadCount(contact.id);
          const preview = last
            ? last.kind === 'photo'
              ? '📷 Photo'
              : last.kind === 'voice'
                ? '🎤 Voice message'
                : last.text
            : '';
          return (
            <View key={contact.id} style={styles.row}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Open chat with ${contact.name}${unread ? `, ${unread} unread` : ''}`}
                onPress={() => router.push(`/chat/${contact.id}`)}
                style={({ pressed }) => [styles.rowMain, pressed && styles.pressed]}
              >
                <Avatar name={contact.name} isGroup={contact.isGroup} uri={contact.avatar} size={64} />
                <View style={styles.rowText}>
                  <Text style={[styles.name, unread > 0 && styles.nameUnread]} numberOfLines={1}>
                    {contact.name}
                  </Text>
                  <View style={styles.subLine}>
                    {last ? (
                      <Text style={[styles.preview, unread > 0 && styles.previewUnread]} numberOfLines={1}>
                        {last.mine ? 'You: ' : ''}
                        {preview}
                      </Text>
                    ) : (
                      <Text style={styles.relation} numberOfLines={1}>
                        {contact.relation}
                      </Text>
                    )}
                    {last ? <Text style={styles.time}>{relativeTime(last.at)}</Text> : null}
                  </View>
                </View>
                {unread > 0 ? (
                  <View style={styles.badge}>
                    <Text style={styles.badgeText}>{unread > 99 ? '99+' : unread}</Text>
                  </View>
                ) : null}
              </Pressable>

              {!contact.isGroup && (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Call ${contact.name}`}
                  onPress={() => call(contact)}
                  style={({ pressed }) => [styles.callBtn, pressed && styles.pressed]}
                >
                  <Ionicons name="call" size={26} color={colors.textOnDark} />
                </Pressable>
              )}
            </View>
          );
        })
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.md, gap: spacing.sm },
  muted: { fontSize: fonts.body, color: colors.textMuted, padding: spacing.md },
  emptyWrap: { alignItems: 'center', gap: spacing.md, paddingTop: spacing.xl, paddingHorizontal: spacing.md },
  emptyTitle: { fontSize: fonts.title, fontWeight: '800', color: colors.text },
  emptyBody: { fontSize: fonts.body, color: colors.textMuted, textAlign: 'center', lineHeight: fonts.body + 8 },
  emptyBtn: {
    alignSelf: 'stretch',
    minHeight: TAP_TARGET + 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    borderRadius: radius.lg,
  },
  emptyPrimary: { backgroundColor: colors.accent },
  emptySecondary: { backgroundColor: colors.primary },
  emptyBtnText: { fontSize: fonts.button, fontWeight: '800', color: colors.textOnDark },
  dim: { opacity: 0.8 },
  row: {
    flexDirection: 'row',
    alignItems: 'stretch',
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 2,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  rowMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.md },
  pressed: { opacity: 0.7 },
  rowText: { flex: 1 },
  name: { fontSize: fonts.body + 3, fontWeight: '800', color: colors.text },
  nameUnread: { color: colors.text },
  subLine: { flexDirection: 'row', alignItems: 'center', marginTop: 2, gap: spacing.sm },
  preview: { flex: 1, fontSize: fonts.small, color: colors.textMuted },
  previewUnread: { color: colors.text, fontWeight: '700' },
  badge: {
    minWidth: 28,
    height: 28,
    borderRadius: 14,
    paddingHorizontal: 6,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: { color: colors.textOnDark, fontSize: fonts.small - 2, fontWeight: '800' },
  relation: { flex: 1, fontSize: fonts.small, color: colors.textMuted },
  time: { fontSize: fonts.small - 2, color: colors.textMuted },
  callBtn: {
    width: TAP_TARGET,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
