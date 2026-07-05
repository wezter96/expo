import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React from 'react';
import { Alert, Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Avatar } from '../../src/components/Avatar';
import { useStore } from '../../src/store';
import { Contact } from '../../src/types';
import { colors, fonts, radius, spacing, TAP_TARGET } from '../../src/theme';
import { relativeTime } from '../../src/time';

export default function Messages() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { conversations, ready } = useStore();

  function call(contact: Contact) {
    if (!contact.phone) {
      Alert.alert('No phone number', `There is no phone number saved for ${contact.name}.`);
      return;
    }
    Linking.openURL(`tel:${contact.phone}`).catch(() => Alert.alert('Could not start the call'));
  }

  return (
    <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + spacing.xl }]}>
      {!ready ? (
        <Text style={styles.muted}>Loading…</Text>
      ) : (
        conversations.map(({ contact, messages }) => {
          const last = messages.length ? messages[messages.length - 1] : undefined;
          return (
            <View key={contact.id} style={styles.row}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Open chat with ${contact.name}`}
                onPress={() => router.push(`/chat/${contact.id}`)}
                style={({ pressed }) => [styles.rowMain, pressed && styles.pressed]}
              >
                <Avatar name={contact.name} isGroup={contact.isGroup} size={64} />
                <View style={styles.rowText}>
                  <Text style={styles.name} numberOfLines={1}>
                    {contact.name}
                  </Text>
                  <View style={styles.subLine}>
                    {last ? (
                      <Text style={styles.preview} numberOfLines={1}>
                        {last.mine ? 'You: ' : ''}
                        {last.text}
                      </Text>
                    ) : (
                      <Text style={styles.relation} numberOfLines={1}>
                        {contact.relation}
                      </Text>
                    )}
                    {last ? <Text style={styles.time}>{relativeTime(last.at)}</Text> : null}
                  </View>
                </View>
              </Pressable>

              {!contact.isGroup && (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Call ${contact.name}`}
                  onPress={() => call(contact)}
                  style={({ pressed }) => [styles.callBtn, pressed && styles.pressed]}
                >
                  <Ionicons name="call" size={26} color={colors.textOnDark} />
                </Pressable>
              )}
            </View>
          );
        })
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.md, gap: spacing.sm },
  muted: { fontSize: fonts.body, color: colors.textMuted, padding: spacing.md },
  row: {
    flexDirection: 'row',
    alignItems: 'stretch',
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 2,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  rowMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.md },
  pressed: { opacity: 0.7 },
  rowText: { flex: 1 },
  name: { fontSize: fonts.body + 3, fontWeight: '800', color: colors.text },
  subLine: { flexDirection: 'row', alignItems: 'center', marginTop: 2, gap: spacing.sm },
  preview: { flex: 1, fontSize: fonts.small, color: colors.textMuted },
  relation: { flex: 1, fontSize: fonts.small, color: colors.textMuted },
  time: { fontSize: fonts.small - 2, color: colors.textMuted },
  callBtn: {
    width: TAP_TARGET,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
