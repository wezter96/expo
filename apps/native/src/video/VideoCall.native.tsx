import { Ionicons } from '@expo/vector-icons';
import {
  AudioSession,
  isTrackReference,
  LiveKitRoom,
  registerGlobals,
  useLocalParticipant,
  useRoomContext,
  useTracks,
  VideoTrack,
} from '@livekit/react-native';
import { Track } from 'livekit-client';
import React, { useCallback, useEffect } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, fonts, radius, spacing } from '../theme';
import type { VideoCallProps } from './types';

// Wire WebRTC's globals into React Native (once).
registerGlobals();

/** Native (iOS/Android) group video call powered by a self-hosted LiveKit SFU. */
export function VideoCall({ token, url, name, startVideo, onLeave }: VideoCallProps) {
  useEffect(() => {
    let active = true;
    (async () => {
      if (active) await AudioSession.startAudioSession();
    })();
    return () => {
      active = false;
      AudioSession.stopAudioSession();
    };
  }, []);

  return (
    <LiveKitRoom serverUrl={url} token={token} connect audio video={startVideo} onDisconnected={onLeave}>
      <RoomView name={name} onLeave={onLeave} />
    </LiveKitRoom>
  );
}

function RoomView({ name, onLeave }: { name: string; onLeave: () => void }) {
  const insets = useSafeAreaInsets();
  const room = useRoomContext();
  const { isCameraEnabled, isMicrophoneEnabled, localParticipant } = useLocalParticipant();

  // Every participant's camera (with a placeholder tile for camera-off people).
  const tracks = useTracks([{ source: Track.Source.Camera, withPlaceholder: true }]);

  const leave = useCallback(async () => {
    try {
      await room.disconnect();
    } catch {
      // ignore — we're leaving anyway
    }
    onLeave();
  }, [room, onLeave]);

  return (
    <View style={styles.container}>
      <Text style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>{name}</Text>

      <View style={styles.grid}>
        {tracks.map((trackRef, i) => (
          <View key={i} style={styles.tile}>
            {isTrackReference(trackRef) ? (
              <VideoTrack trackRef={trackRef} style={styles.video} objectFit="cover" />
            ) : (
              <View style={styles.placeholder}>
                <Ionicons name="person" size={56} color={colors.textOnDark} />
              </View>
            )}
          </View>
        ))}
      </View>

      <View style={[styles.controls, { paddingBottom: insets.bottom + spacing.md }]}>
        <ControlButton
          icon={isMicrophoneEnabled ? 'mic' : 'mic-off'}
          label={isMicrophoneEnabled ? 'Mute' : 'Unmute'}
          off={!isMicrophoneEnabled}
          onPress={() => localParticipant.setMicrophoneEnabled(!isMicrophoneEnabled)}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Leave call"
          onPress={leave}
          style={({ pressed }) => [styles.leave, pressed && styles.pressed]}
        >
          <Ionicons name="call" size={38} color={colors.textOnDark} />
          <Text style={styles.leaveText}>Leave</Text>
        </Pressable>
        <ControlButton
          icon={isCameraEnabled ? 'videocam' : 'videocam-off'}
          label={isCameraEnabled ? 'Camera' : 'Camera off'}
          off={!isCameraEnabled}
          onPress={() => localParticipant.setCameraEnabled(!isCameraEnabled)}
        />
      </View>
    </View>
  );
}

function ControlButton({
  icon,
  label,
  off,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  off: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={styles.control}
    >
      <View style={[styles.controlCircle, off && styles.controlOff]}>
        <Ionicons name={icon} size={32} color={off ? colors.text : colors.textOnDark} />
      </View>
      <Text style={styles.controlLabel}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0A0F1A' },
  header: {
    color: colors.textOnDark,
    fontSize: fonts.title,
    fontWeight: '800',
    textAlign: 'center',
    paddingBottom: spacing.sm,
  },
  grid: {
    flex: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    padding: spacing.sm,
    gap: spacing.sm,
    justifyContent: 'center',
    alignContent: 'center',
  },
  tile: {
    flexGrow: 1,
    flexBasis: '45%',
    minHeight: 180,
    borderRadius: radius.lg,
    overflow: 'hidden',
    backgroundColor: '#1A2537',
  },
  video: { flex: 1 },
  placeholder: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primaryDark },
  controls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
  },
  control: { alignItems: 'center', gap: 6 },
  controlCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  controlOff: { backgroundColor: colors.textOnDark },
  controlLabel: { color: colors.textOnDark, fontSize: fonts.small, fontWeight: '700' },
  leave: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.danger,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: radius.pill,
    gap: 2,
  },
  pressed: { opacity: 0.85 },
  leaveText: { color: colors.textOnDark, fontSize: fonts.small, fontWeight: '800' },
});
