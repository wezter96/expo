import { Ionicons } from '@expo/vector-icons';
import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, fonts, spacing } from '../theme';

function fmt(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, '0')}`;
}

/** A tap-to-play voice message with a progress bar. */
export function VoicePlayer({
  uri,
  mine,
  duration,
}: {
  uri?: string;
  mine: boolean;
  duration?: number;
}) {
  const player = useAudioPlayer(uri ? { uri } : undefined);
  const status = useAudioPlayerStatus(player);

  const total = status.duration || duration || 0;
  const current = status.currentTime || 0;
  const playing = status.playing;
  const progress = total > 0 ? Math.min(1, current / total) : 0;
  const fg = mine ? colors.textOnDark : colors.primary;
  const track = mine ? 'rgba(255,255,255,0.35)' : colors.border;

  const toggle = () => {
    if (!uri) return;
    if (playing) {
      player.pause();
    } else {
      if (status.didJustFinish || (total > 0 && current >= total - 0.1)) player.seekTo(0);
      player.play();
    }
  };

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={playing ? 'Pause voice message' : 'Play voice message'}
      onPress={toggle}
      style={styles.row}
    >
      <Ionicons name={playing ? 'pause-circle' : 'play-circle'} size={40} color={fg} />
      <View style={styles.middle}>
        <View style={[styles.track, { backgroundColor: track }]}>
          <View style={[styles.fill, { width: `${progress * 100}%`, backgroundColor: fg }]} />
        </View>
        <Text style={[styles.time, { color: fg }]}>{fmt(playing || current > 0 ? current : total)}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minWidth: 180 },
  middle: { flex: 1, gap: 6 },
  track: { height: 6, borderRadius: 3, overflow: 'hidden' },
  fill: { height: 6, borderRadius: 3 },
  time: { fontSize: fonts.small - 2, fontWeight: '700' },
});
