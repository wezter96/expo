import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import type { Reminder } from './api/pocketbase';

/**
 * On-device scheduling for reminders. Medication reminders fire daily at a
 * chosen time; appointments fire once (plus an hour-before nudge). The OS keeps
 * these across app launches, so we only (re)schedule on create/delete and keep
 * a reminderId → notification-id map to cancel cleanly.
 */
const MAP_KEY = 'kinly.reminderNotifs.v1';
type NotifMap = Record<string, string[]>;

async function readMap(): Promise<NotifMap> {
  try {
    const raw = await AsyncStorage.getItem(MAP_KEY);
    return raw ? (JSON.parse(raw) as NotifMap) : {};
  } catch {
    return {};
  }
}

async function writeMap(m: NotifMap): Promise<void> {
  await AsyncStorage.setItem(MAP_KEY, JSON.stringify(m)).catch(() => {});
}

function parseHM(time: string): { hour: number; minute: number } {
  const [h, m] = (time || '').split(':').map((x) => parseInt(x, 10));
  return { hour: Number.isFinite(h) ? h : 9, minute: Number.isFinite(m) ? m : 0 };
}

export async function cancelReminder(id: string): Promise<void> {
  if (Platform.OS === 'web') return;
  const map = await readMap();
  for (const nid of map[id] || []) {
    try {
      await Notifications.cancelScheduledNotificationAsync(nid);
    } catch {
      // already gone
    }
  }
  delete map[id];
  await writeMap(map);
}

export async function scheduleReminder(r: Reminder): Promise<void> {
  if (Platform.OS === 'web') return;
  await cancelReminder(r.id);
  if (!r.enabled) return;
  const { hour, minute } = parseHM(r.time);
  const ids: string[] = [];
  try {
    if (r.kind === 'medication') {
      const id = await Notifications.scheduleNotificationAsync({
        content: { title: 'Time for your medication', body: r.title, sound: true, data: { reminderId: r.id } },
        trigger: { type: Notifications.SchedulableTriggerInputTypes.DAILY, hour, minute },
      });
      ids.push(id);
    } else if (r.date) {
      const hh = String(hour).padStart(2, '0');
      const mm = String(minute).padStart(2, '0');
      const at = new Date(`${r.date}T${hh}:${mm}:00`);
      if (at.getTime() > Date.now()) {
        ids.push(
          await Notifications.scheduleNotificationAsync({
            content: { title: 'Appointment', body: r.title, sound: true, data: { reminderId: r.id } },
            trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: at },
          })
        );
        const hourBefore = new Date(at.getTime() - 60 * 60 * 1000);
        if (hourBefore.getTime() > Date.now()) {
          ids.push(
            await Notifications.scheduleNotificationAsync({
              content: { title: 'Appointment soon', body: `In 1 hour: ${r.title}`, sound: true, data: { reminderId: r.id } },
              trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: hourBefore },
            })
          );
        }
      }
    }
  } catch {
    // scheduling can fail without permission / on unsupported platforms
  }
  const map = await readMap();
  map[r.id] = ids;
  await writeMap(map);
}
