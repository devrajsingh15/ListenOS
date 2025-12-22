import { relations } from "drizzle-orm/relations";
import { users, commandHistory, subscriptions, userSettings } from "./schema";

export const commandHistoryRelations = relations(commandHistory, ({one}) => ({
	user: one(users, {
		fields: [commandHistory.userId],
		references: [users.id]
	}),
}));

export const usersRelations = relations(users, ({many}) => ({
	commandHistories: many(commandHistory),
	subscriptions: many(subscriptions),
	userSettings: many(userSettings),
}));

export const subscriptionsRelations = relations(subscriptions, ({one}) => ({
	user: one(users, {
		fields: [subscriptions.userId],
		references: [users.id]
	}),
}));

export const userSettingsRelations = relations(userSettings, ({one}) => ({
	user: one(users, {
		fields: [userSettings.userId],
		references: [users.id]
	}),
}));