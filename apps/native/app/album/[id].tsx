import { Ionicons } from '@expo/vector-icons';
import { Stack, useLocalSearchParams } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { Dimensions, FlatList, Image, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from '../../src/i18n';
import { useDecryptedUri } from '../../src/media';
import { useStore } from '../../src/store';
import { type Colors, type Fonts, radius, spacing } from '../../src/theme';
import { useTheme } from '../../src/theme-context';
import { Message } from '../../src/types';

const GAP = 3;
const COLS = 3;

/**
 * A shared photo album for a conversation: every image ever sent in the
 * chat, newest first, in a simple tap-to-enlarge grid. Encrypted photos are
 * decrypted on the fly (same path the chat bubbles use).
 */
export default function Album() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors, fonts } = useTheme();
  const { t } = useTranslation();
  const { getContact, messagesFor } = useStore();
  const styles = useMemo(() => makeStyles(colors, fonts), [colors, fonts]);
  const [viewing, setViewing] = useState<string | null>(null);

  const contact = id ? getContact(id) : undefined;
  const photos = useMemo(
    () => (id ? messagesFor(id).filter((m) => m.kind === 'photo' && m.imageUrl) : []).slice().reverse(),
    [id, messagesFor]
  );

  const size = (Dimensions.get('window').width - GAP * (COLS - 1)) / COLS;

  return (
    <View style={styles.flex}>
      <Stack.Screen options={{ title: t('album.title') }} />
      {photos.length === 0 ? (
        <View style={styles.empty}>
          <Ionicons name="images-outline" size={64} color={colors.textMuted} />
          <Text style={styles.emptyTitle}>{t('album.empty')}</Text>
          <Text style={styles.emptyBody}>{t('album.emptyBody', { name: contact?.name ?? '' })}</Text>
        </View>
      ) : (
        <FlatList
          data={photos}
          keyExtractor={(m) => m.id}
          numColumns={COLS}
          columnWrapperStyle={{ gap: GAP }}
          contentContainerStyle={{ gap: GAP }}
          renderItem={({ item }) => (
            <Thumb message={item} size={size} onOpen={setViewing} />
          )}
        />
      )}

      <Modal visible={!!viewing} transparent animationType="fade" onRequestClose={() => setViewing(null)}>
        <Pressable style={styles.viewer} onPress={() => setViewing(null)}>
          {viewing ? <Image source={{ uri: viewing }} style={styles.full} resizeMode="contain" /> : null}
          <View style={[styles.closeBtn, { top: spacing.xl }]}>
            <Ionicons name="close" size={30} color="#fff" />
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

function Thumb({ message, size, onOpen }: { message: Message; size: number; onOpen: (uri: string) => void }) {
  const { colors } = useTheme();
  const uri = useDecryptedUri(message.imageUrl, message.mediaKey, 'jpg');
  return (
    <Pressable
      accessibilityRole="imagebutton"
      accessibilityLabel="Open photo"
      disabled={!uri}
      onPress={() => uri && onOpen(uri)}
      style={{ width: size, height: size, backgroundColor: colors.card }}
    >
      {uri ? <Image source={{ uri }} style={{ width: size, height: size }} /> : null}
    </Pressable>
  );
}

function makeStyles(colors: Colors, fonts: Fonts) {
  return StyleSheet.create({
    flex: { flex: 1, backgroundColor: colors.background },
    empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.sm, padding: spacing.xl },
    emptyTitle: { fontSize: fonts.title, fontWeight: '800', color: colors.text, marginTop: spacing.sm },
    emptyBody: { fontSize: fonts.body, color: colors.textMuted, textAlign: 'center', lineHeight: fonts.body + 8 },
    viewer: { flex: 1, backgroundColor: 'rgba(0,0,0,0.95)', alignItems: 'center', justifyContent: 'center' },
    full: { width: '100%', height: '100%' },
    closeBtn: {
      position: 'absolute',
      right: spacing.lg,
      width: 44,
      height: 44,
      borderRadius: radius.pill,
      backgroundColor: 'rgba(0,0,0,0.5)',
      alignItems: 'center',
      justifyContent: 'center',
    },
  });
}
