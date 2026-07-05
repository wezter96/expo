import { Ionicons } from '@expo/vector-icons';
import { AudioModule, RecordingPresets, setAudioModeAsync, useAudioRecorder } from 'expo-audio';
import * as ImagePicker from 'expo-image-picker';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import * as Speech from 'expo-speech';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { VoicePlayer } from '../../src/components/VoicePlayer';
import {
  Alert,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  currentUserId,
  fetchReactions,
  fetchReads,
  markConversationRead,
  serverEnabled,
  setReaction,
  startCall,
  subscribeCollection,
  type CallMode,
  type Reaction,
  type Read,
} from '../../src/api/pocketbase';
import { useStore } from '../../src/store';
import { presenceLabel } from '../../src/time';
import { Message } from '../../src/types';

import { type Colors, type Fonts, radius, spacing, TAP_TARGET } from '../../src/theme';
import { useTheme } from '../../src/theme-context';

const EMOJIS = ['❤️', '👍', '😂', '😮', '😢', '🙏'];
const URL_RE = /(https?:\/\/|www\.)\S+/i;
import { clockTime } from '../../src/time';

export default function Chat() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { getContact, messagesFor, sendMessage, sendPhoto, sendVoice, retryMessage, markRead, isFavorite, toggleFavorite } =
    useStore();
  const [draft, setDraft] = useState('');
  const [viewingPhoto, setViewingPhoto] = useState<string | null>(null);
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [reactions, setReactions] = useState<Reaction[]>([]);
  const [reads, setReads] = useState<Read[]>([]);
  const [reactingTo, setReactingTo] = useState<string | null>(null);
  const listRef = useRef<FlatList<Message>>(null);
  const online = serverEnabled();
  const meId = currentUserId();
  const { colors, fonts } = useTheme();
  const styles = useMemo(() => makeStyles(colors, fonts), [colors, fonts]);

  const contact = id ? getContact(id) : undefined;
  const messages = id ? messagesFor(id) : [];

  // Reactions + read receipts (server-backed), refreshed on any change.
  useEffect(() => {
    if (!id || !online) return;
    let active = true;
    const reloadReactions = () => fetchReactions(id).then((r) => active && setReactions(r));
    const reloadReads = () => fetchReads(id).then((r) => active && setReads(r));
    reloadReactions();
    reloadReads();
    let unsubR = () => {};
    let unsubReads = () => {};
    subscribeCollection('reactions', reloadReactions).then((fn) => (active ? (unsubR = fn) : fn()));
    subscribeCollection('reads', reloadReads).then((fn) => (active ? (unsubReads = fn) : fn()));
    return () => {
      active = false;
      unsubR();
      unsubReads();
    };
  }, [id, online]);

  // Record a server-side read receipt when the chat is open / new messages arrive.
  useEffect(() => {
    if (id && online) markConversationRead(id);
  }, [id, online, messages.length]);

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

  function beginCall(mode: CallMode) {
    void startCall(contact!.id, mode); // rings the other members (no-op offline)
    router.push(`/call/${contact!.id}?mode=${mode}`);
  }

  function toggleReaction(messageId: string, emoji: string) {
    const mine = reactions.find((r) => r.messageId === messageId && r.userId === meId);
    setReaction(messageId, emoji, mine);
    setReactingTo(null);
  }

  // Presence subtitle for the header.
  const other = !contact.isGroup ? contact.members?.[0] : undefined;
  const presence = contact.isGroup
    ? `${(contact.members?.length ?? 0) + 1} people`
    : presenceLabel(other?.lastSeen);

  // "Seen" on the last message I sent.
  const lastMine = [...messages].reverse().find((m) => m.mine);
  let seenLabel = '';
  if (lastMine && online) {
    if (contact.isGroup) {
      const n = reads.filter((r) => r.userId !== meId && r.at >= lastMine.at).length;
      if (n > 0) seenLabel = `Seen by ${n}`;
    } else if (other) {
      const rd = reads.find((r) => r.userId === other.id);
      if (rd && rd.at >= lastMine.at) seenLabel = 'Seen';
    }
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
          headerTitle: () => (
            <View style={styles.headerTitle}>
              <Text style={styles.headerName} numberOfLines={1}>
                {contact.name}
              </Text>
              {presence ? <Text style={styles.headerPresence}>{presence}</Text> : null}
            </View>
          ),
          headerRight: () => (
            <View style={styles.headerActions}>
              <Pressable
                accessibilityLabel={`Voice call ${contact.name}`}
                onPress={() => beginCall('voice')}
                hitSlop={12}
              >
                <Ionicons name="call" size={28} color={colors.textOnDark} />
              </Pressable>
              <Pressable
                accessibilityLabel={`Video call ${contact.name}`}
                onPress={() => beginCall('video')}
                hitSlop={12}
              >
                <Ionicons name="videocam" size={30} color={colors.textOnDark} />
              </Pressable>
              <Pressable
                accessibilityLabel={isFavorite(contact.id) ? 'Remove favorite' : 'Add to favorites'}
                onPress={() => toggleFavorite(contact.id)}
                hitSlop={12}
              >
                <Ionicons
                  name={isFavorite(contact.id) ? 'star' : 'star-outline'}
                  size={26}
                  color={isFavorite(contact.id) ? colors.warning : colors.textOnDark}
                />
              </Pressable>
              {contact.isGroup ? (
                <Pressable
                  accessibilityLabel="Group settings"
                  onPress={() => router.push(`/group/${contact.id}`)}
                  hitSlop={12}
                >
                  <Ionicons name="people" size={28} color={colors.textOnDark} />
                </Pressable>
              ) : null}
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
            reactions={groupReactions(reactions.filter((r) => r.messageId === item.id), meId)}
            canReact={online}
            onLongPress={() => (online ? setReactingTo(item.id) : speak(item.text))}
            onReact={online ? () => setReactingTo(item.id) : undefined}
            onTapReaction={(emoji) => online && toggleReaction(item.id, emoji)}
            onRetry={() => retryMessage(item.id)}
            onViewPhoto={setViewingPhoto}
          />
        )}
        ListEmptyComponent={
          <Text style={styles.empty}>Say hello! Type a message below to start.</Text>
        }
        ListFooterComponent={seenLabel ? <Text style={styles.seen}>{seenLabel}</Text> : null}
      />

      <Modal visible={!!reactingTo} transparent animationType="fade" onRequestClose={() => setReactingTo(null)}>
        <Pressable style={styles.pickerBackdrop} onPress={() => setReactingTo(null)}>
          <View style={styles.pickerCard}>
            {EMOJIS.map((e) => (
              <Pressable
                key={e}
                accessibilityLabel={`React ${e}`}
                onPress={() => reactingTo && toggleReaction(reactingTo, e)}
                style={({ pressed }) => [styles.pickerEmojiWrap, pressed && styles.pressed]}
              >
                <Text style={styles.pickerEmoji}>{e}</Text>
              </Pressable>
            ))}
          </View>
        </Pressable>
      </Modal>

      <Modal visible={!!viewingPhoto} transparent animationType="fade" onRequestClose={() => setViewingPhoto(null)}>
        <Pressable style={styles.photoViewer} onPress={() => setViewingPhoto(null)}>
          {viewingPhoto ? <Image source={{ uri: viewingPhoto }} style={styles.photoFull} resizeMode="contain" /> : null}
          <Pressable
            accessibilityLabel="Close photo"
            onPress={() => setViewingPhoto(null)}
            style={[styles.photoClose, { top: insets.top + spacing.sm }]}
          >
            <Ionicons name="close" size={34} color={colors.textOnDark} />
          </Pressable>
        </Pressable>
      </Modal>

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

type GroupedReaction = { emoji: string; count: number; mine: boolean };

function groupReactions(list: Reaction[], meId: string | null): GroupedReaction[] {
  const map = new Map<string, GroupedReaction>();
  for (const r of list) {
    const g = map.get(r.emoji) ?? { emoji: r.emoji, count: 0, mine: false };
    g.count += 1;
    if (r.userId === meId) g.mine = true;
    map.set(r.emoji, g);
  }
  return Array.from(map.values());
}

function Bubble({
  message,
  onSpeak,
  senderName,
  reactions,
  canReact,
  onLongPress,
  onReact,
  onTapReaction,
  onRetry,
  onViewPhoto,
}: {
  message: Message;
  onSpeak: (t: string) => void;
  senderName?: string;
  reactions: GroupedReaction[];
  canReact: boolean;
  onLongPress: () => void;
  onReact?: () => void;
  onTapReaction: (emoji: string) => void;
  onRetry: () => void;
  onViewPhoto: (uri: string) => void;
}) {
  const { colors, fonts } = useTheme();
  const styles = useMemo(() => makeStyles(colors, fonts), [colors, fonts]);
  const mine = message.mine;
  const hasLink = !mine && URL_RE.test(message.text);
  return (
    <View style={[styles.bubbleRow, mine ? styles.rowMine : styles.rowTheirs]}>
      <View style={styles.bubbleCol}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={canReact ? 'Hold to react' : `Read message aloud: ${message.text}`}
        onLongPress={onLongPress}
        delayLongPress={300}
        style={[styles.bubble, mine ? styles.bubbleMine : styles.bubbleTheirs]}
      >
        {senderName ? <Text style={styles.sender}>{senderName}</Text> : null}

        {message.kind === 'photo' && message.imageUrl ? (
          <Pressable
            accessibilityRole="imagebutton"
            accessibilityLabel="View photo"
            onPress={() => message.imageUrl && onViewPhoto(message.imageUrl)}
          >
            <Image source={{ uri: message.imageUrl }} style={styles.photo} resizeMode="cover" />
          </Pressable>
        ) : null}

        {message.kind === 'voice' ? (
          <VoicePlayer uri={message.audioUrl} mine={mine} duration={message.duration} />
        ) : null}

        {message.text ? (
          <Text style={[styles.bubbleText, mine ? styles.textMine : styles.textTheirs]}>
            {message.text}
          </Text>
        ) : null}

        {hasLink ? (
          <View style={styles.linkWarn}>
            <Ionicons name="warning" size={16} color={colors.warning} />
            <Text style={styles.linkWarnText}>Contains a link — only open links from people you trust.</Text>
          </View>
        ) : null}

        <View style={styles.bubbleFooter}>
          {mine && message.status === 'sending' ? (
            <Ionicons name="time-outline" size={16} color="#D6E5F5" />
          ) : null}
          <Text style={[styles.time, mine ? styles.timeMine : styles.timeTheirs]}>
            {clockTime(message.at)}
          </Text>
          {!mine && (
            <>
              <Pressable
                accessibilityLabel="Read this message aloud"
                onPress={() => onSpeak(message.text)}
                hitSlop={10}
              >
                <Ionicons name="volume-high" size={22} color={colors.primary} />
              </Pressable>
              {onReact ? (
                <Pressable accessibilityLabel="React to this message" onPress={onReact} hitSlop={10}>
                  <Ionicons name="happy-outline" size={22} color={colors.primary} />
                </Pressable>
              ) : null}
            </>
          )}
        </View>
      </Pressable>

      {mine && message.status === 'failed' ? (
        <Pressable accessibilityLabel="Message not sent. Tap to try again." onPress={onRetry} style={styles.failed}>
          <Ionicons name="alert-circle" size={16} color={colors.danger} />
          <Text style={styles.failedText}>Not sent — tap to try again</Text>
        </Pressable>
      ) : null}

      {reactions.length > 0 ? (
        <View style={[styles.reactions, mine ? styles.reactionsMine : styles.reactionsTheirs]}>
          {reactions.map((g) => (
            <Pressable
              key={g.emoji}
              accessibilityLabel={`${g.emoji} ${g.count}`}
              onPress={() => onTapReaction(g.emoji)}
              style={[styles.chip, g.mine && styles.chipMine]}
            >
              <Text style={styles.chipText}>
                {g.emoji}
                {g.count > 1 ? ` ${g.count}` : ''}
              </Text>
            </Pressable>
          ))}
        </View>
      ) : null}
      </View>
    </View>
  );
}

function makeStyles(colors: Colors, fonts: Fonts) {
  return StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.background },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg, paddingRight: spacing.xs },
  headerTitle: { alignItems: 'flex-start' },
  headerName: { color: colors.textOnDark, fontSize: fonts.heading, fontWeight: '800' },
  headerPresence: { color: '#D6E5F5', fontSize: fonts.small - 2, fontWeight: '600' },
  seen: { alignSelf: 'flex-end', fontSize: fonts.small - 2, color: colors.textMuted, fontWeight: '700', marginTop: 2 },

  bubbleCol: { maxWidth: '82%' },
  reactions: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: -6 },
  reactionsMine: { justifyContent: 'flex-end' },
  reactionsTheirs: { justifyContent: 'flex-start' },
  chip: {
    backgroundColor: colors.card,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
  },
  chipMine: { borderColor: colors.primary, backgroundColor: '#E6EEF7' },
  chipText: { fontSize: fonts.small },

  pickerBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.25)', alignItems: 'center', justifyContent: 'center' },
  pickerCard: {
    flexDirection: 'row',
    gap: spacing.xs,
    backgroundColor: colors.card,
    borderRadius: radius.pill,
    padding: spacing.sm,
    borderWidth: 2,
    borderColor: colors.border,
  },
  pickerEmojiWrap: { paddingHorizontal: spacing.sm, paddingVertical: spacing.xs },
  pickerEmoji: { fontSize: 34 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.lg },
  missing: { fontSize: fonts.body, color: colors.textMuted, textAlign: 'center' },
  listContent: { padding: spacing.md, gap: spacing.sm, flexGrow: 1 },
  empty: { fontSize: fonts.body, color: colors.textMuted, textAlign: 'center', marginTop: spacing.xl },

  bubbleRow: { flexDirection: 'row' },
  rowMine: { justifyContent: 'flex-end' },
  rowTheirs: { justifyContent: 'flex-start' },
  bubble: { borderRadius: radius.lg, padding: spacing.md },
  bubbleMine: { backgroundColor: colors.bubbleMine, borderBottomRightRadius: radius.sm },
  bubbleTheirs: { backgroundColor: colors.bubbleTheirs, borderBottomLeftRadius: radius.sm },
  sender: { fontSize: fonts.small - 1, fontWeight: '800', color: colors.primary, marginBottom: 2 },
  photo: { width: 220, height: 220, borderRadius: radius.md, marginBottom: 4, backgroundColor: colors.border },
  linkWarn: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 },
  linkWarnText: { flex: 1, fontSize: fonts.small - 2, color: colors.warning, fontWeight: '700' },
  failed: { flexDirection: 'row', alignItems: 'center', gap: 5, alignSelf: 'flex-end', marginTop: 3 },
  failedText: { fontSize: fonts.small - 2, color: colors.danger, fontWeight: '700' },
  photoViewer: { flex: 1, backgroundColor: 'rgba(0,0,0,0.92)', alignItems: 'center', justifyContent: 'center' },
  photoFull: { width: '100%', height: '80%' },
  photoClose: { position: 'absolute', right: spacing.md },
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
}

