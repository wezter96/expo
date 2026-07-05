import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { startDirectChat } from '../src/api/pocketbase';
import { useStore } from '../src/store';
import { colors, fonts, radius, spacing, TAP_TARGET } from '../src/theme';

export default function NewChat() {
  const router = useRouter();
  const { refresh } = useStore();
  const [phone, setPhone] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const start = async () => {
    if (!phone.trim()) return;
    setError(null);
    setBusy(true);
    try {
      const conversationId = await startDirectChat(phone.trim());
      await refresh();
      router.replace(`/chat/${conversationId}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not start the chat.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.content}>
        <View style={styles.icon}>
          <Ionicons name="person-add" size={44} color={colors.textOnDark} />
        </View>
        <Text style={styles.title}>Add a family member or friend</Text>
        <Text style={styles.body}>Enter their phone number. They need to have joined Kinly too.</Text>

        <TextInput
          style={styles.input}
          value={phone}
          onChangeText={setPhone}
          placeholder="+1 555 0100"
          placeholderTextColor={colors.textMuted}
          keyboardType="phone-pad"
          autoFocus
        />

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <Pressable
          accessibilityRole="button"
          onPress={start}
          disabled={busy || !phone.trim()}
          style={({ pressed }) => [styles.primary, (busy || !phone.trim() || pressed) && styles.dim]}
        >
          {busy ? <ActivityIndicator color={colors.textOnDark} /> : <Text style={styles.primaryText}>Start chat</Text>}
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, gap: spacing.md },
  icon: {
    alignSelf: 'center',
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.md,
    marginBottom: spacing.sm,
  },
  title: { fontSize: fonts.title, fontWeight: '800', color: colors.text, textAlign: 'center' },
  body: { fontSize: fonts.body, color: colors.textMuted, textAlign: 'center', marginBottom: spacing.sm },
  input: {
    minHeight: TAP_TARGET,
    borderWidth: 2,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    fontSize: fonts.title,
    color: colors.text,
    backgroundColor: colors.card,
    textAlign: 'center',
  },
  error: { fontSize: fonts.body, color: colors.danger, fontWeight: '600', textAlign: 'center' },
  primary: {
    minHeight: TAP_TARGET + 8,
    backgroundColor: colors.accent,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.sm,
  },
  dim: { opacity: 0.6 },
  primaryText: { fontSize: fonts.button, fontWeight: '800', color: colors.textOnDark },
});
