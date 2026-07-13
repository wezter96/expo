import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { type IncomingCall, respondCall, subscribeCalls } from '../api/pocketbase';
import { Avatar } from '../components/Avatar';
import { useStore } from '../store';
import { colors, fonts, radius, spacing } from '../theme';

/**
 * Watches for incoming calls and shows a full-screen ring with big Accept /
 * Decline buttons. Mounted once in the signed-in layout.
 */
export function IncomingCallOverlay() {
  const router = useRouter();
  const { getContact } = useStore();
  const [call, setCall] = useState<IncomingCall | null>(null);

  useEffect(() => {
    let unsub = () => {};
    let active = true;
    subscribeCalls((c) => active && setCall(c)).then((fn) => (active ? (unsub = fn) : fn()));
    return () => {
      active = false;
      unsub();
    };
  }, []);

  // Auto-dismiss a ring after 30 seconds.
  useEffect(() => {
    if (!call) return;
    const timer = setTimeout(() => setCall(null), Math.max(1000, 30000 - (Date.now() - call.at)));
    return () => clearTimeout(timer);
  }, [call]);

  if (!call) return null;

  const contact = getContact(call.conversationId);
  const name = contact?.name ?? 'Someone';

  const accept = () => {
    respondCall(call.id, 'accepted');
    const c = call;
    setCall(null);
    router.push(`/call/${c.conversationId}?mode=${c.mode}`);
  };
  const decline = () => {
    respondCall(call.id, 'declined');
    setCall(null);
  };

  return (
    <Modal visible transparent animationType="fade" onRequestClose={decline}>
      <View style={styles.container}>
        <View style={styles.info}>
          <Avatar name={name} size={130} isGroup={contact?.isGroup} uri={contact?.avatar} />
          <Text style={styles.name}>{name}</Text>
          <Text style={styles.sub}>Incoming {call.mode} call…</Text>
        </View>

        <View style={styles.actions}>
          <View style={styles.action}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Decline call"
              onPress={decline}
              style={({ pressed }) => [styles.circle, styles.decline, pressed && styles.pressed]}
            >
              <Ionicons name="close" size={44} color={colors.textOnDark} />
            </Pressable>
            <Text style={styles.actionLabel}>Decline</Text>
          </View>
          <View style={styles.action}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Answer call"
              onPress={accept}
              style={({ pressed }) => [styles.circle, styles.accept, pressed && styles.pressed]}
            >
              <Ionicons name={call.mode === 'video' ? 'videocam' : 'call'} size={44} color={colors.textOnDark} />
            </Pressable>
            <Text style={styles.actionLabel}>Answer</Text>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.primaryDark, alignItems: 'center', justifyContent: 'space-between', paddingVertical: 90 },
  info: { alignItems: 'center', gap: spacing.md, marginTop: spacing.xl },
  name: { fontSize: fonts.huge, fontWeight: '800', color: colors.textOnDark, textAlign: 'center' },
  sub: { fontSize: fonts.body, color: '#CFE8DA' },
  actions: { flexDirection: 'row', gap: spacing.xl * 2 },
  action: { alignItems: 'center', gap: spacing.sm },
  circle: { width: 88, height: 88, borderRadius: 44, alignItems: 'center', justifyContent: 'center' },
  accept: { backgroundColor: colors.accent },
  decline: { backgroundColor: colors.danger },
  pressed: { opacity: 0.85 },
  actionLabel: { fontSize: fonts.body, fontWeight: '700', color: colors.textOnDark },
});
