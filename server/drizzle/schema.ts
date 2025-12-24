import { pgTable, unique, uuid, text, timestamp, foreignKey, boolean } from "drizzle-orm/pg-core"



export const users = pgTable("users", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	clerkUserId: text("clerk_user_id").notNull(),
	email: text().notNull(),
	firstName: text("first_name"),
	lastName: text("last_name"),
	profilePicture: text("profile_picture"),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	unique("users_clerk_user_id_unique").on(table.clerkUserId),
	unique("users_email_unique").on(table.email),
]);

export const commandHistory = pgTable("command_history", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	userId: uuid("user_id").notNull(),
	command: text().notNull(),
	actionType: text("action_type").notNull(),
	success: boolean().notNull(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	foreignKey({
			columns: [table.userId],
			foreignColumns: [users.id],
			name: "command_history_user_id_users_id_fk"
		}).onDelete("cascade"),
]);

export const subscriptions = pgTable("subscriptions", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	userId: uuid("user_id").notNull(),
	plan: text().default('free').notNull(),
	status: text().default('active').notNull(),
	stripeCustomerId: text("stripe_customer_id"),
	stripeSubscriptionId: text("stripe_subscription_id"),
	expiresAt: timestamp("expires_at", { mode: 'string' }),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	foreignKey({
			columns: [table.userId],
			foreignColumns: [users.id],
			name: "subscriptions_user_id_users_id_fk"
		}).onDelete("cascade"),
	unique("subscriptions_user_id_unique").on(table.userId),
]);

export const userSettings = pgTable("user_settings", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	userId: uuid("user_id").notNull(),
	hotkey: text().default('Control+Space').notNull(),
	language: text().default('en').notNull(),
	startOnLogin: boolean("start_on_login").default(true).notNull(),
	showInTray: boolean("show_in_tray").default(true).notNull(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	foreignKey({
			columns: [table.userId],
			foreignColumns: [users.id],
			name: "user_settings_user_id_users_id_fk"
		}).onDelete("cascade"),
	unique("user_settings_user_id_unique").on(table.userId),
]);
