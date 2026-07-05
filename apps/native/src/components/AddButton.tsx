import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React from 'react';
import { Alert, Pressable } from 'react-native';
import { colors } from '../theme';

/** Header "+" that lets the user add a person or start a group. */
export function AddButton() {
  const router = useRouter();

  const open = () => {
    Alert.alert('Add', 'What would you like to do?', [
      { text: 'Add a person', onPress: () => router.push('/new-chat') },
      { text: 'New group', onPress: () => router.push('/new-group') },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Add a person or group"
      onPress={open}
      hitSlop={12}
      style={{ paddingRight: 12 }}
    >
      <Ionicons name="add-circle" size={34} color={colors.textOnDark} />
    </Pressable>
  );
}
