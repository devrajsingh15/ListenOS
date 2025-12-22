import { pgTable, text, timestamp, boolean, uuid } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

// Users table - stores user info from Clerk
export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),
  clerkUserId: text("clerk_user_id").unique().notNull(),
  email: text("email").unique().notNull(),
  firstName: text("first_name"),
  lastName: text("last_name"),
  profilePicture: text("profile_picture"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Subscriptions table - tracks user subscription status
export const subscriptions = pgTable("subscriptions", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id")
    .references(() => users.id, { onDelete: "cascade" })
    .unique()
    .notNull(),
  plan: text("plan").default("free").notNull(), // free, pro, team
  status: text("status").default("active").notNull(), // active, cancelled, expired
  stripeCustomerId: text("stripe_customer_id"),
  stripeSubscriptionId: text("stripe_subscription_id"),
  expiresAt: timestamp("expires_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// User settings table - stores user preferences
export const userSettings = pgTable("user_settings", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id")
    .references(() => users.id, { onDelete: "cascade" })
    .unique()
    .notNull(),
  hotkey: text("hotkey").default("Control+Space").notNull(),
  language: text("language").default("en").notNull(),
  startOnLogin: boolean("start_on_login").default(true).notNull(),
  showInTray: boolean("show_in_tray").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Command history table - tracks voice commands
export const commandHistory = pgTable("command_history", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id")
    .references(() => users.id, { onDelete: "cascade" })
    .notNull(),
  command: text("command").notNull(),
  actionType: text("action_type").notNull(),
  success: boolean("success").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Define relations
export const usersRelations = relations(users, ({ one, many }) => ({
  subscription: one(subscriptions, {
    fields: [users.id],
    references: [subscriptions.userId],
  }),
  settings: one(userSettings, {
    fields: [users.id],
    references: [userSettings.userId],
  }),
  commandHistory: many(commandHistory),
}));

export const subscriptionsRelations = relations(subscriptions, ({ one }) => ({
  user: one(users, {
    fields: [subscriptions.userId],
    references: [users.id],
  }),
}));

export const userSettingsRelations = relations(userSettings, ({ one }) => ({
  user: one(users, {
    fields: [userSettings.userId],
    references: [users.id],
  }),
}));

export const commandHistoryRelations = relations(commandHistory, ({ one }) => ({
  user: one(users, {
    fields: [commandHistory.userId],
    references: [users.id],
  }),
}));

// Type exports
export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Subscription = typeof subscriptions.$inferSelect;
export type NewSubscription = typeof subscriptions.$inferInsert;
export type UserSettings = typeof userSettings.$inferSelect;
export type NewUserSettings = typeof userSettings.$inferInsert;
export type CommandHistory = typeof commandHistory.$inferSelect;
export type NewCommandHistory = typeof commandHistory.$inferInsert;
