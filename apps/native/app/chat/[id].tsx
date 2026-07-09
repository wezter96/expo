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
import { Avatar } from '../../src/components/Avatar';
import { useStore } from '../../src/store';
import { presenceLabel } from '../../src/time';
import { Message } from '../../src/types';

import { type Colors, type Fonts, nameColorForName, radius, spacing, TAP_TARGET } from '../../src/theme';
import { useTheme } from '../../src/theme-context';

const EMOJIS = ['❤️', '👍', '😂', '😮', '😢', '🙏'];
const URL_RE = /(https?:\/\/|www\.)\S+/i;
import { clockTime } from '../../src/time';

export default function Chat() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const {
    getContact,
    messagesFor,
    sendMessage,
    sendPhoto,
    sendVoice,
    retryMessage,
    deleteMessage,
    markRead,
    isFavorite,
    toggleFavorite,
    isBlocked,
    blockContact,
    unblockContact,
    reportContact,
    disappearTimerFor,
    setDisappearing,
  } = useStore();
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
  const { colors, fonts, isDark } = useTheme();
  const styles = useMemo(() => makeStyles(colors, fonts), [colors, fonts]);

  const contact = id ? getContact(id) : undefined;
  const messages = id ? messagesFor(id) : [];
  const disappearSecs = id ? disappearTimerFor(id) : 0;

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

  function promptDelete(messageId: string) {
    Alert.alert('Delete message', 'Remove this message for everyone?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => deleteMessage(messageId) },
    ]);
  }

  function confirmBlock(userId: string, name: string) {
    Alert.alert(
      `Block ${name}?`,
      `${name} won't be able to message or call you, and you won't be able to message them until you unblock.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Block',
          style: 'destructive',
          onPress: () => {
            void blockContact(userId);
            router.back();
          },
        },
      ]
    );
  }

  function confirmReport(userId: string, name: string) {
    Alert.alert(
      `Report ${name}?`,
      'This sends a report to the Kinly team. You can also block this person to stop hearing from them.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Report',
          style: 'destructive',
          onPress: async () => {
            const ok = await reportContact({ reportedUserId: userId, conversationId: contact!.id });
            Alert.alert(ok ? 'Thank you' : 'Could not send report', ok ? 'Your report has been sent.' : 'Please try again later.');
          },
        },
      ]
    );
  }

  const DISAPPEAR_OPTIONS: { label: string; seconds: number }[] = [
    { label: 'Off', seconds: 0 },
    { label: 'After 1 hour', seconds: 3600 },
    { label: 'After 1 day', seconds: 86400 },
    { label: 'After 1 week', seconds: 604800 },
  ];

  function disappearingLabel(seconds: number): string {
    return DISAPPEAR_OPTIONS.find((o) => o.seconds === seconds)?.label ?? 'Off';
  }

  function disappearingMenu() {
    const current = disappearTimerFor(contact!.id);
    Alert.alert(
      'Disappearing messages',
      'New messages will be deleted for everyone after the time you choose.',
      [
        ...DISAPPEAR_OPTIONS.map((o) => ({
          text: o.seconds === current ? `${o.label} ✓` : o.label,
          onPress: () => void setDisappearing(contact!.id, o.seconds),
        })),
        { text: 'Cancel', style: 'cancel' as const },
      ]
    );
  }

  function moreMenu() {
    const fav = isFavorite(contact!.id);
    const timer = disappearTimerFor(contact!.id);
    const opts: { text: string; style?: 'cancel' | 'destructive'; onPress?: () => void }[] = [
      { text: fav ? 'Remove from favorites' : 'Add to favorites', onPress: () => toggleFavorite(contact!.id) },
      {
        text: `Disappearing messages: ${disappearingLabel(timer)}`,
        onPress: disappearingMenu,
      },
    ];
    if (contact!.isGroup) {
      opts.push({ text: 'Group info & members', onPress: () => router.push(`/group/${contact!.id}`) });
    } else if (other) {
      const blocked = isBlocked(other.id);
      opts.push(
        blocked
          ? { text: `Unblock ${contact!.name}`, onPress: () => void unblockContact(other.id) }
          : { text: `Block ${contact!.name}`, style: 'destructive', onPress: () => confirmBlock(other.id, contact!.name) }
      );
      opts.push({ text: 'Report to Kinly', onPress: () => confirmReport(other.id, contact!.name) });
    }
    opts.push({ text: 'Cancel', style: 'cancel' });
    Alert.alert(contact!.name, undefined, opts);
  }

  const blocked = !!other && online && isBlocked(other.id);

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
                accessibilityRole="button"
                accessibilityLabel={`Voice call ${contact.name}`}
                onPress={() => beginCall('voice')}
                hitSlop={12}
              >
                <Ionicons name="call" size={26} color={colors.textOnDark} />
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Video call ${contact.name}`}
                onPress={() => beginCall('video')}
                hitSlop={12}
              >
                <Ionicons name="videocam" size={28} color={colors.textOnDark} />
              </Pressable>
              <Pressable accessibilityRole="button" accessibilityLabel="More options" onPress={moreMenu} hitSlop={12}>
                <Ionicons name="ellipsis-vertical" size={26} color={colors.textOnDark} />
              </Pressable>
            </View>
          ),
        }}
      />

      {disappearSecs > 0 ? (
        <View style={styles.disappearNote}>
          <Ionicons name="timer-outline" size={18} color={colors.primary} />
          <Text style={styles.disappearNoteText}>Messages disappear {disappearingLabel(disappearSecs).toLowerCase()}</Text>
        </View>
      ) : null}

      <FlatList
        ref={listRef}
        data={messages}
        keyExtractor={(m) => m.id}
        contentContainerStyle={styles.listContent}
        renderItem={({ item, index }) => {
          // Group consecutive messages from the same person: only the first of
          // a run shows the avatar + name, so the thread stays uncluttered.
          const prev = index > 0 ? messages[index - 1] : undefined;
          const groupIncoming = contact.isGroup && !item.mine;
          const firstInRun = !prev || prev.authorId !== item.authorId || prev.mine !== item.mine;
          const sender = groupIncoming ? contact.members?.find((m) => m.id === item.authorId) : undefined;
          const senderName = groupIncoming ? sender?.name ?? 'Someone' : undefined;
          // Read-aloud names the speaker in a group ("Tom says: …").
          const spoken = senderName ? `${senderName} says: ${item.text}` : item.text;
          return (
            <Bubble
              message={item}
              onSpeak={() => speak(spoken)}
              groupIncoming={groupIncoming}
              firstInRun={firstInRun}
              senderName={senderName}
              senderColor={senderName ? nameColorForName(senderName, isDark) : undefined}
              senderAvatar={sender?.avatar}
              reactions={groupReactions(reactions.filter((r) => r.messageId === item.id), meId)}
              canReact={online}
              onLongPress={() =>
                item.mine ? promptDelete(item.id) : online ? setReactingTo(item.id) : speak(spoken)
              }
              onReact={online ? () => setReactingTo(item.id) : undefined}
              onTapReaction={(emoji) => online && toggleReaction(item.id, emoji)}
              onRetry={() => retryMessage(item.id)}
              onViewPhoto={setViewingPhoto}
            />
          );
        }}
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
                accessibilityRole="button"
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
            accessibilityRole="button"
            accessibilityLabel="Close photo"
            onPress={() => setViewingPhoto(null)}
            style={[styles.photoClose, { top: insets.top + spacing.sm }]}
          >
            <Ionicons name="close" size={34} color={colors.textOnDark} />
          </Pressable>
        </Pressable>
      </Modal>

      {blocked ? (
        <View style={[styles.blockedBar, { paddingBottom: Math.max(insets.bottom, spacing.sm) }]}>
          <Text style={styles.blockedText}>You blocked {contact.name}.</Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => other && unblockContact(other.id)}
            style={({ pressed }) => [styles.unblockBtn, pressed && styles.pressed]}
          >
            <Text style={styles.unblockText}>Unblock</Text>
          </Pressable>
        </View>
      ) : (
      <View style={[styles.composer, { paddingBottom: Math.max(insets.bottom, spacing.sm) }]}>
        {recording ? (
          <>
            <Pressable
              accessibilityRole="button"
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
              accessibilityRole="button"
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
      )}
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
  groupIncoming,
  firstInRun,
  senderName,
  senderColor,
  senderAvatar,
  reactions,
  canReact,
  onLongPress,
  onReact,
  onTapReaction,
  onRetry,
  onViewPhoto,
}: {
  message: Message;
  onSpeak: () => void;
  groupIncoming?: boolean;
  firstInRun?: boolean;
  senderName?: string;
  senderColor?: string;
  senderAvatar?: string;
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
    <View
      style={[
        styles.bubbleRow,
        mine ? styles.rowMine : styles.rowTheirs,
        // tighten the gap between messages in the same run
        !firstInRun && styles.rowContinuation,
      ]}
    >
      {groupIncoming ? (
        <View style={styles.avatarCol}>
          {firstInRun ? <Avatar name={senderName ?? 'Someone'} size={38} uri={senderAvatar} /> : null}
        </View>
      ) : null}
      <View style={styles.bubbleCol}>
      {/* The bubble long-press (react / delete) is a touch shortcut only. It is
          intentionally not exposed as its own control so it doesn't nest an
          interactive element around the read-aloud / react buttons inside it —
          screen readers read the message text and use those explicit buttons. */}
      <Pressable
        accessible={false}
        onLongPress={onLongPress}
        delayLongPress={300}
        style={[styles.bubble, mine ? styles.bubbleMine : styles.bubbleTheirs]}
      >
        {groupIncoming && firstInRun && senderName ? (
          <Text style={[styles.sender, senderColor ? { color: senderColor } : null]}>{senderName}</Text>
        ) : null}

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
          ) : mine && message.status !== 'failed' ? (
            <Ionicons name="checkmark" size={16} color="#D6E5F5" />
          ) : null}
          <Text style={[styles.time, mine ? styles.timeMine : styles.timeTheirs]}>
            {clockTime(message.at)}
          </Text>
          {!mine && (
            <>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Read this message aloud"
                onPress={onSpeak}
                hitSlop={10}
              >
                <Ionicons name="volume-high" size={22} color={colors.primary} />
              </Pressable>
              {onReact ? (
                <Pressable accessibilityRole="button" accessibilityLabel="React to this message" onPress={onReact} hitSlop={10}>
                  <Ionicons name="happy-outline" size={22} color={colors.primary} />
                </Pressable>
              ) : null}
            </>
          )}
        </View>
      </Pressable>

      {mine && message.status === 'failed' ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Message not sent. Tap to try again."
          onPress={onRetry}
          style={({ pressed }) => [styles.failed, pressed && styles.pressed]}
        >
          <Ionicons name="refresh" size={20} color={colors.danger} />
          <Text style={styles.failedText}>Not sent — tap to try again</Text>
        </Pressable>
      ) : null}

      {reactions.length > 0 ? (
        <View style={[styles.reactions, mine ? styles.reactionsMine : styles.reactionsTheirs]}>
          {reactions.map((g) => (
            <Pressable
              key={g.emoji}
              accessibilityRole="button"
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
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingRight: spacing.xs },
  // Header text is a fixed, compact size and width-capped so a long name
  // truncates instead of colliding with the action icons (even at XL text).
  headerTitle: { alignItems: 'flex-start', maxWidth: 200 },
  headerName: { color: colors.textOnDark, fontSize: 22, fontWeight: '800' },
  headerPresence: { color: '#D6E5F5', fontSize: 13, fontWeight: '600' },
  seen: { alignSelf: 'flex-end', fontSize: fonts.small - 2, color: colors.textMuted, fontWeight: '700', marginTop: 2 },
  disappearNote: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.bubbleTheirs,
  },
  disappearNoteText: { fontSize: fonts.small, color: colors.primary, fontWeight: '700' },

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

  bubbleRow: { flexDirection: 'row', alignItems: 'flex-start' },
  rowMine: { justifyContent: 'flex-end' },
  rowTheirs: { justifyContent: 'flex-start' },
  rowContinuation: { marginTop: -8 },
  avatarCol: { width: 38, marginRight: spacing.xs },
  bubble: { borderRadius: radius.lg, padding: spacing.md },
  bubbleMine: { backgroundColor: colors.bubbleMine, borderBottomRightRadius: radius.sm },
  bubbleTheirs: { backgroundColor: colors.bubbleTheirs, borderBottomLeftRadius: radius.sm },
  sender: { fontSize: fonts.small - 1, fontWeight: '800', color: colors.primary, marginBottom: 2 },
  photo: { width: 220, height: 220, borderRadius: radius.md, marginBottom: 4, backgroundColor: colors.border },
  linkWarn: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 },
  linkWarnText: { flex: 1, fontSize: fonts.small - 2, color: colors.warning, fontWeight: '700' },
  failed: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-end',
    marginTop: 4,
    minHeight: 44,
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    borderRadius: radius.pill,
    borderWidth: 1.5,
    borderColor: colors.danger,
    backgroundColor: colors.card,
  },
  failedText: { fontSize: fonts.small, color: colors.danger, fontWeight: '800' },
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
  blockedBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    borderTopWidth: 2,
    borderTopColor: colors.border,
    backgroundColor: colors.card,
  },
  blockedText: { flex: 1, fontSize: fonts.body, color: colors.textMuted, fontWeight: '700' },
  unblockBtn: {
    minHeight: TAP_TARGET - 8,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.md,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  unblockText: { fontSize: fonts.button, fontWeight: '800', color: colors.textOnDark },
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

