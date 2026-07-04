import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

/** A person or group the user can message / call. */
export const contacts = sqliteTable("contacts", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  /** "Daughter", "Son", "Friend", "Doctor", "Group" — shown under the name. */
  relation: text("relation").notNull(),
  phone: text("phone").notNull().default(""),
  isGroup: integer("is_group", { mode: "boolean" }).notNull().default(false),
  /** JSON-encoded string[] of member first names, for groups. */
  memberNames: text("member_names"),
});

/** A single message in a conversation. */
export const messages = sqliteTable("messages", {
  id: text("id").primaryKey(),
  contactId: text("contact_id")
    .notNull()
    .references(() => contacts.id),
  text: text("text").notNull(),
  /** true = sent by the app's user, false = received. */
  mine: integer("mine", { mode: "boolean" }).notNull().default(false),
  /** epoch millis */
  at: integer("at").notNull(),
});

export type Contact = typeof contacts.$inferSelect;
export type Message = typeof messages.$inferSelect;
