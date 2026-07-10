import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { Alert, Linking, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Avatar } from '../../src/components/Avatar';
import { useStore } from '../../src/store';
import { Contact, Message } from '../../src/types';
import { type Colors, type Fonts, radius, spacing, TAP_TARGET, UNREAD_BADGE } from '../../src/theme';
import { useTheme } from '../../src/theme-context';
import { relativeTime } from '../../src/time';

export default function Messages() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { conversations, ready, unreadCount, emergencyId, getContact, sendMessage, isFavorite, toggleFavorite } =
    useStore();
  const { colors, fonts } = useTheme();
  const styles = useMemo(() => makeStyles(colors, fonts), [colors, fonts]);
  const [query, setQuery] = useState('');
  const q = query.trim().toLowerCase();

  // Search across people (name/relation) and message text.
  const peopleHits = q
    ? conversations.filter(
        (c) => c.contact.name.toLowerCase().includes(q) || (c.contact.relation ?? '').toLowerCase().includes(q)
      )
    : [];
  const messageHits = q
    ? conversations
        .flatMap(({ contact, messages }) =>
          messages.filter((m) => (m.text ?? '').toLowerCase().includes(q)).map((m) => ({ contact, m }))
        )
        .sort((a, b) => b.m.at - a.m.at)
        .slice(0, 40)
    : [];

  function favorite(contact: Contact) {
    const fav = isFavorite(contact.id);
    Alert.alert(
      fav ? 'Remove favorite' : 'Add favorite',
      fav ? `Remove ${contact.name} from favorites?` : `Pin ${contact.name} to the top?`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: fav ? 'Remove' : 'Add', onPress: () => toggleFavorite(contact.id) },
      ]
    );
  }

  const emergency = emergencyId ? getContact(emergencyId) : undefined;

  function call(contact: Contact) {
    if (!contact.phone) {
      Alert.alert('No phone number', `There is no phone number saved for ${contact.name}.`);
      return;
    }
    Linking.openURL(`tel:${contact.phone}`).catch(() => Alert.alert('Could not start the call'));
  }

  function sos() {
    if (!emergency) return;
    Alert.alert('Get help', `Message and call ${emergency.name} now?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Yes, get help',
        style: 'destructive',
        onPress: () => {
          sendMessage(emergency.id, '🚨 I need help. Please call me.');
          router.push(`/call/${emergency.id}?mode=voice`);
        },
      },
    ]);
  }

  return (
    <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + spacing.xl }]}>
      {emergency ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Get help from ${emergency.name}`}
          onPress={sos}
          style={({ pressed }) => [styles.sos, pressed && styles.pressed]}
        >
          <Ionicons name="alert-circle" size={30} color={colors.textOnDark} />
          <Text style={styles.sosText}>Get help — call {emergency.name}</Text>
        </Pressable>
      ) : null}

      <View style={styles.searchBar}>
        <Ionicons name="search" size={22} color={colors.textMuted} />
        <TextInput
          style={styles.searchInput}
          value={query}
          onChangeText={setQuery}
          placeholder="Search messages and people"
          placeholderTextColor={colors.textMuted}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="search"
        />
        {query ? (
          <Pressable accessibilityRole="button" accessibilityLabel="Clear search" onPress={() => setQuery('')} hitSlop={10}>
            <Ionicons name="close-circle" size={22} color={colors.textMuted} />
          </Pressable>
        ) : null}
      </View>

      {q ? (
        <SearchResults
          styles={styles}
          colors={colors}
          people={peopleHits.map((c) => c.contact)}
          messageHits={messageHits}
          onOpen={(id) => router.push(`/chat/${id}`)}
        />
      ) : !ready ? (
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
                onLongPress={() => favorite(contact)}
                style={({ pressed }) => [styles.rowMain, pressed && styles.pressed]}
              >
                <Avatar name={contact.name} isGroup={contact.isGroup} uri={contact.avatar} size={64} />
                <View style={styles.rowText}>
                  <View style={styles.nameRow}>
                    {isFavorite(contact.id) ? (
                      <Ionicons name="star" size={18} color={colors.warning} />
                    ) : null}
                    <Text style={[styles.name, unread > 0 && styles.nameUnread]} numberOfLines={1}>
                      {contact.name}
                    </Text>
                  </View>
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

function SearchResults({
  styles,
  colors,
  people,
  messageHits,
  onOpen,
}: {
  styles: ReturnType<typeof makeStyles>;
  colors: Colors;
  people: Contact[];
  messageHits: { contact: Contact; m: Message }[];
  onOpen: (id: string) => void;
}) {
  if (!people.length && !messageHits.length) {
    return <Text style={styles.muted}>No matches. Try a different word.</Text>;
  }
  return (
    <>
      {people.length ? <Text style={styles.searchHeading}>People</Text> : null}
      {people.map((c) => (
        <Pressable
          key={c.id}
          accessibilityRole="button"
          accessibilityLabel={`Open chat with ${c.name}`}
          onPress={() => onOpen(c.id)}
          style={({ pressed }) => [styles.resultRow, pressed && styles.pressed]}
        >
          <Avatar name={c.name} isGroup={c.isGroup} uri={c.avatar} size={48} />
          <Text style={styles.resultName} numberOfLines={1}>
            {c.name}
          </Text>
        </Pressable>
      ))}
      {messageHits.length ? <Text style={styles.searchHeading}>Messages</Text> : null}
      {messageHits.map(({ contact, m }, i) => (
        <Pressable
          key={`${m.id}-${i}`}
          accessibilityRole="button"
          accessibilityLabel={`Open message from ${contact.name}: ${m.text}`}
          onPress={() => onOpen(contact.id)}
          style={({ pressed }) => [styles.resultRow, pressed && styles.pressed]}
        >
          <Avatar name={contact.name} isGroup={contact.isGroup} uri={contact.avatar} size={48} />
          <View style={styles.resultText}>
            <Text style={styles.resultName} numberOfLines={1}>
              {contact.name}
            </Text>
            <Text style={styles.resultSnippet} numberOfLines={1}>
              {m.mine ? 'You: ' : ''}
              {m.text}
            </Text>
          </View>
          <Text style={styles.resultTime}>{relativeTime(m.at)}</Text>
        </Pressable>
      ))}
    </>
  );
}

function makeStyles(colors: Colors, fonts: Fonts) {
  return StyleSheet.create({
  content: { padding: spacing.md, gap: spacing.sm },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: TAP_TARGET - 8,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    borderWidth: 2,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  searchInput: { flex: 1, fontSize: fonts.body, color: colors.text, paddingVertical: spacing.sm },
  searchHeading: { fontSize: fonts.small, fontWeight: '800', color: colors.textMuted, marginTop: spacing.sm, textTransform: 'uppercase' },
  resultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 2,
    borderColor: colors.border,
  },
  resultText: { flex: 1 },
  resultName: { flex: 1, fontSize: fonts.body + 1, fontWeight: '800', color: colors.text },
  resultSnippet: { fontSize: fonts.small, color: colors.textMuted, marginTop: 2 },
  resultTime: { fontSize: fonts.small - 2, color: colors.textMuted },
  muted: { fontSize: fonts.body, color: colors.textMuted, padding: spacing.md },
  sos: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    minHeight: 64,
    backgroundColor: colors.danger,
    borderRadius: radius.lg,
    marginBottom: spacing.xs,
  },
  sosText: { color: colors.textOnDark, fontSize: fonts.button, fontWeight: '800' },
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
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
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
    backgroundColor: UNREAD_BADGE,
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
}
