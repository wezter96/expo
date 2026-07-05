import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { savePushToken, serverEnabled } from './api/pocketbase';

// Show incoming notifications while the app is foregrounded.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

/**
 * Ask for notification permission, get this device's Expo push token, and save
 * it to the user's record so the server can notify them of new messages.
 *
 * Requires a real device and an EAS project id (set automatically once you run
 * `eas init`). It fails quietly in Expo Go / on web / without a project id.
 */
export async function registerForPush(): Promise<void> {
  if (!serverEnabled() || !Device.isDevice || Platform.OS === 'web') return;

  try {
    const existing = await Notifications.getPermissionsAsync();
    let status = existing.status;
    if (status !== 'granted') {
      status = (await Notifications.requestPermissionsAsync()).status;
    }
    if (status !== 'granted') return;

    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'Messages',
        importance: Notifications.AndroidImportance.HIGH,
      });
    }

    const projectId =
      Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId ?? undefined;
    const token = await Notifications.getExpoPushTokenAsync(projectId ? { projectId } : undefined);
    await savePushToken(token.data);
  } catch {
    // No project id yet, or permission problem — push simply stays off.
  }
}
