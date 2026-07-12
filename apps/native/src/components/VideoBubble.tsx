import { useVideoPlayer, VideoView } from 'expo-video';
import React from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

/** Inline video player for chat bubbles. `uri` is a local (already decrypted)
 *  or remote plain file; native controls keep it familiar and big. */
export function VideoBubble({ uri }: { uri?: string }) {
  const player = useVideoPlayer(uri ?? null);
  if (!uri) {
    return (
      <View style={[styles.video, styles.loading]}>
        <ActivityIndicator />
      </View>
    );
  }
  return <VideoView player={player} style={styles.video} nativeControls contentFit="cover" />;
}

const styles = StyleSheet.create({
  video: { width: 230, height: 230, borderRadius: 14, backgroundColor: '#000' },
  loading: { alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.1)' },
});
