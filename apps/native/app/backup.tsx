import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import React, { useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { openBackup, sealBackup } from '../src/crypto/backup-core';
import { useTranslation } from '../src/i18n';
import { useStore } from '../src/store';
import { type Colors, type Fonts, radius, spacing, TAP_TARGET } from '../src/theme';
import { useTheme } from '../src/theme-context';

const MIN_PASS = 6;

/** Encrypted chat backup: export everything to a passphrase-locked file via
 *  the share sheet, or restore (merge) from one. The file is sealed on the
 *  device — without the passphrase it is unreadable. */
export default function Backup() {
  const insets = useSafeAreaInsets();
  const { colors, fonts } = useTheme();
  const { t } = useTranslation();
  const { exportSnapshot, restoreSnapshot } = useStore();
  const styles = useMemo(() => makeStyles(colors, fonts), [colors, fonts]);
  const [pass, setPass] = useState('');
  const [busy, setBusy] = useState(false);

  const ready = pass.trim().length >= MIN_PASS;
  const supported = Platform.OS !== 'web';

  const doExport = async () => {
    if (!ready || busy) return;
    setBusy(true);
    try {
      const snapshot = { version: 1, app: 'kinly', at: new Date().toISOString(), ...exportSnapshot() };
      const blob = sealBackup(JSON.stringify(snapshot), pass);
      const stamp = new Date().toISOString().slice(0, 10);
      const uri = `${FileSystem.cacheDirectory}kinly-backup-${stamp}.kinlybackup`;
      await FileSystem.writeAsStringAsync(uri, blob);
      await Sharing.shareAsync(uri, { mimeType: 'application/octet-stream', dialogTitle: t('backup.title') });
    } catch {
      Alert.alert(t('backup.title'), t('backup.exportError'));
    } finally {
      setBusy(false);
    }
  };

  const doImport = async () => {
    if (!ready || busy) return;
    setBusy(true);
    try {
      const picked = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true });
      const uri = picked.assets?.[0]?.uri;
      if (picked.canceled || !uri) return;
      const blob = await FileSystem.readAsStringAsync(uri);
      const json = openBackup(blob, pass);
      const data = JSON.parse(json) as { app?: string; contacts?: never[]; messages?: never[] };
      if (data.app !== 'kinly') throw new Error('not kinly');
      const added = restoreSnapshot(data);
      Alert.alert(t('backup.title'), t('backup.restored', { count: added }));
    } catch {
      Alert.alert(t('backup.title'), t('backup.importError'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + spacing.xl }]}>
      <View style={styles.note}>
        <Ionicons name="lock-closed" size={20} color={colors.accent} />
        <Text style={styles.noteText}>{t('backup.note')}</Text>
      </View>

      <Text style={styles.label}>{t('backup.passphrase')}</Text>
      <TextInput
        style={styles.input}
        value={pass}
        onChangeText={setPass}
        placeholder={t('backup.passphraseHint')}
        placeholderTextColor={colors.textMuted}
        autoCapitalize="none"
        autoCorrect={false}
      />

      {!supported ? <Text style={styles.muted}>{t('backup.webUnsupported')}</Text> : null}

      <Pressable
        accessibilityRole="button"
        onPress={doExport}
        disabled={!ready || busy || !supported}
        style={({ pressed }) => [styles.primary, (!ready || busy || pressed || !supported) && styles.dim]}
      >
        {busy ? (
          <ActivityIndicator color={colors.textOnDark} />
        ) : (
          <>
            <Ionicons name="download" size={24} color={colors.textOnDark} />
            <Text style={styles.primaryText}>{t('backup.export')}</Text>
          </>
        )}
      </Pressable>

      <Pressable
        accessibilityRole="button"
        onPress={doImport}
        disabled={!ready || busy || !supported}
        style={({ pressed }) => [styles.secondary, (!ready || busy || pressed || !supported) && styles.dim]}
      >
        <Ionicons name="folder-open" size={24} color={colors.primary} />
        <Text style={styles.secondaryText}>{t('backup.import')}</Text>
      </Pressable>
    </ScrollView>
  );
}

function makeStyles(colors: Colors, fonts: Fonts) {
  return StyleSheet.create({
    content: { padding: spacing.md, gap: spacing.md },
    note: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, padding: spacing.md, backgroundColor: colors.bubbleTheirs, borderRadius: radius.md },
    noteText: { flex: 1, fontSize: fonts.small, color: colors.text, fontWeight: '600' },
    label: { fontSize: fonts.body, fontWeight: '800', color: colors.text },
    muted: { fontSize: fonts.body, color: colors.textMuted, textAlign: 'center' },
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
    primary: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.sm,
      minHeight: TAP_TARGET + 4,
      backgroundColor: colors.accent,
      borderRadius: radius.lg,
    },
    primaryText: { fontSize: fonts.button, fontWeight: '800', color: colors.textOnDark },
    secondary: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.sm,
      minHeight: TAP_TARGET + 4,
      borderRadius: radius.lg,
      borderWidth: 2,
      borderColor: colors.border,
      backgroundColor: colors.card,
    },
    secondaryText: { fontSize: fonts.button, fontWeight: '800', color: colors.primary },
    dim: { opacity: 0.6 },
  });
}
