import { sql } from "drizzle-orm";

import { db } from "./index";
import { contacts, messages } from "./schema";

/**
 * Sample family/friends data. IDs are kept identical to the mobile app's
 * offline seed (apps/native/src/seed.ts) so a contact resolved by the server
 * lines up with the same contact on the device.
 */
const seedContacts = [
  { id: "c_mary", name: "Mary Johnson", relation: "Daughter", phone: "+15550101", isGroup: false, memberNames: null },
  { id: "c_tom", name: "Tom Johnson", relation: "Son", phone: "+15550102", isGroup: false, memberNames: null },
  { id: "c_ellen", name: "Ellen Brooks", relation: "Friend", phone: "+15550103", isGroup: false, memberNames: null },
  { id: "c_david", name: "Dr. David Reed", relation: "Doctor", phone: "+15550104", isGroup: false, memberNames: null },
  {
    id: "g_family",
    name: "Family",
    relation: "Group",
    phone: "",
    isGroup: true,
    memberNames: JSON.stringify(["Mary", "Tom", "Ellen"]),
  },
];

/** Seed the database once, only if it is currently empty. */
export async function seedIfEmpty(): Promise<void> {
  const existing = await db.select({ count: sql<number>`count(*)` }).from(contacts);
  if ((existing[0]?.count ?? 0) > 0) return;

  await db.insert(contacts).values(seedContacts);

  const now = Date.now();
  const min = 60 * 1000;
  await db.insert(messages).values([
    { id: "m1", contactId: "c_mary", text: "Hi Mom! How are you feeling today?", mine: false, at: now - 40 * min },
    { id: "m2", contactId: "c_mary", text: "Much better, thank you dear.", mine: true, at: now - 38 * min },
    { id: "m3", contactId: "c_mary", text: "I will pop by on Sunday with the kids.", mine: false, at: now - 20 * min },
    { id: "m4", contactId: "g_family", text: "Dinner at ours this weekend?", mine: false, at: now - 3 * 60 * min },
    { id: "m5", contactId: "g_family", text: "Sounds lovely!", mine: true, at: now - 2 * 60 * min },
    { id: "m6", contactId: "c_ellen", text: "Are we still on for cards Thursday?", mine: false, at: now - 26 * 60 * min },
  ]);
}
