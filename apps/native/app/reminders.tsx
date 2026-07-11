import React from 'react';
import { ScrollView, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { createReminder, deleteReminder, fetchReminders, markReminderDone } from '../src/api/pocketbase';
import { RemindersManager } from '../src/components/RemindersManager';
import { cancelReminder, scheduleReminder, syncReminderSchedules } from '../src/reminders';
import { spacing } from '../src/theme';

/** The user's own reminders. Schedules on-device notifications and picks up any
 *  reminders a guardian added remotely (syncReminderSchedules). */
export default function Reminders() {
  const insets = useSafeAreaInsets();
  return (
    <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + spacing.xl }]}>
      <RemindersManager
        load={async () => {
          await syncReminderSchedules();
          return fetchReminders();
        }}
        create={createReminder}
        afterCreate={scheduleReminder}
        remove={async (r) => {
          await deleteReminder(r.id);
          await cancelReminder(r.id);
        }}
        onDone={async (r) => {
          await markReminderDone(r.id);
        }}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.md, gap: spacing.sm },
});
