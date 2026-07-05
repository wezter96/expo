import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { colorForName, colors, initialsForName } from '../theme';

export function Avatar({
  name,
  size = 64,
  isGroup = false,
  uri,
}: {
  name: string;
  size?: number;
  isGroup?: boolean;
  /** Optional profile photo URL. Falls back to initials / a group icon. */
  uri?: string;
}) {
  const radius = size / 2;

  if (uri) {
    return <Image source={{ uri }} style={{ width: size, height: size, borderRadius: radius }} />;
  }

  return (
    <View
      style={[styles.avatar, { width: size, height: size, borderRadius: radius, backgroundColor: colorForName(name) }]}
    >
      {isGroup ? (
        <Ionicons name="people" size={size * 0.5} color={colors.textOnDark} />
      ) : (
        <Text style={[styles.initials, { fontSize: size * 0.4 }]}>{initialsForName(name)}</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  avatar: { alignItems: 'center', justifyContent: 'center' },
  initials: { color: colors.textOnDark, fontWeight: '800' },
});
