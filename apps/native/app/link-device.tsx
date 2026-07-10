import { Ionicons } from '@expo/vector-icons';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useRouter } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { publishE2EEKeys } from '../src/api/pocketbase';
import { e2eeSupported } from '../src/crypto/identity';
import { importLinkCode, makeLinkCode } from '../src/crypto/linking';
import { type Colors, type Fonts, radius, spacing, TAP_TARGET } from '../src/theme';
import { useTheme } from '../src/theme-context';

type Mode = 'menu' | 'show' | 'scan';

export default function LinkDevice() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors, fonts } = useTheme();
  const styles = useMemo(() => makeStyles(colors, fonts), [colors, fonts]);
  const [mode, setMode] = useState<Mode>('menu');

  if (!e2eeSupported) {
    return (
      <View style={styles.center}>
        <Ionicons name="phone-portrait" size={56} color={colors.primary} />
        <Text style={styles.h1}>Link a device</Text>
        <Text style={styles.body}>Device linking is available in the Kinly phone and desktop apps.</Text>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + spacing.xl }]}>
      {mode === 'menu' ? (
        <Menu styles={styles} colors={colors} onShow={() => setMode('show')} onScan={() => setMode('scan')} />
      ) : mode === 'show' ? (
        <ShowCode styles={styles} colors={colors} />
      ) : (
        <ScanCode styles={styles} colors={colors} onDone={() => router.back()} />
      )}
    </ScrollView>
  );
}

function Menu({
  styles,
  colors,
  onShow,
  onScan,
}: {
  styles: ReturnType<typeof makeStyles>;
  colors: Colors;
  onShow: () => void;
  onScan: () => void;
}) {
  return (
    <>
      <View style={styles.hero}>
        <Ionicons name="qr-code" size={44} color={colors.primary} />
        <Text style={styles.h1}>Add another device</Text>
        <Text style={styles.body}>Use two devices together — your phone, a tablet, or the computer app.</Text>
      </View>
      <Pressable accessibilityRole="button" onPress={onShow} style={({ pressed }) => [styles.primary, pressed && styles.dim]}>
        <Ionicons name="qr-code" size={24} color={colors.textOnDark} />
        <Text style={styles.primaryText}>Show my code</Text>
      </Pressable>
      <Text style={styles.hint}>On the device you already use — it shows a code for the new device to scan.</Text>
      <Pressable accessibilityRole="button" onPress={onScan} style={({ pressed }) => [styles.secondary, pressed && styles.dim]}>
        <Ionicons name="scan" size={24} color={colors.primary} />
        <Text style={styles.secondaryText}>Scan a code</Text>
      </Pressable>
      <Text style={styles.hint}>On the new device — point its camera at the code on your other device.</Text>
    </>
  );
}

function ShowCode({ styles, colors }: { styles: ReturnType<typeof makeStyles>; colors: Colors }) {
  const [data, setData] = useState<{ code: string; pin: string } | null>(null);
  useEffect(() => {
    makeLinkCode()
      .then(setData)
      .catch(() => setData(null));
  }, []);

  if (!data) {
    return (
      <View style={styles.hero}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }
  return (
    <View style={styles.hero}>
      <Text style={styles.h1}>Scan this on your new device</Text>
      <View style={styles.qrBox}>
        <QRCode value={data.code} size={230} backgroundColor="#FFFFFF" color="#000000" />
      </View>
      <Text style={styles.body}>Then type this number on the new device:</Text>
      <Text style={styles.pin}>{data.pin}</Text>
      <Text style={styles.hint}>This code works once and expires soon. Never share it with anyone else.</Text>
    </View>
  );
}

function ScanCode({
  styles,
  colors,
  onDone,
}: {
  styles: ReturnType<typeof makeStyles>;
  colors: Colors;
  onDone: () => void;
}) {
  const [permission, requestPermission] = useCameraPermissions();
  const [code, setCode] = useState<string | null>(null);
  const [pin, setPin] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (permission && !permission.granted) void requestPermission();
  }, [permission, requestPermission]);

  const submit = async () => {
    if (!code) return;
    setBusy(true);
    setError(null);
    try {
      await importLinkCode(code, pin);
      await publishE2EEKeys();
      Alert.alert('Device linked', 'This device can now read your encrypted messages.');
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not link the device.');
      setCode(null); // let them re-scan
    } finally {
      setBusy(false);
    }
  };

  if (!permission?.granted) {
    return (
      <View style={styles.hero}>
        <Ionicons name="camera" size={44} color={colors.primary} />
        <Text style={styles.h1}>Camera needed</Text>
        <Text style={styles.body}>Please allow camera access so you can scan the code on your other device.</Text>
        <Pressable accessibilityRole="button" onPress={requestPermission} style={styles.primary}>
          <Text style={styles.primaryText}>Allow camera</Text>
        </Pressable>
      </View>
    );
  }

  if (!code) {
    return (
      <View style={styles.hero}>
        <Text style={styles.h1}>Point at the code</Text>
        <View style={styles.cameraBox}>
          <CameraView
            style={StyleSheet.absoluteFill}
            barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
            onBarcodeScanned={({ data }) => data && setCode(data)}
          />
        </View>
        <Text style={styles.hint}>Line the square up with the code on your other device.</Text>
      </View>
    );
  }

  return (
    <View style={styles.hero}>
      <Ionicons name="checkmark-circle" size={44} color={colors.accent} />
      <Text style={styles.h1}>Enter the number</Text>
      <Text style={styles.body}>Type the 6-digit number shown on your other device.</Text>
      <TextInput
        style={styles.pinInput}
        value={pin}
        onChangeText={setPin}
        placeholder="000000"
        placeholderTextColor={colors.textMuted}
        keyboardType="number-pad"
        maxLength={6}
        autoFocus
      />
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <Pressable
        accessibilityRole="button"
        onPress={submit}
        disabled={busy || pin.length < 6}
        style={({ pressed }) => [styles.primary, (busy || pin.length < 6 || pressed) && styles.dim]}
      >
        {busy ? <ActivityIndicator color={colors.textOnDark} /> : <Text style={styles.primaryText}>Link this device</Text>}
      </Pressable>
    </View>
  );
}

function makeStyles(colors: Colors, fonts: Fonts) {
  return StyleSheet.create({
    content: { padding: spacing.lg, gap: spacing.md },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md, padding: spacing.lg, backgroundColor: colors.background },
    hero: { alignItems: 'center', gap: spacing.md },
    h1: { fontSize: fonts.title, fontWeight: '800', color: colors.text, textAlign: 'center' },
    body: { fontSize: fonts.body, color: colors.textMuted, textAlign: 'center', lineHeight: fonts.body + 8 },
    hint: { fontSize: fonts.small, color: colors.textMuted, textAlign: 'center', lineHeight: fonts.small + 6 },
    qrBox: { backgroundColor: '#FFFFFF', padding: spacing.md, borderRadius: radius.lg, borderWidth: 2, borderColor: colors.border },
    pin: { fontSize: fonts.huge + 6, fontWeight: '800', color: colors.primary, letterSpacing: 6 },
    pinInput: {
      fontSize: fonts.huge,
      fontWeight: '800',
      color: colors.text,
      letterSpacing: 8,
      textAlign: 'center',
      minWidth: 220,
      minHeight: TAP_TARGET + 16,
      borderWidth: 2,
      borderColor: colors.border,
      borderRadius: radius.md,
      backgroundColor: colors.card,
    },
    cameraBox: { width: 260, height: 260, borderRadius: radius.lg, overflow: 'hidden', backgroundColor: '#000', borderWidth: 3, borderColor: colors.primary },
    error: { fontSize: fonts.body, color: colors.danger, fontWeight: '700', textAlign: 'center' },
    primary: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.sm,
      minHeight: TAP_TARGET,
      paddingHorizontal: spacing.lg,
      borderRadius: radius.lg,
      backgroundColor: colors.primary,
    },
    primaryText: { fontSize: fonts.button, fontWeight: '800', color: colors.textOnDark },
    secondary: {
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
    secondaryText: { fontSize: fonts.button, fontWeight: '800', color: colors.primary },
    dim: { opacity: 0.6 },
  });
}
