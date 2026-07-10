import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React from 'react';
import { Alert, Pressable } from 'react-native';
import { useTranslation } from '../i18n';
import { colors } from '../theme';

/** Header "+" that lets the user add a person, start a group, or join one. */
export function AddButton() {
  const router = useRouter();
  const { t } = useTranslation();

  const open = () => {
    Alert.alert(t('messages.addTitle'), t('messages.addPrompt'), [
      { text: t('messages.addPerson'), onPress: () => router.push('/new-chat') },
      { text: t('messages.newGroup'), onPress: () => router.push('/new-group') },
      { text: t('messages.joinGroup'), onPress: () => router.push('/join') },
      { text: t('common.cancel'), style: 'cancel' },
    ]);
  };

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t('messages.addTitle')}
      onPress={open}
      hitSlop={12}
      style={{ paddingRight: 12 }}
    >
      <Ionicons name="add-circle" size={34} color={colors.textOnDark} />
    </Pressable>
  );
}
