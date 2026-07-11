import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import { Alert, FlatList, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  fetchGuardians,
  fetchKnownPeople,
  removeGuardian,
  requestGuardian,
  respondGuardian,
  serverEnabled,
  type Guardian,
  type GuardianRole,
  type KnownPerson,
} from '../src/api/pocketbase';
import { Avatar } from '../src/components/Avatar';
import { useTranslation } from '../src/i18n';
import { relativeTime } from '../src/time';
import { type Colors, type Fonts, radius, spacing, TAP_TARGET } from '../src/theme';
import { useTheme } from '../src/theme-context';

export default function Guardians() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { colors, fonts } = useTheme();
  const { t } = useTranslation();
  const styles = useMemo(() => makeStyles(colors, fonts), [colors, fonts]);

  const [items, setItems] = useState<Guardian[]>([]);
  const [people, setPeople] = useState<KnownPerson[]>([]);
  const [picking, setPicking] = useState<GuardianRole | null>(null);

  const reload = () => fetchGuardians().then(setItems);
  useEffect(() => {
    reload();
    fetchKnownPeople().then(setPeople);
  }, []);

  const requests = items.filter((g) => g.needsMyResponse);
  const helpers = items.filter((g) => g.role === 'guardian' && !g.needsMyResponse);
  const wards = items.filter((g) => g.role === 'ward' && !g.needsMyResponse);

  const startInvite = (role: GuardianRole) => {
    if (!serverEnabled()) {
      Alert.alert(t('guardians.title'), t('guardians.offline'));
      return;
    }
    setPicking(role);
  };

  const invite = async (person: KnownPerson) => {
    const role = picking;
    setPicking(null);
    if (!role) return;
    try {
      await requestGuardian(person.id, role);
      await reload();
      Alert.alert(t('guardians.sent'));
    } catch {
      Alert.alert(t('guardians.title'), t('guardians.offline'));
    }
  };

  const respond = async (g: Guardian, accept: boolean) => {
    await respondGuardian(g.id, accept);
    await reload();
  };

  const remove = (g: Guardian) => {
    Alert.alert(t('guardians.remove'), t('guardians.removeConfirm', { name: g.person.name }), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('guardians.remove'),
        style: 'destructive',
        onPress: async () => {
          await removeGuardian(g.id);
          await reload();
        },
      },
    ]);
  };

  // People not already in a guardianship, for the invite picker.
  const invitable = people.filter((p) => !items.some((g) => g.person.id === p.id));

  return (
    <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + spacing.xl }]}>
      <View style={styles.note}>
        <Ionicons name="shield-checkmark" size={20} color={colors.accent} />
        <Text style={styles.noteText}>{t('guardians.privacyNote')}</Text>
      </View>

      {requests.length > 0 ? (
        <>
          <Text style={styles.heading}>{t('guardians.requests')}</Text>
          {requests.map((g) => (
            <View key={g.id} style={styles.card}>
              <Avatar name={g.person.name} uri={g.person.avatar} size={48} />
              <View style={styles.cardText}>
                <Text style={styles.cardTitle}>{g.person.name}</Text>
                <Text style={styles.cardSub}>
                  {/* role is the OTHER person's role: if they'd be my 'guardian', they want to help me. */}
                  {g.role === 'guardian' ? t('guardians.wantsToHelp', { name: g.person.name }) : t('guardians.wantsYouToHelp', { name: g.person.name })}
                </Text>
                <View style={styles.actions}>
                  <Pressable accessibilityRole="button" onPress={() => respond(g, true)} style={({ pressed }) => [styles.accept, pressed && styles.pressed]}>
                    <Text style={styles.acceptText}>{t('guardians.accept')}</Text>
                  </Pressable>
                  <Pressable accessibilityRole="button" onPress={() => respond(g, false)} style={({ pressed }) => [styles.decline, pressed && styles.pressed]}>
                    <Text style={styles.declineText}>{t('guardians.decline')}</Text>
                  </Pressable>
                </View>
              </View>
            </View>
          ))}
        </>
      ) : null}

      <Text style={styles.heading}>{t('guardians.whoHelpsMe')}</Text>
      {helpers.length === 0 ? <Text style={styles.muted}>{t('guardians.empty')}</Text> : null}
      {helpers.map((g) => (
        <View key={g.id} style={styles.card}>
          <Avatar name={g.person.name} uri={g.person.avatar} size={48} />
          <View style={styles.cardText}>
            <Text style={styles.cardTitle}>{g.person.name}</Text>
            {g.status === 'pending' ? <Text style={styles.cardSub}>{t('guardians.pending')}</Text> : null}
          </View>
          <Pressable accessibilityRole="button" accessibilityLabel={t('guardians.remove')} onPress={() => remove(g)} hitSlop={8}>
            <Ionicons name="close-circle" size={26} color={colors.danger} />
          </Pressable>
        </View>
      ))}
      <Pressable accessibilityRole="button" onPress={() => startInvite('guardian')} style={({ pressed }) => [styles.addBtn, pressed && styles.pressed]}>
        <Ionicons name="person-add" size={22} color={colors.primary} />
        <Text style={styles.addText}>{t('guardians.askHelp')}</Text>
      </Pressable>

      <Text style={styles.heading}>{t('guardians.peopleIHelp')}</Text>
      {wards.length === 0 ? <Text style={styles.muted}>{t('guardians.empty')}</Text> : null}
      {wards.map((g) => (
        <Pressable
          key={g.id}
          accessibilityRole="button"
          accessibilityLabel={g.person.name}
          onPress={() => g.status === 'active' && router.push(`/ward/${g.person.id}`)}
          style={({ pressed }) => [styles.card, pressed && g.status === 'active' && styles.pressed]}
        >
          <Avatar name={g.person.name} uri={g.person.avatar} size={48} />
          <View style={styles.cardText}>
            <Text style={styles.cardTitle}>{g.person.name}</Text>
            {g.status === 'pending' ? (
              <Text style={styles.cardSub}>{t('guardians.pending')}</Text>
            ) : (
              <Text style={styles.cardSub}>
                {g.ward?.lastCheckIn ? t('guardians.lastCheckin', { time: relativeTime(g.ward.lastCheckIn) }) : t('guardians.noCheckin')}
              </Text>
            )}
          </View>
          {g.status === 'active' ? (
            <View style={styles.managePill}>
              <Ionicons name="construct-outline" size={16} color={colors.primary} />
              <Text style={styles.manageText}>{t('guardians.manage')}</Text>
            </View>
          ) : null}
          <Pressable accessibilityRole="button" accessibilityLabel={t('guardians.remove')} onPress={() => remove(g)} hitSlop={8}>
            <Ionicons name="close-circle" size={26} color={colors.danger} />
          </Pressable>
        </Pressable>
      ))}
      <Pressable accessibilityRole="button" onPress={() => startInvite('ward')} style={({ pressed }) => [styles.addBtn, pressed && styles.pressed]}>
        <Ionicons name="hand-left" size={22} color={colors.primary} />
        <Text style={styles.addText}>{t('guardians.offerHelp')}</Text>
      </Pressable>

      {items.length === 0 && requests.length === 0 ? <Text style={styles.emptyBody}>{t('guardians.emptyBody')}</Text> : null}

      <Modal visible={!!picking} transparent animationType="slide" onRequestClose={() => setPicking(null)}>
        <Pressable style={styles.backdrop} onPress={() => setPicking(null)}>
          <Pressable style={styles.pickCard} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.pickTitle}>{t('guardians.pickPerson')}</Text>
            {invitable.length === 0 ? <Text style={styles.muted}>{t('guardians.empty')}</Text> : null}
            <FlatList
              data={invitable}
              keyExtractor={(p) => p.id}
              style={styles.pickList}
              renderItem={({ item }) => (
                <Pressable accessibilityRole="button" accessibilityLabel={item.name} onPress={() => invite(item)} style={({ pressed }) => [styles.pickRow, pressed && styles.pressed]}>
                  <Avatar name={item.name} uri={item.avatar} size={44} />
                  <Text style={styles.pickName} numberOfLines={1}>{item.name}</Text>
                </Pressable>
              )}
            />
          </Pressable>
        </Pressable>
      </Modal>
    </ScrollView>
  );
}

function makeStyles(colors: Colors, fonts: Fonts) {
  return StyleSheet.create({
    content: { padding: spacing.md, gap: spacing.sm },
    note: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, padding: spacing.md, backgroundColor: colors.bubbleTheirs, borderRadius: radius.md },
    noteText: { flex: 1, fontSize: fonts.small, color: colors.text, fontWeight: '600' },
    heading: { fontSize: fonts.body, fontWeight: '800', color: colors.text, marginTop: spacing.md },
    muted: { fontSize: fonts.body, color: colors.textMuted, paddingVertical: spacing.xs },
    emptyBody: { fontSize: fonts.body, color: colors.textMuted, textAlign: 'center', lineHeight: fonts.body + 8, marginTop: spacing.md },
    card: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      padding: spacing.md,
      backgroundColor: colors.card,
      borderRadius: radius.lg,
      borderWidth: 2,
      borderColor: colors.border,
    },
    cardText: { flex: 1 },
    cardTitle: { fontSize: fonts.body + 1, fontWeight: '800', color: colors.text },
    cardSub: { fontSize: fonts.small, color: colors.textMuted, marginTop: 2 },
    actions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm },
    accept: { paddingHorizontal: spacing.md, paddingVertical: 8, borderRadius: radius.pill, backgroundColor: colors.accent },
    acceptText: { fontSize: fonts.small, fontWeight: '800', color: colors.textOnDark },
    decline: { paddingHorizontal: spacing.md, paddingVertical: 8, borderRadius: radius.pill, borderWidth: 2, borderColor: colors.border },
    declineText: { fontSize: fonts.small, fontWeight: '800', color: colors.textMuted },
    managePill: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: spacing.sm, paddingVertical: 6, borderRadius: radius.pill, backgroundColor: colors.bubbleTheirs },
    manageText: { fontSize: fonts.small - 1, fontWeight: '800', color: colors.primary },
    pressed: { opacity: 0.7 },
    addBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.sm,
      minHeight: TAP_TARGET,
      borderRadius: radius.lg,
      borderWidth: 2,
      borderColor: colors.border,
      backgroundColor: colors.card,
    },
    addText: { fontSize: fonts.body, fontWeight: '800', color: colors.primary },
    backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'flex-end' },
    pickCard: {
      maxHeight: '70%',
      backgroundColor: colors.card,
      borderTopLeftRadius: radius.lg,
      borderTopRightRadius: radius.lg,
      padding: spacing.md,
    },
    pickTitle: { fontSize: fonts.title, fontWeight: '800', color: colors.text, marginBottom: spacing.sm, textAlign: 'center' },
    pickList: { flexGrow: 0 },
    pickRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.sm },
    pickName: { flex: 1, fontSize: fonts.body, fontWeight: '700', color: colors.text },
  });
}
