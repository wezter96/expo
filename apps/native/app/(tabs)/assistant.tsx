import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import * as Speech from 'expo-speech';
import React, { useCallback, useRef, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AgentAction, AgentResult, aiConfigured, runAgent } from '../../src/ai/agent';
import { askServerAssistant, serverEnabled } from '../../src/api/pocketbase';
import { useStore } from '../../src/store';
import { colors, fonts, radius, spacing, TAP_TARGET } from '../../src/theme';

type Turn = { role: 'you' | 'assistant'; text: string };

const EXAMPLES = ['Call Mary', "Tell Tom I'll be a little late", 'Read my messages from Mary', 'Message the Family group'];

export default function Assistant() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { contacts, findContact, getContact, sendMessage, messagesFor } = useStore();

  const [input, setInput] = useState('');
  const [turns, setTurns] = useState<Turn[]>([
    { role: 'assistant', text: 'Hello! Tell me what you would like to do. For example, "Call Mary" or "Tell Tom I will be late".' },
  ]);
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<AgentResult | null>(null);
  const scrollRef = useRef<ScrollView>(null);

  const say = useCallback((text: string) => {
    Speech.stop();
    Speech.speak(text, { rate: 0.95 });
  }, []);

  const pushTurn = useCallback((turn: Turn) => {
    setTurns((t) => [...t, turn]);
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 60);
  }, []);

  const runAction = useCallback(
    (action: AgentAction) => {
      switch (action.type) {
        case 'open_chat':
          router.push(`/chat/${action.contactId}`);
          break;
        case 'send_message': {
          sendMessage(action.contactId, action.text);
          const c = getContact(action.contactId);
          const done = `Sent to ${c?.name ?? 'them'}.`;
          pushTurn({ role: 'assistant', text: done });
          say(done);
          break;
        }
        case 'call': {
          const c = getContact(action.contactId);
          if (c?.phone) {
            Linking.openURL(`tel:${c.phone}`).catch(() => Alert.alert('Could not start the call'));
          } else {
            Alert.alert('No phone number', `There is no phone number saved for ${c?.name ?? 'them'}.`);
          }
          break;
        }
        case 'read_messages': {
          const msgs = messagesFor(action.contactId).slice(-3);
          const c = getContact(action.contactId);
          if (msgs.length === 0) {
            const none = `You have no messages from ${c?.name ?? 'them'} yet.`;
            pushTurn({ role: 'assistant', text: none });
            say(none);
          } else {
            const spoken = msgs
              .map((m) => `${m.mine ? 'You said' : (c?.name ?? 'They') + ' said'}: ${m.text}`)
              .join('. ');
            pushTurn({ role: 'assistant', text: spoken });
            say(spoken);
          }
          break;
        }
      }
    },
    [router, sendMessage, getContact, messagesFor, pushTurn, say]
  );

  const submit = useCallback(
    async (raw?: string) => {
      const text = (raw ?? input).trim();
      if (!text || busy) return;
      setInput('');
      setPending(null);
      pushTurn({ role: 'you', text });
      setBusy(true);
      try {
        // Prefer the server-side assistant (keeps the AI key off the device);
        // fall back to fully on-device parsing when the server is unreachable.
        const result = (await askServerAssistant(text)) ?? (await runAgent(text, contacts, findContact));
        pushTurn({ role: 'assistant', text: result.say });
        say(result.say);
        if (result.action.type === 'none') {
          // nothing to do
        } else if (result.needsConfirm) {
          setPending(result); // wait for the big Yes / No buttons
        } else {
          runAction(result.action);
        }
      } catch {
        const err = 'Sorry, something went wrong. Please try again.';
        pushTurn({ role: 'assistant', text: err });
        say(err);
      } finally {
        setBusy(false);
      }
    },
    [input, busy, contacts, findContact, pushTurn, say, runAction]
  );

  const confirm = useCallback(() => {
    if (!pending) return;
    const action = pending.action;
    setPending(null);
    runAction(action);
  }, [pending, runAction]);

  const cancel = useCallback(() => {
    setPending(null);
    const msg = 'Okay, cancelled. What else can I do?';
    pushTurn({ role: 'assistant', text: msg });
    say(msg);
  }, [pushTurn, say]);

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={90}
    >
      <ScrollView ref={scrollRef} contentContainerStyle={styles.listContent}>
        {turns.map((t, i) => (
          <View
            key={i}
            style={[styles.turnRow, t.role === 'you' ? styles.rowYou : styles.rowAssistant]}
          >
            {t.role === 'assistant' && (
              <View style={styles.botIcon}>
                <Ionicons name="sparkles" size={20} color={colors.textOnDark} />
              </View>
            )}
            <View style={[styles.turn, t.role === 'you' ? styles.turnYou : styles.turnAssistant]}>
              <Text style={[styles.turnText, t.role === 'you' ? styles.textYou : styles.textAssistant]}>
                {t.text}
              </Text>
            </View>
          </View>
        ))}

        {/* Big confirm buttons when an action needs a yes/no. */}
        {pending && (
          <View style={styles.confirmRow}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Yes, do it"
              onPress={confirm}
              style={({ pressed }) => [styles.confirmBtn, styles.yes, pressed && styles.pressed]}
            >
              <Ionicons
                name={pending.action.type === 'call' ? 'call' : 'checkmark'}
                size={30}
                color={colors.textOnDark}
              />
              <Text style={styles.confirmText}>
                {pending.action.type === 'call' ? 'Yes, call' : 'Yes, send'}
              </Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="No, cancel"
              onPress={cancel}
              style={({ pressed }) => [styles.confirmBtn, styles.no, pressed && styles.pressed]}
            >
              <Ionicons name="close" size={30} color={colors.textOnDark} />
              <Text style={styles.confirmText}>No</Text>
            </Pressable>
          </View>
        )}

        {/* Example prompts to teach the interaction. */}
        {turns.length <= 2 && !pending && (
          <View style={styles.examples}>
            <Text style={styles.examplesLabel}>Try saying:</Text>
            {EXAMPLES.map((ex) => (
              <Pressable
                key={ex}
                accessibilityRole="button"
                onPress={() => submit(ex)}
                style={({ pressed }) => [styles.exampleChip, pressed && styles.pressed]}
              >
                <Ionicons name="chatbox-ellipses-outline" size={22} color={colors.primary} />
                <Text style={styles.exampleText}>{ex}</Text>
              </Pressable>
            ))}
            {serverEnabled() ? (
              <Text style={styles.hint}>Connected to your Kinly server.</Text>
            ) : !aiConfigured() ? (
              <Text style={styles.hint}>
                Tip: run the Kinly server (or add an AI key) to understand more free-form requests.
                Works without either, too.
              </Text>
            ) : null}
          </View>
        )}
      </ScrollView>

      <View style={[styles.composer, { paddingBottom: Math.max(insets.bottom, spacing.sm) }]}>
        <TextInput
          style={styles.input}
          placeholder="Type what you want to do…"
          placeholderTextColor={colors.textMuted}
          value={input}
          onChangeText={setInput}
          multiline
          editable={!busy}
          onSubmitEditing={() => submit()}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Send to assistant"
          onPress={() => submit()}
          disabled={busy || !input.trim()}
          style={({ pressed }) => [
            styles.sendBtn,
            (busy || !input.trim()) && styles.sendDisabled,
            pressed && styles.pressed,
          ]}
        >
          <Ionicons name="arrow-up" size={30} color={colors.textOnDark} />
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.background },
  listContent: { padding: spacing.md, gap: spacing.sm },

  turnRow: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.xs },
  rowYou: { justifyContent: 'flex-end' },
  rowAssistant: { justifyContent: 'flex-start' },
  botIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  turn: { maxWidth: '80%', borderRadius: radius.lg, padding: spacing.md },
  turnYou: { backgroundColor: colors.primary, borderBottomRightRadius: radius.sm },
  turnAssistant: { backgroundColor: colors.card, borderWidth: 2, borderColor: colors.border, borderBottomLeftRadius: radius.sm },
  turnText: { fontSize: fonts.body + 1, lineHeight: fonts.body + 10 },
  textYou: { color: colors.textOnDark },
  textAssistant: { color: colors.text },

  confirmRow: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.sm },
  confirmBtn: {
    flex: 1,
    minHeight: TAP_TARGET + 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    borderRadius: radius.lg,
  },
  yes: { backgroundColor: colors.accent },
  no: { backgroundColor: colors.danger },
  confirmText: { color: colors.textOnDark, fontSize: fonts.button, fontWeight: '800' },

  examples: { marginTop: spacing.md, gap: spacing.sm },
  examplesLabel: { fontSize: fonts.body, fontWeight: '700', color: colors.textMuted, marginLeft: spacing.xs },
  exampleChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.card,
    borderWidth: 2,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  exampleText: { fontSize: fonts.body, color: colors.text, fontWeight: '600' },
  hint: { fontSize: fonts.small, color: colors.textMuted, marginTop: spacing.sm, marginHorizontal: spacing.xs },

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
  pressed: { opacity: 0.7 },
});
