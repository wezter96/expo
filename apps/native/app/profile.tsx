import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';
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
import { myAvatarUrl, updateProfile } from '../src/api/pocketbase';
import { useAuth } from '../src/auth/AuthContext';
import { Avatar } from '../src/components/Avatar';
import { type Colors, type Fonts, radius, spacing, TAP_TARGET } from '../src/theme';
import { useTheme } from '../src/theme-context';

export default function Profile() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user, refreshUser } = useAuth();
  const { colors, fonts } = useTheme();
  const styles = useMemo(() => makeStyles(colors, fonts), [colors, fonts]);

  const [name, setName] = useState(user?.name ?? '');
  const [photo, setPhoto] = useState<string | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pickPhoto = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      setError('Please allow photo access to change your picture.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.7,
    });
    if (!result.canceled && result.assets[0]) setPhoto(result.assets[0].uri);
  };

  const save = async () => {
    if (!name.trim()) {
      setError('Please enter your name.');
      return;
    }
    setError(null);
    setBusy(true);
    try {
      await updateProfile(name, photo);
      refreshUser();
      router.back();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save your profile.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + spacing.xl }]}>
        <Pressable accessibilityLabel="Change photo" onPress={pickPhoto} style={styles.photoWrap}>
          <Avatar name={name || 'You'} size={120} uri={photo ?? myAvatarUrl()} />
          <View style={styles.cameraBadge}>
            <Ionicons name="camera" size={22} color={colors.textOnDark} />
          </View>
        </Pressable>
        <Text style={styles.changePhoto}>Tap to change photo</Text>

        <Text style={styles.label}>Your name</Text>
        <TextInput
          style={styles.input}
          value={name}
          onChangeText={setName}
          placeholder="Your name"
          placeholderTextColor={colors.textMuted}
          autoCapitalize="words"
        />

        {user?.phone ? (
          <>
            <Text style={styles.label}>Phone number</Text>
            <View style={[styles.input, styles.readonly]}>
              <Text style={styles.readonlyText}>{user.phone}</Text>
            </View>
          </>
        ) : null}

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <Pressable
          accessibilityRole="button"
          onPress={save}
          disabled={busy}
          style={({ pressed }) => [styles.primary, (busy || pressed) && styles.dim]}
        >
          {busy ? <ActivityIndicator color={colors.textOnDark} /> : <Text style={styles.primaryText}>Save</Text>}
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function makeStyles(colors: Colors, fonts: Fonts) {
  return StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, gap: spacing.sm, alignItems: 'stretch' },
  photoWrap: { alignSelf: 'center', marginTop: spacing.sm },
  cameraBadge: {
    position: 'absolute',
    right: -2,
    bottom: -2,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: colors.background,
  },
  changePhoto: { alignSelf: 'center', fontSize: fonts.small, color: colors.textMuted, marginBottom: spacing.md },
  label: { fontSize: fonts.body, fontWeight: '800', color: colors.text, marginTop: spacing.sm },
  input: {
    minHeight: TAP_TARGET,
    borderWidth: 2,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    fontSize: fonts.body,
    color: colors.text,
    backgroundColor: colors.card,
    justifyContent: 'center',
  },
  readonly: { backgroundColor: colors.background },
  readonlyText: { fontSize: fonts.body, color: colors.textMuted },
  error: { fontSize: fonts.body, color: colors.danger, fontWeight: '600', marginTop: spacing.sm },
  primary: {
    minHeight: TAP_TARGET + 8,
    backgroundColor: colors.accent,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.lg,
  },
  dim: { opacity: 0.7 },
  primaryText: { fontSize: fonts.button, fontWeight: '800', color: colors.textOnDark },
  });
}
