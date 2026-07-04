import { Ionicons } from '@expo/vector-icons';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import * as Speech from 'expo-speech';
import React, { useEffect, useRef, useState } from 'react';
import {
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useStore } from '../../src/store';
import { Message } from '../../src/types';
import { colors, fonts, radius, spacing, TAP_TARGET } from '../../src/theme';
import { clockTime } from '../../src/time';

export default function Chat() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { getContact, messagesFor, sendMessage } = useStore();
  const [draft, setDraft] = useState('');
  const listRef = useRef<FlatList<Message>>(null);

  const contact = id ? getContact(id) : undefined;
  const messages = id ? messagesFor(id) : [];

  useEffect(() => {
    // Keep the newest message in view.
    const t = setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100);
    return () => clearTimeout(t);
  }, [messages.length]);

  if (!contact) {
    return (
      <View style={styles.center}>
        <Text style={styles.missing}>This conversation could not be found.</Text>
      </View>
    );
  }

  function send() {
    const text = draft.trim();
    if (!text) return;
    sendMessage(contact!.id, text);
    setDraft('');
  }

  function speak(text: string) {
    Speech.stop();
    Speech.speak(text, { rate: 0.95 });
  }

  function call() {
    if (!contact!.phone) {
      Alert.alert('No phone number', `There is no phone number saved for ${contact!.name}.`);
      return;
    }
    Linking.openURL(`tel:${contact!.phone}`).catch(() => Alert.alert('Could not start call'));
  }

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={90}
    >
      <Stack.Screen
        options={{
          title: contact.name,
          headerRight: () =>
            contact.isGroup ? null : (
              <Pressable accessibilityLabel={`Call ${contact.name}`} onPress={call} hitSlop={12}>
                <Ionicons name="call" size={28} color={colors.textOnDark} />
              </Pressable>
            ),
        }}
      />

      <FlatList
        ref={listRef}
        data={messages}
        keyExtractor={(m) => m.id}
        contentContainerStyle={styles.listContent}
        renderItem={({ item }) => <Bubble message={item} onSpeak={speak} />}
        ListEmptyComponent={
          <Text style={styles.empty}>Say hello! Type a message below to start.</Text>
        }
      />

      <View style={[styles.composer, { paddingBottom: Math.max(insets.bottom, spacing.sm) }]}>
        <TextInput
          style={styles.input}
          placeholder="Write a message…"
          placeholderTextColor={colors.textMuted}
          value={draft}
          onChangeText={setDraft}
          multiline
          returnKeyType="send"
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Send message"
          onPress={send}
          disabled={!draft.trim()}
          style={({ pressed }) => [
            styles.sendBtn,
            !draft.trim() && styles.sendDisabled,
            pressed && styles.pressed,
          ]}
        >
          <Ionicons name="send" size={30} color={colors.textOnDark} />
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

function Bubble({ message, onSpeak }: { message: Message; onSpeak: (t: string) => void }) {
  const mine = message.mine;
  return (
    <View style={[styles.bubbleRow, mine ? styles.rowMine : styles.rowTheirs]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Read message aloud: ${message.text}`}
        onLongPress={() => onSpeak(message.text)}
        style={[styles.bubble, mine ? styles.bubbleMine : styles.bubbleTheirs]}
      >
        <Text style={[styles.bubbleText, mine ? styles.textMine : styles.textTheirs]}>
          {message.text}
        </Text>
        <View style={styles.bubbleFooter}>
          <Text style={[styles.time, mine ? styles.timeMine : styles.timeTheirs]}>
            {clockTime(message.at)}
          </Text>
          {!mine && (
            <Pressable
              accessibilityLabel="Read this message aloud"
              onPress={() => onSpeak(message.text)}
              hitSlop={10}
            >
              <Ionicons name="volume-high" size={20} color={colors.primary} />
            </Pressable>
          )}
        </View>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.lg },
  missing: { fontSize: fonts.body, color: colors.textMuted, textAlign: 'center' },
  listContent: { padding: spacing.md, gap: spacing.sm, flexGrow: 1 },
  empty: { fontSize: fonts.body, color: colors.textMuted, textAlign: 'center', marginTop: spacing.xl },

  bubbleRow: { flexDirection: 'row' },
  rowMine: { justifyContent: 'flex-end' },
  rowTheirs: { justifyContent: 'flex-start' },
  bubble: { maxWidth: '82%', borderRadius: radius.lg, padding: spacing.md },
  bubbleMine: { backgroundColor: colors.bubbleMine, borderBottomRightRadius: radius.sm },
  bubbleTheirs: { backgroundColor: colors.bubbleTheirs, borderBottomLeftRadius: radius.sm },
  bubbleText: { fontSize: fonts.body + 1, lineHeight: fonts.body + 9 },
  textMine: { color: colors.textOnDark },
  textTheirs: { color: colors.text },
  bubbleFooter: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: 6, justifyContent: 'flex-end' },
  time: { fontSize: fonts.small - 3 },
  timeMine: { color: '#D6E5F5' },
  timeTheirs: { color: colors.textMuted },

  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing.sm,
    padding: spacing.sm,
    borderTopWidth: 2,
    borderTopColor: colors.border,
    backgroundColor: colors.card,
  },
  input: {
    flex: 1,
    minHeight: TAP_TARGET,
    maxHeight: 140,
    borderWidth: 2,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: fonts.body,
    color: colors.text,
    backgroundColor: colors.background,
  },
  sendBtn: {
    width: TAP_TARGET,
    height: TAP_TARGET,
    borderRadius: radius.md,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendDisabled: { backgroundColor: colors.border },
  pressed: { opacity: 0.75 },
});
