import { Ionicons } from '@expo/vector-icons';
import { AudioModule, RecordingPresets, setAudioModeAsync, useAudioRecorder } from 'expo-audio';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import * as Speech from 'expo-speech';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { VideoBubble } from '../../src/components/VideoBubble';
import { VoicePlayer } from '../../src/components/VoicePlayer';
import {
  Alert,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Linking,
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
  acceptConversation,
  currentUserId,
  fetchMutes,
  isPendingRequest,
  fetchReactions,
  fetchReads,
  fetchTyping,
  markConversationRead,
  muteConversation,
  pingTyping,
  scheduleMessage,
  serverEnabled,
  unmuteConversation,
  setReaction,
  startCall,
  subscribeCollection,
  type CallMode,
  type Reaction,
  type Read,
  type Typing,
} from '../../src/api/pocketbase';
import { Avatar } from '../../src/components/Avatar';
import { clearDraft, loadDraft, saveDraft } from '../../src/drafts';
import { decryptRemoteToLocal } from '../../src/e2ee';
import { useTranslation } from '../../src/i18n';
import { useStore } from '../../src/store';
import { presenceLabel } from '../../src/time';
import { Message } from '../../src/types';

import { type Colors, type Fonts, nameColorForName, radius, spacing, TAP_TARGET } from '../../src/theme';
import { useTheme } from '../../src/theme-context';

const EMOJIS = ['❤️', '👍', '😂', '😮', '😢', '🙏'];
const URL_RE = /(https?:\/\/|www\.)\S+/i;
// Shared-location messages carry a maps link; the bubble shows an Open-map button.
const MAPS_RE = /https:\/\/maps\.google\.com\/\?q=(-?[0-9.]+),(-?[0-9.]+)/;
// A typing row older than this counts as "stopped"; we re-ping every 3s while
// the user is actively typing so it stays fresh.
const TYPING_TTL = 6000;

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Render text so "@Name" runs (for known member names) are highlighted. */
function renderWithMentions(
  text: string,
  names: string[] | undefined,
  mentionStyle: unknown
): React.ReactNode {
  if (!names?.length || !text.includes('@')) return text;
  // Longest names first so "@Mary Jane" wins over "@Mary".
  const sorted = [...names].filter(Boolean).sort((a, b) => b.length - a.length);
  const pattern = new RegExp(`(@(?:${sorted.map(escapeRegExp).join('|')}))`, 'gi');
  const parts = text.split(pattern);
  if (parts.length === 1) return text;
  return parts.map((p, i) =>
    i % 2 === 1 ? (
      <Text key={i} style={mentionStyle as never}>
        {p}
      </Text>
    ) : (
      p
    )
  );
}
import { clockTime } from '../../src/time';

export default function Chat() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const {
    getContact,
    conversations,
    messagesFor,
    sendMessage,
    editMessage,
    sendPhoto,
    sendVoice,
    sendVideo,
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
    pinnedMessageFor,
    setPinned,
    isSaved,
    toggleSaved,
    deleteChat,
    refresh,
  } = useStore();
  const [draft, setDraft] = useState('');
  const [searching, setSearching] = useState(false);
  const [query, setQuery] = useState('');
  const [forwarding, setForwarding] = useState<Message | null>(null);
  const [replyingTo, setReplyingTo] = useState<Message | null>(null);
  const [editing, setEditing] = useState<Message | null>(null);
  const [viewingPhoto, setViewingPhoto] = useState<string | null>(null);
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [reactions, setReactions] = useState<Reaction[]>([]);
  const [reads, setReads] = useState<Read[]>([]);
  const [typingUsers, setTypingUsers] = useState<Typing[]>([]);
  const [muted, setMuted] = useState(false);
  const [reactingTo, setReactingTo] = useState<string | null>(null);
  const lastPingRef = useRef(0);
  const listRef = useRef<FlatList<Message>>(null);
  const online = serverEnabled();
  const meId = currentUserId();
  const { colors, fonts, isDark } = useTheme();
  const { t } = useTranslation();
  const styles = useMemo(() => makeStyles(colors, fonts), [colors, fonts]);

  const contact = id ? getContact(id) : undefined;
  const messages = id ? messagesFor(id) : [];
  const disappearSecs = id ? disappearTimerFor(id) : 0;
  const encrypted = messages.some((m) => m.encrypted);
  const pinnedId = id ? pinnedMessageFor(id) : undefined;
  const pinnedMsg = pinnedId ? messages.find((m) => m.id === pinnedId) : undefined;

  const jumpToPinned = () => {
    const idx = pinnedMsg ? messages.findIndex((m) => m.id === pinnedMsg.id) : -1;
    if (idx >= 0) listRef.current?.scrollToIndex({ index: idx, animated: true, viewPosition: 0.3 });
  };

  // In-conversation search: when active with a query, show only matching text.
  const q = query.trim().toLowerCase();
  const visibleMessages = searching && q ? messages.filter((m) => (m.text || '').toLowerCase().includes(q)) : messages;

  // Restore a saved draft when opening the chat.
  useEffect(() => {
    if (!id) return;
    let active = true;
    loadDraft(id).then((d) => {
      if (active && d) setDraft(d);
    });
    return () => {
      active = false;
    };
  }, [id]);

  // Persist the composing draft (but not the text of a message being edited).
  useEffect(() => {
    if (!id || editing) return;
    void saveDraft(id, draft);
  }, [id, draft, editing]);

  // Whether this conversation is muted (for the menu label).
  useEffect(() => {
    if (!id || !online) return;
    let active = true;
    fetchMutes().then((m) => active && setMuted(!!m[id]));
    return () => {
      active = false;
    };
  }, [id, online]);

  // Live "X is typing…" — refresh on any typing event, and locally expire rows
  // that have gone quiet (no event fires when someone simply stops).
  useEffect(() => {
    if (!id || !online) return;
    let active = true;
    const reload = () => fetchTyping(id).then((rows) => active && setTypingUsers(rows));
    reload();
    let unsub = () => {};
    subscribeCollection('typing', reload).then((fn) => (active ? (unsub = fn) : fn()));
    const expiry = setInterval(() => {
      setTypingUsers((list) => (list.length ? list.filter((tu) => Date.now() - tu.at < TYPING_TTL) : list));
    }, 2000);
    return () => {
      active = false;
      unsub();
      clearInterval(expiry);
    };
  }, [id, online]);

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

  const onDraftChange = (text: string) => {
    setDraft(text);
    if (online && id && !editing && text.trim()) {
      const now = Date.now();
      if (now - lastPingRef.current > 3000) {
        lastPingRef.current = now;
        void pingTyping(id);
      }
    }
  };

  function send() {
    const text = draft.trim();
    if (!text) return;
    if (editing) {
      editMessage(editing.id, contact!.id, text);
      setEditing(null);
    } else {
      // In groups, "@Name" runs become mention metadata so the person is
      // notified even through a mute or quiet hours.
      const mentionIds = contact!.isGroup
        ? (contact!.members ?? [])
            .filter((m) => m.name && text.toLowerCase().includes(`@${m.name.toLowerCase()}`))
            .map((m) => m.id)
        : undefined;
      sendMessage(contact!.id, text, replyingTo?.id, mentionIds?.length ? mentionIds : undefined);
      setReplyingTo(null);
    }
    setDraft('');
    if (id) void clearDraft(id);
  }

  function startReply(m: Message) {
    setEditing(null);
    setReplyingTo(m);
  }

  function startEdit(m: Message) {
    setReplyingTo(null);
    setEditing(m);
    setDraft(m.text);
  }

  function cancelCompose() {
    setReplyingTo(null);
    setEditing(null);
    setDraft('');
  }

  // Preview text for a quoted/replied message.
  const previewOf = (m: Message | undefined): string =>
    !m ? '' : m.kind === 'photo' ? '📷 Photo' : m.kind === 'voice' ? '🎤 Voice message' : m.kind === 'video' ? '🎬 Video' : m.text;

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

  async function pickVideo() {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Permission needed', 'Please allow access to send a video.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['videos'], videoMaxDuration: 60 });
    if (!result.canceled && result.assets[0]) sendVideo(contact!.id, result.assets[0].uri);
  }

  async function shareLocation() {
    try {
      const perm = await Location.requestForegroundPermissionsAsync();
      if (!perm.granted) {
        Alert.alert(t('chat.shareLocation'), t('chat.locationDenied'));
        return;
      }
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const lat = pos.coords.latitude.toFixed(5);
      const lng = pos.coords.longitude.toFixed(5);
      sendMessage(contact!.id, `📍 ${t('chat.myLocation')}: https://maps.google.com/?q=${lat},${lng}`);
    } catch {
      Alert.alert(t('chat.shareLocation'), t('chat.locationError'));
    }
  }

  function attachPhoto() {
    Alert.alert(t('chat.attachTitle'), undefined, [
      { text: t('chat.takePhoto'), onPress: () => pickPhoto('camera') },
      { text: t('chat.choosePhoto'), onPress: () => pickPhoto('library') },
      { text: t('chat.chooseVideo'), onPress: () => void pickVideo() },
      { text: t('chat.shareLocation'), onPress: () => void shareLocation() },
      { text: t('common.cancel'), style: 'cancel' },
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

  // "Send later": long-press the send button, pick an elderly-friendly preset.
  function sendLater() {
    const text = draft.trim();
    if (!text || !online || editing) return;
    const now = new Date();
    const inOneHour = new Date(now.getTime() + 3600_000);
    const evening = new Date(now);
    evening.setHours(18, 0, 0, 0);
    if (evening <= now) evening.setDate(evening.getDate() + 1);
    const morning = new Date(now);
    morning.setDate(morning.getDate() + 1);
    morning.setHours(8, 0, 0, 0);
    const schedule = async (at: Date) => {
      const ok = await scheduleMessage(contact!.id, text, at);
      if (!ok) return;
      setDraft('');
      setReplyingTo(null);
      if (id) void clearDraft(id);
      Alert.alert(t('chat.sendLater'), t('chat.scheduledFor', { time: at.toLocaleString() }));
    };
    Alert.alert(t('chat.sendLater'), undefined, [
      { text: t('chat.inOneHour'), onPress: () => void schedule(inOneHour) },
      { text: t('chat.thisEvening'), onPress: () => void schedule(evening) },
      { text: t('chat.tomorrowMorning'), onPress: () => void schedule(morning) },
      { text: t('common.cancel'), style: 'cancel' },
    ]);
  }

  // Delivery state for a message I sent: seen (someone read past it),
  // delivered (a recipient has been online since), or just sent.
  const tickFor = (m: Message): 'sent' | 'delivered' | 'seen' => {
    if (reads.some((r) => r.userId !== meId && r.at >= m.at)) return 'seen';
    const others = contact!.isGroup ? contact!.members ?? [] : other ? [other] : [];
    if (others.some((o) => o.lastSeen && Date.parse(o.lastSeen) >= m.at)) return 'delivered';
    return 'sent';
  };

  const memberNames = contact.isGroup ? (contact.members ?? []).map((m) => m.name).filter(Boolean) : undefined;

  // Insert "@Name " into the draft (groups).
  function mentionPicker() {
    const members = contact!.members ?? [];
    if (!members.length) return;
    Alert.alert(t('chat.mention'), undefined, [
      ...members.slice(0, 8).map((m) => ({
        text: `@${m.name}`,
        onPress: () => setDraft((d) => `${d}${d && !d.endsWith(' ') ? ' ' : ''}@${m.name} `),
      })),
      { text: t('common.cancel'), style: 'cancel' as const },
    ]);
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

  const pinAction = (m: Message) => {
    const pinned = pinnedMessageFor(contact!.id) === m.id;
    return {
      text: pinned ? t('chat.unpin') : t('chat.pin'),
      onPress: () => void setPinned(contact!.id, pinned ? undefined : m.id),
    };
  };

  const saveAction = (m: Message) => ({
    text: isSaved(m.id) ? t('chat.unsave') : t('chat.save'),
    onPress: () => toggleSaved(m.id),
  });

  const doForward = (targetId: string) => {
    const m = forwarding;
    setForwarding(null);
    if (!m) return;
    sendMessage(targetId, m.text);
    if (targetId !== contact!.id) router.replace(`/chat/${targetId}`);
  };

  function mineActions(m: Message) {
    const opts: { text: string; style?: 'cancel' | 'destructive'; onPress?: () => void }[] = [];
    if (m.kind === 'text') opts.push({ text: 'Edit', onPress: () => startEdit(m) });
    opts.push({ text: 'Reply', onPress: () => startReply(m) });
    if (m.kind === 'text') opts.push({ text: t('chat.forward'), onPress: () => setForwarding(m) });
    opts.push(saveAction(m));
    if (online) opts.push(pinAction(m));
    opts.push({ text: 'Delete', style: 'destructive', onPress: () => promptDelete(m.id) });
    opts.push({ text: 'Cancel', style: 'cancel' });
    Alert.alert('Message', undefined, opts);
  }

  function theirActions(m: Message, spoken: string) {
    const opts: { text: string; style?: 'cancel'; onPress?: () => void }[] = [{ text: 'Reply', onPress: () => startReply(m) }];
    if (online) opts.push({ text: 'React', onPress: () => setReactingTo(m.id) });
    if (m.kind === 'text') opts.push({ text: t('chat.forward'), onPress: () => setForwarding(m) });
    opts.push(saveAction(m));
    if (online) opts.push(pinAction(m));
    opts.push({ text: 'Read aloud', onPress: () => speak(spoken) });
    opts.push({ text: 'Cancel', style: 'cancel' });
    Alert.alert('Message', undefined, opts);
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

  function muteMenu() {
    const pick = (hours?: number) => {
      setMuted(true);
      void muteConversation(contact!.id, hours);
    };
    Alert.alert(t('chat.mute'), undefined, [
      { text: t('chat.mute8h'), onPress: () => pick(8) },
      { text: t('chat.mute1w'), onPress: () => pick(24 * 7) },
      { text: t('chat.muteAlways'), onPress: () => pick() },
      { text: t('common.cancel'), style: 'cancel' },
    ]);
  }

  function confirmDeleteChat() {
    Alert.alert(t('chat.deleteChat'), t('chat.deleteChatConfirm', { name: contact!.name }), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('chat.deleteChat'),
        style: 'destructive',
        onPress: () => {
          deleteChat(contact!.id);
          router.back();
        },
      },
    ]);
  }

  function moreMenu() {
    const fav = isFavorite(contact!.id);
    const timer = disappearTimerFor(contact!.id);
    const opts: { text: string; style?: 'cancel' | 'destructive'; onPress?: () => void }[] = [
      { text: fav ? 'Remove from favorites' : 'Add to favorites', onPress: () => toggleFavorite(contact!.id) },
      { text: t('chat.photos'), onPress: () => router.push(`/album/${contact!.id}`) },
      ...(online
        ? [
            muted
              ? {
                  text: t('chat.unmute'),
                  onPress: () => {
                    setMuted(false);
                    void unmuteConversation(contact!.id);
                  },
                }
              : { text: t('chat.mute'), onPress: muteMenu },
            { text: t('scheduled.title'), onPress: () => router.push('/scheduled') },
          ]
        : []),
      ...(!contact!.isGroup
        ? [{ text: t('chat.deleteChat'), style: 'destructive' as const, onPress: confirmDeleteChat }]
        : []),
      {
        text: `Disappearing messages: ${disappearingLabel(timer)}`,
        onPress: disappearingMenu,
      },
    ];
    if (contact!.isGroup) {
      opts.push({ text: 'Group info & members', onPress: () => router.push(`/group/${contact!.id}`) });
    } else if (other) {
      opts.push({ text: 'Verify security number', onPress: () => router.push(`/verify?id=${contact!.id}`) });
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
  const pendingRequest = online && isPendingRequest(contact);

  // "X is typing…" — names of others typing within the freshness window.
  const typingNames = typingUsers
    .filter((tu) => Date.now() - tu.at < TYPING_TTL)
    .map((tu) => (contact.isGroup ? contact.members?.find((m) => m.id === tu.userId)?.name : contact.name))
    .filter(Boolean) as string[];
  const typingLabel = !typingNames.length
    ? ''
    : typingNames.length === 1
      ? t('chat.typingOne', { name: typingNames[0] })
      : t('chat.typingMany');

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
                accessibilityLabel={t('chat.search')}
                onPress={() => setSearching((s) => !s)}
                hitSlop={12}
              >
                <Ionicons name="search" size={24} color={colors.textOnDark} />
              </Pressable>
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

      {searching ? (
        <View style={styles.searchBar}>
          <Ionicons name="search" size={20} color={colors.textMuted} />
          <TextInput
            style={styles.searchInput}
            placeholder={t('chat.searchPlaceholder')}
            placeholderTextColor={colors.textMuted}
            value={query}
            onChangeText={setQuery}
            autoFocus
            returnKeyType="search"
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('common.done')}
            onPress={() => {
              setSearching(false);
              setQuery('');
            }}
            hitSlop={10}
          >
            <Ionicons name="close-circle" size={24} color={colors.textMuted} />
          </Pressable>
        </View>
      ) : null}
      {encrypted ? (
        <View style={styles.encNote}>
          <Ionicons name="lock-closed" size={16} color={colors.accent} />
          <Text style={styles.encNoteText}>End-to-end encrypted — only you and {contact.name} can read these</Text>
        </View>
      ) : null}
      {disappearSecs > 0 ? (
        <View style={styles.disappearNote}>
          <Ionicons name="timer-outline" size={18} color={colors.primary} />
          <Text style={styles.disappearNoteText}>Messages disappear {disappearingLabel(disappearSecs).toLowerCase()}</Text>
        </View>
      ) : null}
      {pinnedMsg ? (
        <View style={styles.pinnedBar}>
          <Ionicons name="pin" size={18} color={colors.primary} />
          <Pressable style={styles.pinnedTextWrap} accessibilityRole="button" accessibilityLabel={t('chat.pinned')} onPress={jumpToPinned}>
            <Text style={styles.pinnedLabel}>{t('chat.pinned')}</Text>
            <Text style={styles.pinnedText} numberOfLines={1}>{previewOf(pinnedMsg)}</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('chat.unpin')}
            onPress={() => void setPinned(contact.id, undefined)}
            hitSlop={10}
          >
            <Ionicons name="close" size={22} color={colors.textMuted} />
          </Pressable>
        </View>
      ) : null}

      <FlatList
        ref={listRef}
        data={visibleMessages}
        keyExtractor={(m) => m.id}
        onScrollToIndexFailed={() => {}}
        contentContainerStyle={styles.listContent}
        renderItem={({ item, index }) => {
          // Group consecutive messages from the same person: only the first of
          // a run shows the avatar + name, so the thread stays uncluttered.
          const prev = index > 0 ? visibleMessages[index - 1] : undefined;
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
              onLongPress={() => (item.mine ? mineActions(item) : theirActions(item, spoken))}
              onReply={() => startReply(item)}
              replyPreview={item.replyTo ? previewOf(messages.find((x) => x.id === item.replyTo)) : undefined}
              onReact={online ? () => setReactingTo(item.id) : undefined}
              onTapReaction={(emoji) => online && toggleReaction(item.id, emoji)}
              onRetry={() => retryMessage(item.id)}
              onViewPhoto={setViewingPhoto}
              tick={item.mine && online ? tickFor(item) : undefined}
              mentionNames={memberNames}
            />
          );
        }}
        ListEmptyComponent={
          searching && q ? (
            <Text style={styles.empty}>{t('chat.noResults')}</Text>
          ) : (
            <Text style={styles.empty}>Say hello! Type a message below to start.</Text>
          )
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

      <Modal visible={!!forwarding} transparent animationType="slide" onRequestClose={() => setForwarding(null)}>
        <Pressable style={styles.pickerBackdrop} onPress={() => setForwarding(null)}>
          <Pressable style={styles.forwardCard} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.forwardTitle}>{t('chat.forwardTo')}</Text>
            <FlatList
              data={conversations}
              keyExtractor={(c) => c.contact.id}
              style={styles.forwardList}
              renderItem={({ item }) => (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={item.contact.name}
                  onPress={() => doForward(item.contact.id)}
                  style={({ pressed }) => [styles.forwardRow, pressed && styles.pressed]}
                >
                  <Avatar name={item.contact.name} isGroup={item.contact.isGroup} uri={item.contact.avatar} size={44} />
                  <Text style={styles.forwardName} numberOfLines={1}>{item.contact.name}</Text>
                </Pressable>
              )}
            />
          </Pressable>
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

      {typingLabel ? (
        <View style={styles.typingBar}>
          <Text style={styles.typingText}>{typingLabel}</Text>
        </View>
      ) : null}

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
      ) : pendingRequest ? (
        <View style={[styles.requestBar, { paddingBottom: Math.max(insets.bottom, spacing.sm) }]}>
          <Text style={styles.requestText}>{t('requests.chatBar', { name: contact.name })}</Text>
          <View style={styles.requestBtns}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('requests.accept')}
              onPress={async () => {
                await acceptConversation(contact.id, contact.accepted ?? []);
                await refresh();
              }}
              style={({ pressed }) => [styles.requestAcceptBtn, pressed && styles.pressed]}
            >
              <Text style={styles.requestAcceptText}>{t('requests.accept')}</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('requests.block')}
              onPress={() => {
                if (other) void blockContact(other.id);
                deleteChat(contact.id);
                router.back();
              }}
              style={({ pressed }) => [styles.requestBlockBtn, pressed && styles.pressed]}
            >
              <Text style={styles.requestBlockText}>{t('requests.block')}</Text>
            </Pressable>
          </View>
        </View>
      ) : (
      <>
      {replyingTo || editing ? (
        <View style={styles.composeBar}>
          <Ionicons name={editing ? 'pencil' : 'arrow-undo'} size={18} color={colors.primary} />
          <View style={styles.composeBarText}>
            <Text style={styles.composeBarTitle}>{editing ? 'Editing message' : `Replying to ${replyingTo && !replyingTo.mine ? contact.name : 'yourself'}`}</Text>
            <Text style={styles.composeBarPreview} numberOfLines={1}>
              {previewOf(editing ?? replyingTo ?? undefined)}
            </Text>
          </View>
          <Pressable accessibilityRole="button" accessibilityLabel="Cancel" onPress={cancelCompose} hitSlop={10}>
            <Ionicons name="close-circle" size={24} color={colors.textMuted} />
          </Pressable>
        </View>
      ) : null}
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
            {contact.isGroup ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t('chat.mention')}
                onPress={mentionPicker}
                style={({ pressed }) => [styles.attachBtn, pressed && styles.pressed]}
              >
                <Ionicons name="at" size={30} color={colors.primary} />
              </Pressable>
            ) : null}
            <TextInput
              style={styles.input}
              placeholder={t('chat.writeMessage')}
              placeholderTextColor={colors.textMuted}
              value={draft}
              onChangeText={onDraftChange}
              multiline
              returnKeyType="send"
            />
            {draft.trim() ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Send message"
                accessibilityHint={online ? t('chat.sendLaterHint') : undefined}
                onPress={send}
                onLongPress={online && !editing ? sendLater : undefined}
                delayLongPress={350}
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
      </>
      )}
    </KeyboardAvoidingView>
  );
}

/** Resolve a media URL for display. For encrypted messages (mediaKey present)
 *  it downloads + decrypts the blob to a local file; otherwise passes through. */
function useDisplayUri(url: string | undefined, mediaKey: string | undefined, ext: string): string | undefined {
  const [uri, setUri] = useState<string | undefined>(mediaKey ? undefined : url);
  useEffect(() => {
    let active = true;
    if (!url) return setUri(undefined);
    if (!mediaKey) return setUri(url);
    decryptRemoteToLocal(url, mediaKey, ext)
      .then((local) => active && setUri(local))
      .catch(() => active && setUri(undefined));
    return () => {
      active = false;
    };
  }, [url, mediaKey, ext]);
  return uri;
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
  onReply,
  replyPreview,
  onReact,
  onTapReaction,
  onRetry,
  onViewPhoto,
  tick,
  mentionNames,
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
  onReply: () => void;
  replyPreview?: string;
  onReact?: () => void;
  onTapReaction: (emoji: string) => void;
  onRetry: () => void;
  onViewPhoto: (uri: string) => void;
  /** Delivery state of my own message: single, double, or highlighted double tick. */
  tick?: 'sent' | 'delivered' | 'seen';
  /** Group member names — "@Name" runs in the text get highlighted. */
  mentionNames?: string[];
}) {
  const { colors, fonts } = useTheme();
  const { t } = useTranslation();
  const styles = useMemo(() => makeStyles(colors, fonts), [colors, fonts]);
  const mine = message.mine;
  const mapMatch = message.text ? MAPS_RE.exec(message.text) : null;
  const hasLink = !mine && !mapMatch && URL_RE.test(message.text);
  // For encrypted media, download+decrypt to a local file; else pass through.
  const photoUri = useDisplayUri(message.kind === 'photo' ? message.imageUrl : undefined, message.mediaKey, 'jpg');
  const audioUri = useDisplayUri(message.kind === 'voice' ? message.audioUrl : undefined, message.mediaKey, 'm4a');
  const videoUri = useDisplayUri(message.kind === 'video' ? message.videoUrl : undefined, message.mediaKey, 'mp4');
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

        {replyPreview !== undefined ? (
          <View style={[styles.quote, mine ? styles.quoteMine : styles.quoteTheirs]}>
            <Text style={[styles.quoteText, mine ? styles.textMine : styles.textTheirs]} numberOfLines={1}>
              {replyPreview || 'Message'}
            </Text>
          </View>
        ) : null}

        {message.kind === 'photo' && photoUri ? (
          <Pressable
            accessibilityRole="imagebutton"
            accessibilityLabel="View photo"
            onPress={() => onViewPhoto(photoUri)}
          >
            <Image source={{ uri: photoUri }} style={styles.photo} resizeMode="cover" />
          </Pressable>
        ) : null}

        {message.kind === 'voice' ? (
          <VoicePlayer uri={audioUri} mine={mine} duration={message.duration} />
        ) : null}

        {message.kind === 'video' ? <VideoBubble uri={videoUri} /> : null}

        {message.text ? (
          <Text style={[styles.bubbleText, mine ? styles.textMine : styles.textTheirs]}>
            {renderWithMentions(message.text, mentionNames, [styles.mention, mine ? styles.textMine : null])}
          </Text>
        ) : null}

        {mapMatch ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('chat.openMap')}
            onPress={() => void Linking.openURL(mapMatch[0]).catch(() => {})}
            style={({ pressed }) => [styles.mapBtn, pressed && styles.pressed]}
          >
            <Ionicons name="map" size={20} color={mine ? colors.textOnDark : colors.primary} />
            <Text style={[styles.mapBtnText, mine && styles.textMine]}>{t('chat.openMap')}</Text>
          </Pressable>
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
            <Ionicons
              name={tick === 'sent' || !tick ? 'checkmark' : 'checkmark-done'}
              size={16}
              color={tick === 'seen' ? '#7FE3C0' : '#D6E5F5'}
            />
          ) : null}
          <Text style={[styles.time, mine ? styles.timeMine : styles.timeTheirs]}>
            {clockTime(message.at)}
            {message.edited ? ' · edited' : ''}
          </Text>
          <Pressable accessibilityRole="button" accessibilityLabel="Reply to this message" onPress={onReply} hitSlop={10}>
            <Ionicons name="arrow-undo" size={20} color={mine ? '#D6E5F5' : colors.primary} />
          </Pressable>
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
  pinnedBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.card,
    borderBottomWidth: 2,
    borderBottomColor: colors.border,
  },
  pinnedTextWrap: { flex: 1 },
  pinnedLabel: { fontSize: fonts.small - 2, color: colors.primary, fontWeight: '800' },
  pinnedText: { fontSize: fonts.small, color: colors.text, fontWeight: '600' },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.card,
    borderBottomWidth: 2,
    borderBottomColor: colors.border,
  },
  searchInput: { flex: 1, fontSize: fonts.body, color: colors.text, paddingVertical: 4 },
  typingBar: { paddingHorizontal: spacing.md, paddingBottom: spacing.xs },
  typingText: { fontSize: fonts.small, color: colors.textMuted, fontStyle: 'italic' },
  mention: { fontWeight: '800', textDecorationLine: 'underline' },
  requestBar: {
    padding: spacing.md,
    gap: spacing.sm,
    backgroundColor: colors.card,
    borderTopWidth: 2,
    borderTopColor: colors.border,
  },
  requestText: { fontSize: fonts.body, color: colors.text, fontWeight: '600', textAlign: 'center' },
  requestBtns: { flexDirection: 'row', gap: spacing.sm },
  requestAcceptBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: TAP_TARGET,
    borderRadius: radius.md,
    backgroundColor: colors.accent,
  },
  requestAcceptText: { fontSize: fonts.body, fontWeight: '800', color: colors.textOnDark },
  requestBlockBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: TAP_TARGET,
    borderRadius: radius.md,
    borderWidth: 2,
    borderColor: colors.danger,
  },
  requestBlockText: { fontSize: fonts.body, fontWeight: '800', color: colors.danger },
  mapBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: spacing.xs,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    borderWidth: 2,
    borderColor: 'rgba(128,128,128,0.35)',
  },
  mapBtnText: { fontSize: fonts.body, fontWeight: '800', color: colors.primary },
  encNote: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
  },
  encNoteText: { flexShrink: 1, fontSize: fonts.small - 2, color: colors.textMuted, fontWeight: '600', textAlign: 'center' },

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
  forwardCard: {
    width: '86%',
    maxHeight: '70%',
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 2,
    borderColor: colors.border,
    padding: spacing.md,
  },
  forwardTitle: { fontSize: fonts.title, fontWeight: '800', color: colors.text, marginBottom: spacing.sm, textAlign: 'center' },
  forwardList: { flexGrow: 0 },
  forwardRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.sm },
  forwardName: { flex: 1, fontSize: fonts.body, fontWeight: '700', color: colors.text },
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
  quote: { borderLeftWidth: 3, paddingLeft: spacing.sm, marginBottom: 4, paddingVertical: 2 },
  quoteMine: { borderLeftColor: '#D6E5F5' },
  quoteTheirs: { borderLeftColor: colors.primary },
  quoteText: { fontSize: fonts.small, opacity: 0.85 },
  composeBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.bubbleTheirs,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  composeBarText: { flex: 1 },
  composeBarTitle: { fontSize: fonts.small - 1, fontWeight: '800', color: colors.primary },
  composeBarPreview: { fontSize: fonts.small, color: colors.textMuted },
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

