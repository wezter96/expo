import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, Share, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  currentUserId,
  fetchKnownPeople,
  getGroupInvite,
  renameGroup,
  serverEnabled,
  updateGroupMembers,
  type KnownPerson,
} from '../../src/api/pocketbase';
import { Avatar } from '../../src/components/Avatar';
import { useTranslation } from '../../src/i18n';
import { useStore } from '../../src/store';
import { type Colors, type Fonts, radius, spacing, TAP_TARGET } from '../../src/theme';
import { useTheme } from '../../src/theme-context';

export default function GroupSettings() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { getContact, refresh } = useStore();
  const { colors, fonts } = useTheme();
  const { t } = useTranslation();
  const styles = useMemo(() => makeStyles(colors, fonts), [colors, fonts]);
  const [inviting, setInviting] = useState(false);

  const contact = id ? getContact(id) : undefined;
  const me = currentUserId();
  const members = contact?.members ?? []; // the OTHER members
  const currentIds = [me, ...members.map((m) => m.id)].filter(Boolean) as string[];

  const [title, setTitle] = useState(contact?.name ?? '');
  const [people, setPeople] = useState<KnownPerson[]>([]);

  // The contact may not be in the store yet on first render; fill the name
  // field once it loads (without clobbering an edit in progress).
  useEffect(() => {
    if (contact?.name) setTitle((t) => (t ? t : contact.name));
  }, [contact?.name]);

  useEffect(() => {
    fetchKnownPeople().then((list) => setPeople(list.filter((p) => !currentIds.includes(p.id))));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  if (!contact || !contact.isGroup) {
    return (
      <View style={styles.center}>
        <Text style={styles.muted}>This group could not be found.</Text>
      </View>
    );
  }

  const saveName = async () => {
    if (title.trim() && title.trim() !== contact.name) {
      await renameGroup(contact.id, title);
      await refresh();
    }
  };

  const removeMember = (memberId: string, name: string) => {
    Alert.alert('Remove', `Remove ${name} from the group?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          await updateGroupMembers(
            contact.id,
            currentIds.filter((x) => x !== memberId)
          );
          await refresh();
        },
      },
    ]);
  };

  const addPerson = async (personId: string) => {
    await updateGroupMembers(contact.id, [...currentIds, personId]);
    await refresh();
    setPeople((p) => p.filter((x) => x.id !== personId));
  };

  const shareInvite = async () => {
    if (!serverEnabled()) {
      Alert.alert(t('group.inviteLink'), t('join.offline'));
      return;
    }
    setInviting(true);
    try {
      const code = await getGroupInvite(contact.id);
      if (!code) throw new Error('no code');
      const link = `kinly://join/${code}`;
      await Share.share({
        message: t('group.inviteMessage', { title: contact.name, code, link }),
      });
    } catch {
      Alert.alert(t('group.inviteLink'), t('group.inviteError'));
    } finally {
      setInviting(false);
    }
  };

  const leave = () => {
    Alert.alert('Leave group', `Leave "${contact.name}"?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Leave',
        style: 'destructive',
        onPress: async () => {
          await updateGroupMembers(
            contact.id,
            currentIds.filter((x) => x !== me)
          );
          await refresh();
          router.replace('/');
        },
      },
    ]);
  };

  return (
    <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + spacing.xl }]}>
      <Text style={styles.label}>Group name</Text>
      <TextInput
        style={styles.input}
        value={title}
        onChangeText={setTitle}
        onBlur={saveName}
        placeholder="Group name"
        placeholderTextColor={colors.textMuted}
        autoCapitalize="words"
      />

      <Text style={styles.label}>In this group</Text>
      <View style={styles.card}>
        <View style={styles.member}>
          <Avatar name="You" size={48} />
          <Text style={styles.memberName}>You</Text>
        </View>
        {members.map((m) => (
          <View key={m.id} style={styles.member}>
            <Avatar name={m.name} uri={m.avatar} size={48} />
            <Text style={styles.memberName}>{m.name}</Text>
            <Pressable accessibilityRole="button" accessibilityLabel={`Remove ${m.name}`} onPress={() => removeMember(m.id, m.name)} hitSlop={10}>
              <Ionicons name="close-circle" size={28} color={colors.danger} />
            </Pressable>
          </View>
        ))}
      </View>

      {people.length > 0 ? (
        <>
          <Text style={styles.label}>Add people</Text>
          <View style={styles.card}>
            {people.map((p) => (
              <Pressable key={p.id} onPress={() => addPerson(p.id)} style={({ pressed }) => [styles.member, pressed && styles.pressed]}>
                <Avatar name={p.name} uri={p.avatar} size={48} />
                <Text style={styles.memberName}>{p.name}</Text>
                <Ionicons name="add-circle" size={28} color={colors.accent} />
              </Pressable>
            ))}
          </View>
        </>
      ) : null}

      <Text style={styles.label}>{t('group.inviteLink')}</Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('group.shareInvite')}
        onPress={shareInvite}
        disabled={inviting}
        style={({ pressed }) => [styles.invite, (pressed || inviting) && styles.pressed]}
      >
        <Ionicons name="share-social-outline" size={26} color={colors.primary} />
        <View style={styles.inviteText}>
          <Text style={styles.inviteTitle}>{t('group.shareInvite')}</Text>
          <Text style={styles.inviteBody}>{t('group.inviteBody')}</Text>
        </View>
      </Pressable>

      <Pressable onPress={leave} style={({ pressed }) => [styles.leave, pressed && styles.pressed]}>
        <Ionicons name="exit-outline" size={26} color={colors.danger} />
        <Text style={styles.leaveText}>Leave group</Text>
      </Pressable>
    </ScrollView>
  );
}

function makeStyles(colors: Colors, fonts: Fonts) {
  return StyleSheet.create({
  content: { padding: spacing.md, gap: spacing.sm },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.lg },
  muted: { fontSize: fonts.body, color: colors.textMuted },
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
  card: { backgroundColor: colors.card, borderRadius: radius.lg, borderWidth: 2, borderColor: colors.border, overflow: 'hidden' },
  member: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border },
  memberName: { flex: 1, fontSize: fonts.body, fontWeight: '700', color: colors.text },
  pressed: { opacity: 0.7 },
  invite: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 2,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  inviteText: { flex: 1 },
  inviteTitle: { fontSize: fonts.body, fontWeight: '800', color: colors.primary },
  inviteBody: { fontSize: fonts.small, color: colors.textMuted, marginTop: 2 },
  leave: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    minHeight: TAP_TARGET,
    marginTop: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 2,
    borderColor: colors.danger,
    backgroundColor: colors.card,
  },
  leaveText: { fontSize: fonts.button, fontWeight: '800', color: colors.danger },
  });
}
