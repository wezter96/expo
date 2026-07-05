import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import {
  ActivityIndicator,
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
import { colors, fonts, radius, spacing, TAP_TARGET } from '../theme';
import { useAuth } from './AuthContext';

type Mode = 'signin' | 'signup';

export function AuthScreen() {
  const insets = useSafeAreaInsets();
  const { signIn, signUp } = useAuth();
  const [mode, setMode] = useState<Mode>('signin');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setError(null);
    setBusy(true);
    try {
      if (mode === 'signin') {
        await signIn(email, password);
      } else {
        if (!name.trim() || !phone.trim()) throw new Error('Please enter your name and phone number.');
        await signUp({ name, phone, email, password });
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Something went wrong. Please try again.';
      setError(msg.replace('Failed to authenticate.', 'That email or password was not right.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + spacing.xl, paddingBottom: insets.bottom + spacing.xl },
        ]}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.logo}>
          <Ionicons name="chatbubbles" size={48} color={colors.textOnDark} />
        </View>
        <Text style={styles.title}>Welcome to Kinly</Text>
        <Text style={styles.subtitle}>
          {mode === 'signin' ? 'Sign in to talk with your family.' : 'Create your account to get started.'}
        </Text>

        {mode === 'signup' && (
          <>
            <Field label="Your name" value={name} onChangeText={setName} placeholder="Mary Johnson" autoCapitalize="words" />
            <Field
              label="Phone number"
              value={phone}
              onChangeText={setPhone}
              placeholder="+1 555 0100"
              keyboardType="phone-pad"
              hint="Family add you by your phone number."
            />
          </>
        )}
        <Field
          label="Email"
          value={email}
          onChangeText={setEmail}
          placeholder="you@example.com"
          keyboardType="email-address"
          autoCapitalize="none"
        />
        <Field
          label="Password"
          value={password}
          onChangeText={setPassword}
          placeholder="At least 8 characters"
          secureTextEntry
          autoCapitalize="none"
        />

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <Pressable
          accessibilityRole="button"
          onPress={submit}
          disabled={busy}
          style={({ pressed }) => [styles.primary, (busy || pressed) && styles.pressed]}
        >
          {busy ? (
            <ActivityIndicator color={colors.textOnDark} />
          ) : (
            <Text style={styles.primaryText}>{mode === 'signin' ? 'Sign in' : 'Create account'}</Text>
          )}
        </Pressable>

        <Pressable
          accessibilityRole="button"
          onPress={() => {
            setError(null);
            setMode(mode === 'signin' ? 'signup' : 'signin');
          }}
          style={styles.switch}
        >
          <Text style={styles.switchText}>
            {mode === 'signin' ? "New here? Create an account" : 'Already have an account? Sign in'}
          </Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function Field({
  label,
  hint,
  ...props
}: { label: string; hint?: string } & React.ComponentProps<typeof TextInput>) {
  return (
    <View style={styles.fieldWrap}>
      <Text style={styles.label}>{label}</Text>
      <TextInput style={styles.input} placeholderTextColor={colors.textMuted} {...props} />
      {hint ? <Text style={styles.hint}>{hint}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, gap: spacing.md },
  logo: {
    alignSelf: 'center',
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  title: { fontSize: fonts.huge, fontWeight: '800', color: colors.text, textAlign: 'center' },
  subtitle: { fontSize: fonts.body, color: colors.textMuted, textAlign: 'center', marginBottom: spacing.md },

  fieldWrap: { gap: 6 },
  label: { fontSize: fonts.body, fontWeight: '700', color: colors.text },
  input: {
    minHeight: TAP_TARGET,
    borderWidth: 2,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    fontSize: fonts.body,
    color: colors.text,
    backgroundColor: colors.card,
  },
  hint: { fontSize: fonts.small, color: colors.textMuted },
  error: { fontSize: fonts.body, color: colors.danger, fontWeight: '600', textAlign: 'center' },

  primary: {
    minHeight: TAP_TARGET + 8,
    backgroundColor: colors.accent,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.sm,
  },
  pressed: { opacity: 0.85 },
  primaryText: { fontSize: fonts.button, fontWeight: '800', color: colors.textOnDark },
  switch: { alignItems: 'center', paddingVertical: spacing.md },
  switchText: { fontSize: fonts.body, color: colors.primary, fontWeight: '700' },
});
