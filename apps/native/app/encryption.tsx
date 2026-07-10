import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { publishE2EEKeys } from '../src/api/pocketbase';
import { e2eeSupported, recoveryPhrase, resetIdentity, restoreFromPhrase } from '../src/crypto/identity';
import { type Colors, type Fonts, radius, spacing, TAP_TARGET } from '../src/theme';
import { useTheme } from '../src/theme-context';

export default function Encryption() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { colors, fonts } = useTheme();
  const styles = useMemo(() => makeStyles(colors, fonts), [colors, fonts]);
  const [phrase, setPhrase] = useState<string | null>(null);
  const [restoreText, setRestoreText] = useState('');
  const [busy, setBusy] = useState(false);

  const reveal = async () => {
    try {
      setPhrase(await recoveryPhrase());
    } catch {
      Alert.alert('Not available', 'Could not read your recovery phrase on this device.');
    }
  };

  const restore = async () => {
    setBusy(true);
    try {
      await restoreFromPhrase(restoreText);
      await publishE2EEKeys();
      setRestoreText('');
      Alert.alert('Restored', 'Your encryption key has been restored on this device.');
    } catch (e) {
      Alert.alert('Could not restore', e instanceof Error ? e.message : 'Please check the words and try again.');
    } finally {
      setBusy(false);
    }
  };

  const reset = () => {
    Alert.alert(
      'Reset encryption key?',
      'This creates a brand-new key on this device. You will not be able to read older encrypted messages unless you restore your recovery phrase. Continue?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reset',
          style: 'destructive',
          onPress: async () => {
            await resetIdentity();
            await publishE2EEKeys();
            setPhrase(null);
            Alert.alert('Done', 'A new encryption key has been created.');
          },
        },
      ]
    );
  };

  if (!e2eeSupported) {
    return (
      <View style={styles.center}>
        <Ionicons name="lock-closed" size={56} color={colors.primary} />
        <Text style={styles.h1}>Encryption keys</Text>
        <Text style={styles.body}>
          End-to-end encryption is available in the Kinly phone app, which can store your key safely on your device.
        </Text>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + spacing.xl }]}>
        <View style={styles.hero}>
          <Ionicons name="shield-checkmark" size={44} color={colors.accent} />
          <Text style={styles.h1}>Your messages are private</Text>
          <Text style={styles.body}>
            Kinly locks your messages so only you and the people you talk to can read them — not even we can.
          </Text>
        </View>

        <Pressable
          accessibilityRole="button"
          onPress={() => router.push('/link-device')}
          style={({ pressed }) => [styles.secondary, pressed && styles.dim]}
        >
          <Ionicons name="qr-code" size={22} color={colors.primary} />
          <Text style={styles.secondaryText}>Add another device</Text>
        </Pressable>

        <Text style={styles.label}>Recovery phrase</Text>
        <Text style={styles.hint}>
          These 24 words are the key to your messages. Write them down and keep them somewhere safe. If you get a new
          phone, enter them to get your messages back. Never share them with anyone.
        </Text>
        {phrase ? (
          <View style={styles.phraseBox}>
            <Text style={styles.phrase}>{phrase}</Text>
          </View>
        ) : (
          <Pressable accessibilityRole="button" onPress={reveal} style={({ pressed }) => [styles.secondary, pressed && styles.dim]}>
            <Ionicons name="eye" size={22} color={colors.primary} />
            <Text style={styles.secondaryText}>Show my recovery phrase</Text>
          </Pressable>
        )}

        <Text style={[styles.label, { marginTop: spacing.lg }]}>Restore on this device</Text>
        <Text style={styles.hint}>Have a recovery phrase from another device? Enter the 24 words to restore your key.</Text>
        <TextInput
          style={styles.input}
          value={restoreText}
          onChangeText={setRestoreText}
          placeholder="word1 word2 word3 …"
          placeholderTextColor={colors.textMuted}
          autoCapitalize="none"
          multiline
        />
        <Pressable
          accessibilityRole="button"
          onPress={restore}
          disabled={busy || !restoreText.trim()}
          style={({ pressed }) => [styles.primary, (busy || pressed || !restoreText.trim()) && styles.dim]}
        >
          <Text style={styles.primaryText}>Restore key</Text>
        </Pressable>

        <Pressable accessibilityRole="button" onPress={reset} style={({ pressed }) => [styles.danger, pressed && styles.dim]}>
          <Ionicons name="refresh" size={20} color={colors.danger} />
          <Text style={styles.dangerText}>Reset encryption key</Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function makeStyles(colors: Colors, fonts: Fonts) {
  return StyleSheet.create({
    flex: { flex: 1, backgroundColor: colors.background },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md, padding: spacing.lg, backgroundColor: colors.background },
    content: { padding: spacing.lg, gap: spacing.sm },
    hero: { alignItems: 'center', gap: spacing.sm, marginBottom: spacing.md },
    h1: { fontSize: fonts.title, fontWeight: '800', color: colors.text, textAlign: 'center' },
    body: { fontSize: fonts.body, color: colors.textMuted, textAlign: 'center', lineHeight: fonts.body + 8 },
    label: { fontSize: fonts.body, fontWeight: '800', color: colors.text, marginTop: spacing.sm },
    hint: { fontSize: fonts.small, color: colors.textMuted, lineHeight: fonts.small + 6 },
    phraseBox: {
      backgroundColor: colors.card,
      borderWidth: 2,
      borderColor: colors.accent,
      borderRadius: radius.lg,
      padding: spacing.md,
    },
    phrase: { fontSize: fonts.body, color: colors.text, fontWeight: '700', lineHeight: fonts.body + 12 },
    input: {
      minHeight: TAP_TARGET + 20,
      borderWidth: 2,
      borderColor: colors.border,
      borderRadius: radius.md,
      padding: spacing.md,
      fontSize: fonts.body,
      color: colors.text,
      backgroundColor: colors.card,
      textAlignVertical: 'top',
    },
    secondary: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.sm,
      minHeight: TAP_TARGET,
      borderWidth: 2,
      borderColor: colors.border,
      borderRadius: radius.lg,
      backgroundColor: colors.card,
    },
    secondaryText: { fontSize: fonts.button, fontWeight: '800', color: colors.primary },
    primary: {
      minHeight: TAP_TARGET,
      borderRadius: radius.lg,
      backgroundColor: colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: spacing.xs,
    },
    primaryText: { fontSize: fonts.button, fontWeight: '800', color: colors.textOnDark },
    danger: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.sm,
      minHeight: TAP_TARGET,
      borderRadius: radius.lg,
      borderWidth: 2,
      borderColor: colors.danger,
      backgroundColor: colors.card,
      marginTop: spacing.lg,
    },
    dangerText: { fontSize: fonts.button, fontWeight: '800', color: colors.danger },
    dim: { opacity: 0.6 },
  });
}
