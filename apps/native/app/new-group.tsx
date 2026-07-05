import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { createGroup, fetchKnownPeople, type KnownPerson } from '../src/api/pocketbase';
import { Avatar } from '../src/components/Avatar';
import { useStore } from '../src/store';
import { colors, fonts, radius, spacing, TAP_TARGET } from '../src/theme';

export default function NewGroup() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { refresh } = useStore();

  const [title, setTitle] = useState('');
  const [people, setPeople] = useState<KnownPerson[]>([]);
  const [picked, setPicked] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      const list = await fetchKnownPeople();
      if (active) {
        setPeople(list);
        setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const toggle = (id: string) => setPicked((p) => ({ ...p, [id]: !p[id] }));
  const chosen = Object.keys(picked).filter((id) => picked[id]);

  const create = async () => {
    if (!title.trim() || chosen.length === 0) return;
    setError(null);
    setBusy(true);
    try {
      const id = await createGroup(title.trim(), chosen);
      await refresh();
      if (id) router.replace(`/chat/${id}`);
      else setError('Could not create the group.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not create the group.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.flex}>
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 120 }]}>
        <Text style={styles.label}>Group name</Text>
        <TextInput
          style={styles.input}
          value={title}
          onChangeText={setTitle}
          placeholder="Family"
          placeholderTextColor={colors.textMuted}
          autoCapitalize="words"
        />

        <Text style={styles.label}>Add people</Text>
        {loading ? (
          <ActivityIndicator color={colors.primary} style={{ marginTop: spacing.md }} />
        ) : people.length === 0 ? (
          <Text style={styles.empty}>Add people to your chats first, then you can group them here.</Text>
        ) : (
          people.map((p) => (
            <Pressable
              key={p.id}
              accessibilityRole="button"
              accessibilityState={{ selected: !!picked[p.id] }}
              onPress={() => toggle(p.id)}
              style={({ pressed }) => [styles.row, pressed && styles.dim]}
            >
              <Avatar name={p.name} size={54} />
              <Text style={styles.name}>{p.name}</Text>
              <Ionicons
                name={picked[p.id] ? 'checkmark-circle' : 'ellipse-outline'}
                size={32}
                color={picked[p.id] ? colors.accent : colors.border}
              />
            </Pressable>
          ))
        )}
        {error ? <Text style={styles.error}>{error}</Text> : null}
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, spacing.md) }]}>
        <Pressable
          accessibilityRole="button"
          onPress={create}
          disabled={busy || !title.trim() || chosen.length === 0}
          style={({ pressed }) => [
            styles.primary,
            (busy || !title.trim() || chosen.length === 0 || pressed) && styles.dim,
          ]}
        >
          {busy ? (
            <ActivityIndicator color={colors.textOnDark} />
          ) : (
            <Text style={styles.primaryText}>
              Create group{chosen.length ? ` (${chosen.length})` : ''}
            </Text>
          )}
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.md, gap: spacing.sm },
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
  },
  empty: { fontSize: fonts.body, color: colors.textMuted, marginTop: spacing.sm },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 2,
    borderColor: colors.border,
    padding: spacing.md,
  },
  dim: { opacity: 0.7 },
  name: { flex: 1, fontSize: fonts.body + 1, fontWeight: '700', color: colors.text },
  error: { fontSize: fonts.body, color: colors.danger, fontWeight: '600', marginTop: spacing.sm },
  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    padding: spacing.md,
    backgroundColor: colors.card,
    borderTopWidth: 2,
    borderTopColor: colors.border,
  },
  primary: {
    minHeight: TAP_TARGET + 8,
    backgroundColor: colors.accent,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryText: { fontSize: fonts.button, fontWeight: '800', color: colors.textOnDark },
});
