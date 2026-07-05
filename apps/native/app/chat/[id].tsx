import { Ionicons } from '@expo/vector-icons';
import { AudioModule, RecordingPresets, setAudioModeAsync, useAudioRecorder } from 'expo-audio';
import * as ImagePicker from 'expo-image-picker';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import * as Speech from 'expo-speech';
import React, { useEffect, useRef, useState } from 'react';
import { VoicePlayer } from '../../src/components/VoicePlayer';
import {
  Alert,
  FlatList,
  Image,
  KeyboardAvoidingView,
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
  const { getContact, messagesFor, sendMessage, sendPhoto, sendVoice, markRead } = useStore();
  const [draft, setDraft] = useState('');
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const listRef = useRef<FlatList<Message>>(null);

  const contact = id ? getContact(id) : undefined;
  const messages = id ? messagesFor(id) : [];

  useEffect(() => {
    // Keep the newest message in view.
    const t = setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100);
    return () => clearTimeout(t);
  }, [messages.length]);

  useEffect(() => {
    // Opening the chat (and receiving while it's open) marks it read.
    if (id) markRead(id);
  }, [id, messages.length, markRead]);

  useEffect(() => {
    if (!recording) return;
    const timer = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => clearInterval(timer);
  }, [recording]);

  async function startRecording() {
    try {
      const perm = await AudioModule.requestRecordingPermissionsAsync();
      if (!perm.granted) {
        Alert.alert('Microphone needed', 'Please allow microphone access to record a voice message.');
        return;
      }
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await recorder.prepareToRecordAsync();
      recorder.record();
      setElapsed(0);
      setRecording(true);
    } catch {
      Alert.alert('Could not start recording');
    }
  }

  async function stopRecording(shouldSend: boolean) {
    try {
      await recorder.stop();
    } catch {
      /* ignore */
    }
    const seconds = elapsed;
    setRecording(false);
    if (shouldSend && recorder.uri && seconds >= 1) {
      sendVoice(contact!.id, recorder.uri, seconds);
    }
  }

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

  async function pickPhoto(source: 'camera' | 'library') {
    const perm =
      source === 'camera'
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Permission needed', 'Please allow access to send a photo.');
      return;
    }
    const result =
      source === 'camera'
        ? await ImagePicker.launchCameraAsync({ quality: 0.6 })
        : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.6 });
    if (!result.canceled && result.assets[0]) sendPhoto(contact!.id, result.assets[0].uri);
  }

  function attachPhoto() {
    Alert.alert('Send a photo', 'Where from?', [
      { text: 'Take a photo', onPress: () => pickPhoto('camera') },
      { text: 'Choose from library', onPress: () => pickPhoto('library') },
      { text: 'Cancel', style: 'cancel' },
    ]);
  }

  function speak(text: string) {
    Speech.stop();
    Speech.speak(text, { rate: 0.95 });
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
          headerRight: () => (
            <View style={styles.headerActions}>
              <Pressable
                accessibilityLabel={`Voice call ${contact.name}`}
                onPress={() => router.push(`/call/${contact.id}?mode=voice`)}
                hitSlop={12}
              >
                <Ionicons name="call" size={28} color={colors.textOnDark} />
              </Pressable>
              <Pressable
                accessibilityLabel={`Video call ${contact.name}`}
                onPress={() => router.push(`/call/${contact.id}`)}
                hitSlop={12}
              >
                <Ionicons name="videocam" size={30} color={colors.textOnDark} />
              </Pressable>
            </View>
          ),
        }}
      />

      <FlatList
        ref={listRef}
        data={messages}
        keyExtractor={(m) => m.id}
        contentContainerStyle={styles.listContent}
        renderItem={({ item }) => (
          <Bubble
            message={item}
            onSpeak={speak}
            senderName={
              contact.isGroup && !item.mine
                ? contact.members?.find((m) => m.id === item.authorId)?.name
                : undefined
            }
          />
        )}
        ListEmptyComponent={
          <Text style={styles.empty}>Say hello! Type a message below to start.</Text>
        }
      />

      <View style={[styles.composer, { paddingBottom: Math.max(insets.bottom, spacing.sm) }]}>
        {recording ? (
          <>
            <Pressable
              accessibilityLabel="Cancel recording"
              onPress={() => stopRecording(false)}
              style={({ pressed }) => [styles.attachBtn, pressed && styles.pressed]}
            >
              <Ionicons name="trash" size={28} color={colors.danger} />
            </Pressable>
            <View style={styles.recordingBar}>
              <View style={styles.recDot} />
              <Text style={styles.recText}>Recording… {Math.floor(elapsed / 60)}:{String(elapsed % 60).padStart(2, '0')}</Text>
            </View>
            <Pressable
              accessibilityLabel="Send voice message"
              onPress={() => stopRecording(true)}
              style={({ pressed }) => [styles.sendBtn, pressed && styles.pressed]}
            >
              <Ionicons name="send" size={30} color={colors.textOnDark} />
            </Pressable>
          </>
        ) : (
          <>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Send a photo"
              onPress={attachPhoto}
              style={({ pressed }) => [styles.attachBtn, pressed && styles.pressed]}
            >
              <Ionicons name="camera" size={30} color={colors.primary} />
            </Pressable>
            <TextInput
              style={styles.input}
              placeholder="Write a message…"
              placeholderTextColor={colors.textMuted}
              value={draft}
              onChangeText={setDraft}
              multiline
              returnKeyType="send"
            />
            {draft.trim() ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Send message"
                onPress={send}
                style={({ pressed }) => [styles.sendBtn, pressed && styles.pressed]}
              >
                <Ionicons name="send" size={30} color={colors.textOnDark} />
              </Pressable>
            ) : (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Record a voice message"
                onPress={startRecording}
                style={({ pressed }) => [styles.micBtn, pressed && styles.pressed]}
              >
                <Ionicons name="mic" size={30} color={colors.textOnDark} />
              </Pressable>
            )}
          </>
        )}
      </View>
    </KeyboardAvoidingView>
  );
}

function Bubble({
  message,
  onSpeak,
  senderName,
}: {
  message: Message;
  onSpeak: (t: string) => void;
  senderName?: string;
}) {
  const mine = message.mine;
  return (
    <View style={[styles.bubbleRow, mine ? styles.rowMine : styles.rowTheirs]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Read message aloud: ${message.text}`}
        onLongPress={() => onSpeak(message.text)}
        style={[styles.bubble, mine ? styles.bubbleMine : styles.bubbleTheirs]}
      >
        {senderName ? <Text style={styles.sender}>{senderName}</Text> : null}

        {message.kind === 'photo' && message.imageUrl ? (
          <Image source={{ uri: message.imageUrl }} style={styles.photo} resizeMode="cover" />
        ) : null}

        {message.kind === 'voice' ? (
          <VoicePlayer uri={message.audioUrl} mine={mine} duration={message.duration} />
        ) : null}

        {message.text ? (
          <Text style={[styles.bubbleText, mine ? styles.textMine : styles.textTheirs]}>
            {message.text}
          </Text>
        ) : null}

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
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg, paddingRight: spacing.xs },
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
  sender: { fontSize: fonts.small - 1, fontWeight: '800', color: colors.primary, marginBottom: 2 },
  photo: { width: 220, height: 220, borderRadius: radius.md, marginBottom: 4, backgroundColor: colors.border },
  voiceRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: 2 },
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
  micBtn: {
    width: TAP_TARGET,
    height: TAP_TARGET,
    borderRadius: radius.md,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  recordingBar: {
    flex: 1,
    minHeight: TAP_TARGET,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    borderWidth: 2,
    borderColor: colors.danger,
    backgroundColor: colors.card,
  },
  recDot: { width: 14, height: 14, borderRadius: 7, backgroundColor: colors.danger },
  recText: { fontSize: fonts.body, fontWeight: '700', color: colors.text },
  attachBtn: {
    width: TAP_TARGET,
    height: TAP_TARGET,
    borderRadius: radius.md,
    borderWidth: 2,
    borderColor: colors.border,
    backgroundColor: colors.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

