import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useLocalSearchParams } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { safetyNumberWith } from '../src/e2ee';
import { useStore } from '../src/store';
import { type Colors, type Fonts, radius, spacing, TAP_TARGET } from '../src/theme';
import { useTheme } from '../src/theme-context';

const verifyKey = (peerId: string) => `kinly.verified.${peerId}`;

export default function Verify() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const { colors, fonts } = useTheme();
  const styles = useMemo(() => makeStyles(colors, fonts), [colors, fonts]);
  const { getContact } = useStore();

  const contact = id ? getContact(id) : undefined;
  const peer = contact && !contact.isGroup ? contact.members?.[0] : undefined;
  const [number, setNumber] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [verified, setVerified] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      if (peer?.identityKey) {
        const n = await safetyNumberWith(peer.identityKey);
        const v = await AsyncStorage.getItem(verifyKey(peer.id));
        if (active) {
          setNumber(n);
          setVerified(v === '1');
        }
      }
      if (active) setLoading(false);
    })();
    return () => {
      active = false;
    };
  }, [peer?.identityKey, peer?.id]);

  const toggle = () => {
    if (!peer) return;
    const next = !verified;
    setVerified(next);
    AsyncStorage.setItem(verifyKey(peer.id), next ? '1' : '0').catch(() => {});
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (!peer?.identityKey || !number) {
    return (
      <View style={styles.center}>
        <Ionicons name="shield-outline" size={56} color={colors.textMuted} />
        <Text style={styles.h1}>Not available yet</Text>
        <Text style={styles.body}>
          {contact?.isGroup
            ? 'Safety numbers are for one-to-one chats.'
            : `${contact?.name ?? 'This person'} hasn't set up encryption yet, or you're on the web version.`}
        </Text>
      </View>
    );
  }

  const rows = (number.match(/(\d{5} ){2}\d{5}/g) as string[]) ?? [number];

  return (
    <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + spacing.xl }]}>
      <View style={styles.hero}>
        <Ionicons name="shield-checkmark" size={44} color={verified ? colors.accent : colors.primary} />
        <Text style={styles.h1}>Verify {contact?.name}</Text>
        <Text style={styles.body}>
          If these numbers are the same on both of your devices, no one is listening in. Compare them together — in
          person or on a call you trust.
        </Text>
      </View>

      <View style={styles.numberBox}>
        {rows.map((r, i) => (
          <Text key={i} style={styles.numberRow}>
            {r}
          </Text>
        ))}
      </View>

      <Pressable
        accessibilityRole="button"
        onPress={toggle}
        style={({ pressed }) => [verified ? styles.verified : styles.primary, pressed && styles.dim]}
      >
        <Ionicons name={verified ? 'checkmark-circle' : 'checkmark'} size={24} color={verified ? colors.accent : colors.textOnDark} />
        <Text style={verified ? styles.verifiedText : styles.primaryText}>
          {verified ? 'Verified — tap to undo' : 'Mark as verified'}
        </Text>
      </Pressable>
    </ScrollView>
  );
}

function makeStyles(colors: Colors, fonts: Fonts) {
  return StyleSheet.create({
    content: { padding: spacing.lg, gap: spacing.lg },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md, padding: spacing.lg, backgroundColor: colors.background },
    hero: { alignItems: 'center', gap: spacing.sm },
    h1: { fontSize: fonts.title, fontWeight: '800', color: colors.text, textAlign: 'center' },
    body: { fontSize: fonts.body, color: colors.textMuted, textAlign: 'center', lineHeight: fonts.body + 8 },
    numberBox: {
      backgroundColor: colors.card,
      borderWidth: 2,
      borderColor: colors.border,
      borderRadius: radius.lg,
      padding: spacing.lg,
      gap: spacing.sm,
      alignItems: 'center',
    },
    numberRow: { fontSize: fonts.heading, fontWeight: '800', color: colors.text, letterSpacing: 3, fontFamily: undefined },
    primary: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.sm,
      minHeight: TAP_TARGET,
      borderRadius: radius.lg,
      backgroundColor: colors.primary,
    },
    primaryText: { fontSize: fonts.button, fontWeight: '800', color: colors.textOnDark },
    verified: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.sm,
      minHeight: TAP_TARGET,
      borderRadius: radius.lg,
      borderWidth: 2,
      borderColor: colors.accent,
      backgroundColor: colors.card,
    },
    verifiedText: { fontSize: fonts.button, fontWeight: '800', color: colors.accent },
    dim: { opacity: 0.6 },
  });
}
