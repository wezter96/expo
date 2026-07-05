import { Ionicons } from '@expo/vector-icons';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { fetchVideoToken, type VideoToken } from '../../src/api/pocketbase';
import { useStore } from '../../src/store';
import { VideoCall } from '../../src/video/VideoCall';
import { colors, fonts, radius, spacing } from '../../src/theme';

type Phase = 'loading' | 'ready' | 'unavailable';

export default function CallScreen() {
  const { id, mode } = useLocalSearchParams<{ id: string; mode?: string }>();
  const router = useRouter();
  const { getContact } = useStore();

  const startVideo = mode !== 'voice';
  const kind = startVideo ? 'video' : 'voice';
  const contact = id ? getContact(id) : undefined;
  const [phase, setPhase] = useState<Phase>('loading');
  const [creds, setCreds] = useState<VideoToken | null>(null);

  useEffect(() => {
    if (!id) return;
    let active = true;
    (async () => {
      const token = await fetchVideoToken(id);
      if (!active) return;
      if (token) {
        setCreds(token);
        setPhase('ready');
      } else {
        setPhase('unavailable');
      }
    })();
    return () => {
      active = false;
    };
  }, [id]);

  const leave = () => (router.canGoBack() ? router.back() : router.replace('/'));

  if (phase === 'ready' && creds) {
    return (
      <>
        <Stack.Screen options={{ headerShown: false }} />
        <VideoCall
          token={creds.token}
          url={creds.url}
          name={contact?.name ?? 'Call'}
          startVideo={startVideo}
          onLeave={leave}
        />
      </>
    );
  }

  return (
    <View style={styles.center}>
      <Stack.Screen options={{ headerShown: false }} />
      {phase === 'loading' ? (
        <>
          <ActivityIndicator size="large" color={colors.textOnDark} />
          <Text style={styles.text}>Connecting your {kind} call…</Text>
        </>
      ) : (
        <>
          <Ionicons name="videocam-off" size={64} color={colors.textOnDark} />
          <Text style={styles.title}>Video call isn't available</Text>
          <Text style={styles.text}>
            Connect a Kinly server with video set up to make calls. You can still message and phone
            for now.
          </Text>
        </>
      )}
      <Pressable onPress={leave} style={({ pressed }) => [styles.button, pressed && styles.pressed]}>
        <Text style={styles.buttonText}>Go back</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    backgroundColor: colors.primaryDark,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
    gap: spacing.md,
  },
  title: { fontSize: fonts.title, fontWeight: '800', color: colors.textOnDark, textAlign: 'center' },
  text: { fontSize: fonts.body, color: '#D6E5F5', textAlign: 'center', lineHeight: fonts.body + 8 },
  button: {
    marginTop: spacing.lg,
    backgroundColor: colors.primary,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xl,
    borderRadius: radius.pill,
  },
  pressed: { opacity: 0.85 },
  buttonText: { fontSize: fonts.button, fontWeight: '800', color: colors.textOnDark },
});
