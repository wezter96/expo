import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
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
  setGroupAdmins,
  updateGroupMembers,
  updateGroupPhoto,
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
  const admins = contact?.admins ?? [];
  // Legacy groups (no admins recorded) keep the old everyone-manages behavior.
  const isAdmin = admins.length === 0 || (!!me && admins.includes(me));

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
          // Drop their admin seat first (while the caller is still an admin).
          if (admins.includes(memberId)) {
            await setGroupAdmins(contact.id, admins.filter((x) => x !== memberId));
          }
          await updateGroupMembers(
            contact.id,
            currentIds.filter((x) => x !== memberId)
          );
          await refresh();
        },
      },
    ]);
  };

  const toggleAdmin = async (memberId: string) => {
    const has = admins.includes(memberId);
    if (has && admins.length === 1) {
      Alert.alert(t('group.admin'), t('group.lastAdmin'));
      return;
    }
    // Legacy group: the first grant records the current member set's manager.
    const base = admins.length === 0 ? [me].filter(Boolean) as string[] : admins;
    await setGroupAdmins(contact.id, has ? base.filter((x) => x !== memberId) : [...base, memberId]);
    await refresh();
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

  const changePhoto = async () => {
    if (!serverEnabled()) return;
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.7, allowsEditing: true, aspect: [1, 1] });
    const uri = res.assets?.[0]?.uri;
    if (res.canceled || !uri) return;
    try {
      await updateGroupPhoto(contact.id, uri);
      await refresh();
    } catch {
      Alert.alert(t('group.photoError'));
    }
  };

  return (
    <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + spacing.xl }]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('group.changePhoto')}
        onPress={changePhoto}
        style={({ pressed }) => [styles.photoWrap, pressed && styles.pressed]}
      >
        <Avatar name={contact.name} isGroup uri={contact.avatar} size={96} />
        <View style={styles.photoBadge}>
          <Ionicons name="camera" size={18} color={colors.textOnDark} />
        </View>
      </Pressable>

      <Text style={styles.label}>Group name</Text>
      <TextInput
        style={styles.input}
        value={title}
        onChangeText={setTitle}
        onBlur={saveName}
        placeholder="Group name"
        placeholderTextColor={colors.textMuted}
        autoCapitalize="words"
        editable={isAdmin}
      />

      <Text style={styles.label}>In this group</Text>
      <View style={styles.card}>
        <View style={styles.member}>
          <Avatar name="You" size={48} />
          <Text style={styles.memberName}>You</Text>
          {me && admins.includes(me) ? <Text style={styles.adminBadge}>{t('group.admin')}</Text> : null}
        </View>
        {members.map((m) => (
          <View key={m.id} style={styles.member}>
            <Avatar name={m.name} uri={m.avatar} size={48} />
            <Text style={styles.memberName}>{m.name}</Text>
            {admins.includes(m.id) ? <Text style={styles.adminBadge}>{t('group.admin')}</Text> : null}
            {isAdmin ? (
              <>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={admins.includes(m.id) ? `${t('group.removeAdmin')} ${m.name}` : `${t('group.makeAdmin')} ${m.name}`}
                  onPress={() => toggleAdmin(m.id)}
                  hitSlop={10}
                >
                  <Ionicons
                    name={admins.includes(m.id) ? 'shield' : 'shield-outline'}
                    size={26}
                    color={admins.includes(m.id) ? colors.primary : colors.textMuted}
                  />
                </Pressable>
                <Pressable accessibilityRole="button" accessibilityLabel={`Remove ${m.name}`} onPress={() => removeMember(m.id, m.name)} hitSlop={10}>
                  <Ionicons name="close-circle" size={28} color={colors.danger} />
                </Pressable>
              </>
            ) : null}
          </View>
        ))}
      </View>
      {!isAdmin ? <Text style={styles.hint}>{t('group.onlyAdmins')}</Text> : null}

      {isAdmin && people.length > 0 ? (
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
  adminBadge: {
    fontSize: fonts.small - 2,
    fontWeight: '800',
    color: colors.primary,
    borderWidth: 1.5,
    borderColor: colors.primary,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    overflow: 'hidden',
  },
  hint: { fontSize: fonts.small, color: colors.textMuted, textAlign: 'center' },
  photoWrap: { alignSelf: 'center', marginTop: spacing.sm },
  photoBadge: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.card,
  },
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
