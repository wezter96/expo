import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React from 'react';
import { Alert, Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Avatar } from '../src/components/Avatar';
import { useStore } from '../src/store';
import { Contact } from '../src/types';
import { colors, fonts, radius, spacing, TAP_TARGET } from '../src/theme';

export default function Contacts() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { contacts } = useStore();

  function call(contact: Contact) {
    if (!contact.phone) {
      Alert.alert('No phone number', `There is no phone number saved for ${contact.name}.`);
      return;
    }
    Linking.openURL(`tel:${contact.phone}`).catch(() =>
      Alert.alert('Could not start call', 'Please try again.')
    );
  }

  return (
    <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + spacing.xl }]}>
      {contacts.map((contact) => (
        <View key={contact.id} style={styles.card}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Open chat with ${contact.name}`}
            onPress={() => router.push(`/chat/${contact.id}`)}
            style={({ pressed }) => [styles.header, pressed && styles.pressed]}
          >
            <Avatar name={contact.name} isGroup={contact.isGroup} size={66} />
            <View style={styles.nameWrap}>
              <Text style={styles.name} numberOfLines={1}>
                {contact.name}
              </Text>
              <Text style={styles.relation}>{contact.relation}</Text>
            </View>
          </Pressable>

          <View style={styles.actions}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Message ${contact.name}`}
              onPress={() => router.push(`/chat/${contact.id}`)}
              style={({ pressed }) => [styles.action, styles.message, pressed && styles.pressed]}
            >
              <Ionicons name="chatbubble" size={28} color={colors.textOnDark} />
              <Text style={styles.actionText}>Message</Text>
            </Pressable>

            {!contact.isGroup && (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Call ${contact.name}`}
                onPress={() => call(contact)}
                style={({ pressed }) => [styles.action, styles.callBtn, pressed && styles.pressed]}
              >
                <Ionicons name="call" size={28} color={colors.textOnDark} />
                <Text style={styles.actionText}>Call</Text>
              </Pressable>
            )}
          </View>
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.md, gap: spacing.md },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 2,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  header: { flexDirection: 'row', alignItems: 'center', padding: spacing.md, gap: spacing.md },
  pressed: { opacity: 0.75 },
  nameWrap: { flex: 1 },
  name: { fontSize: fonts.title, fontWeight: '800', color: colors.text },
  relation: { fontSize: fonts.body, color: colors.textMuted, marginTop: 2 },
  actions: { flexDirection: 'row', gap: 2, borderTopWidth: 2, borderTopColor: colors.border },
  action: {
    flex: 1,
    minHeight: TAP_TARGET,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  message: { backgroundColor: colors.primary },
  callBtn: { backgroundColor: colors.accent },
  actionText: { color: colors.textOnDark, fontSize: fonts.button, fontWeight: '800' },
});
