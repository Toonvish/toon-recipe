/**
 * Complete Drizzle (libSQL/SQLite) schema for toon-recipe.
 *
 * Conventions
 * - ids: crypto.randomUUID() text primary keys
 * - timestamps: integer unix MILLISECONDS (exposed as ISO strings by the API)
 * - booleans: integer 0/1 via mode: "boolean"
 * - every FK used for listing has an index; group-scoped tables cascade from `groups`
 *
 * Authorship columns (`created_by`, `invited_by`) cascade on user deletion. A future
 * "Konto löschen" flow MUST first transfer ownership/authorship inside shared groups,
 * otherwise the group would lose those rows — see docs/API.md.
 */
import type { ImportSourceMeta, ParsedRecipe } from "@toon/shared";
import { relations } from "drizzle-orm";
import { index, integer, primaryKey, real, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

const now = () => Date.now();

/* -------------------------------------------------------------------------- */
/* users / auth                                                               */
/* -------------------------------------------------------------------------- */

export const users = sqliteTable(
  "users",
  {
    id: text("id").primaryKey(),
    email: text("email").notNull(),
    name: text("name").notNull(),
    avatarUrl: text("avatar_url"),
    emailVerified: integer("email_verified", { mode: "boolean" }).notNull().default(false),
    /** argon2id hash from Bun.password. NULL for OAuth-only accounts. */
    passwordHash: text("password_hash"),
    /**
     * Last group the user had selected. Deliberately WITHOUT a FK: it is a soft
     * UI pointer and a FK here would create a users <-> groups cycle in the
     * generated migration. Readers must tolerate a stale/absent group id.
     */
    activeGroupId: text("active_group_id"),
    createdAt: integer("created_at").notNull().$defaultFn(now),
    updatedAt: integer("updated_at").notNull().$defaultFn(now),
  },
  (table) => [uniqueIndex("users_email_unique").on(table.email)],
);

export const oauthAccounts = sqliteTable(
  "oauth_accounts",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** "google" | "github" */
    provider: text("provider").notNull(),
    providerUserId: text("provider_user_id").notNull(),
    providerEmail: text("provider_email"),
    createdAt: integer("created_at").notNull().$defaultFn(now),
  },
  (table) => [
    uniqueIndex("oauth_accounts_provider_user_unique").on(table.provider, table.providerUserId),
    index("oauth_accounts_user_id_idx").on(table.userId),
  ],
);

export const sessions = sqliteTable(
  "sessions",
  {
    /** Opaque random id — this IS the cookie value. */
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** Sliding 30-day expiry, refreshed on use. */
    expiresAt: integer("expires_at").notNull(),
    createdAt: integer("created_at").notNull().$defaultFn(now),
    lastUsedAt: integer("last_used_at").notNull().$defaultFn(now),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
  },
  (table) => [
    index("sessions_user_id_idx").on(table.userId),
    index("sessions_expires_at_idx").on(table.expiresAt),
  ],
);

/* -------------------------------------------------------------------------- */
/* groups / membership                                                        */
/* -------------------------------------------------------------------------- */

export const groups = sqliteTable(
  "groups",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    description: text("description"),
    imageUrl: text("image_url"),
    createdBy: text("created_by")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: integer("created_at").notNull().$defaultFn(now),
    updatedAt: integer("updated_at").notNull().$defaultFn(now),
  },
  (table) => [index("groups_created_by_idx").on(table.createdBy)],
);

export const groupMembers = sqliteTable(
  "group_members",
  {
    id: text("id").primaryKey(),
    groupId: text("group_id")
      .notNull()
      .references(() => groups.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** "owner" | "admin" | "member" (GroupRole in @toon/shared) */
    role: text("role").notNull().default("member"),
    createdAt: integer("created_at").notNull().$defaultFn(now),
  },
  (table) => [
    uniqueIndex("group_members_group_user_unique").on(table.groupId, table.userId),
    index("group_members_group_id_idx").on(table.groupId),
    index("group_members_user_id_idx").on(table.userId),
  ],
);

export const groupInvites = sqliteTable(
  "group_invites",
  {
    id: text("id").primaryKey(),
    groupId: text("group_id")
      .notNull()
      .references(() => groups.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    /** "admin" | "member" */
    role: text("role").notNull().default("member"),
    /** Random URL-safe token; the invite link carries it. */
    token: text("token").notNull(),
    /** "pending" | "accepted" | "revoked" | "expired" */
    status: text("status").notNull().default("pending"),
    invitedBy: text("invited_by")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    acceptedBy: text("accepted_by").references(() => users.id, { onDelete: "set null" }),
    expiresAt: integer("expires_at").notNull(),
    acceptedAt: integer("accepted_at"),
    createdAt: integer("created_at").notNull().$defaultFn(now),
  },
  (table) => [
    uniqueIndex("group_invites_token_unique").on(table.token),
    index("group_invites_group_id_idx").on(table.groupId),
    index("group_invites_email_idx").on(table.email),
    index("group_invites_invited_by_idx").on(table.invitedBy),
  ],
);

/* -------------------------------------------------------------------------- */
/* recipes                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * SEARCH STRATEGY (FTS5 is explicitly out of scope for now):
 * `GET /recipes?q=` does a case-insensitive LIKE over recipes.title / description
 * plus an EXISTS sub-query on recipe_ingredients.name. The composite index
 * `recipes_group_title_idx` serves the ordered listing and prefix matches; the
 * `recipe_ingredients_name_idx` serves the ingredient sub-query.
 * Planned upgrade path: a `recipes_fts` FTS5 virtual table fed by AFTER
 * INSERT/UPDATE/DELETE triggers on recipes + recipe_ingredients, queried with
 * MATCH and joined back on rowid. Do NOT add it in this milestone.
 */
export const recipes = sqliteTable(
  "recipes",
  {
    id: text("id").primaryKey(),
    groupId: text("group_id")
      .notNull()
      .references(() => groups.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    description: text("description"),
    imageUrl: text("image_url"),
    sourceUrl: text("source_url"),
    sourceName: text("source_name"),
    servingsAmount: real("servings_amount"),
    servingsUnit: text("servings_unit"),
    prepMinutes: integer("prep_minutes"),
    cookMinutes: integer("cook_minutes"),
    totalMinutes: integer("total_minutes"),
    /** "einfach" | "mittel" | "schwer" */
    difficulty: text("difficulty"),
    rating: integer("rating"),
    notes: text("notes"),
    language: text("language").notNull().default("de"),
    createdBy: text("created_by")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: integer("created_at").notNull().$defaultFn(now),
    updatedAt: integer("updated_at").notNull().$defaultFn(now),
  },
  (table) => [
    index("recipes_group_id_idx").on(table.groupId),
    index("recipes_group_created_at_idx").on(table.groupId, table.createdAt),
    index("recipes_group_title_idx").on(table.groupId, table.title),
    index("recipes_created_by_idx").on(table.createdBy),
  ],
);

export const recipeIngredients = sqliteTable(
  "recipe_ingredients",
  {
    id: text("id").primaryKey(),
    recipeId: text("recipe_id")
      .notNull()
      .references(() => recipes.id, { onDelete: "cascade" }),
    position: integer("position").notNull().default(0),
    section: text("section"),
    quantity: real("quantity"),
    /** Upper bound for ranges ("2-3 Eier"). */
    quantityMax: real("quantity_max"),
    unit: text("unit"),
    name: text("name").notNull(),
    note: text("note"),
    /** Original source line, never rewritten. */
    raw: text("raw").notNull().default(""),
  },
  (table) => [
    index("recipe_ingredients_recipe_id_idx").on(table.recipeId),
    index("recipe_ingredients_recipe_position_idx").on(table.recipeId, table.position),
    index("recipe_ingredients_name_idx").on(table.name),
  ],
);

export const recipeSteps = sqliteTable(
  "recipe_steps",
  {
    id: text("id").primaryKey(),
    recipeId: text("recipe_id")
      .notNull()
      .references(() => recipes.id, { onDelete: "cascade" }),
    position: integer("position").notNull().default(0),
    section: text("section"),
    text: text("text").notNull(),
  },
  (table) => [
    index("recipe_steps_recipe_id_idx").on(table.recipeId),
    index("recipe_steps_recipe_position_idx").on(table.recipeId, table.position),
  ],
);

export const tags = sqliteTable(
  "tags",
  {
    id: text("id").primaryKey(),
    groupId: text("group_id")
      .notNull()
      .references(() => groups.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    color: text("color"),
    createdAt: integer("created_at").notNull().$defaultFn(now),
  },
  (table) => [
    uniqueIndex("tags_group_name_unique").on(table.groupId, table.name),
    index("tags_group_id_idx").on(table.groupId),
  ],
);

export const recipeTags = sqliteTable(
  "recipe_tags",
  {
    recipeId: text("recipe_id")
      .notNull()
      .references(() => recipes.id, { onDelete: "cascade" }),
    tagId: text("tag_id")
      .notNull()
      .references(() => tags.id, { onDelete: "cascade" }),
  },
  (table) => [
    primaryKey({ columns: [table.recipeId, table.tagId] }),
    index("recipe_tags_tag_id_idx").on(table.tagId),
    index("recipe_tags_recipe_id_idx").on(table.recipeId),
  ],
);

export const collections = sqliteTable(
  "collections",
  {
    id: text("id").primaryKey(),
    groupId: text("group_id")
      .notNull()
      .references(() => groups.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    coverImageUrl: text("cover_image_url"),
    createdBy: text("created_by")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: integer("created_at").notNull().$defaultFn(now),
    updatedAt: integer("updated_at").notNull().$defaultFn(now),
  },
  (table) => [
    index("collections_group_id_idx").on(table.groupId),
    index("collections_created_by_idx").on(table.createdBy),
  ],
);

export const collectionRecipes = sqliteTable(
  "collection_recipes",
  {
    collectionId: text("collection_id")
      .notNull()
      .references(() => collections.id, { onDelete: "cascade" }),
    recipeId: text("recipe_id")
      .notNull()
      .references(() => recipes.id, { onDelete: "cascade" }),
    position: integer("position").notNull().default(0),
    addedAt: integer("added_at").notNull().$defaultFn(now),
  },
  (table) => [
    primaryKey({ columns: [table.collectionId, table.recipeId] }),
    index("collection_recipes_recipe_id_idx").on(table.recipeId),
    index("collection_recipes_collection_id_idx").on(table.collectionId),
  ],
);

/* -------------------------------------------------------------------------- */
/* imports                                                                    */
/* -------------------------------------------------------------------------- */

export const importDrafts = sqliteTable(
  "import_drafts",
  {
    id: text("id").primaryKey(),
    groupId: text("group_id")
      .notNull()
      .references(() => groups.id, { onDelete: "cascade" }),
    createdBy: text("created_by")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** "pending" | "reviewed" | "discarded" */
    status: text("status").notNull().default("pending"),
    /** "manual" | "url" | "ocr" (PDF + image both use "ocr", see sourceMeta.method) */
    sourceType: text("source_type").notNull(),
    sourceUrl: text("source_url"),
    /** OCR output or PDF text layer, kept for the review screen. */
    rawText: text("raw_text"),
    /** ParsedRecipe as JSON — the editable draft body. */
    parsed: text("parsed", { mode: "json" }).$type<ParsedRecipe>().notNull(),
    confidence: real("confidence"),
    sourceMeta: text("source_meta", { mode: "json" }).$type<ImportSourceMeta>(),
    /** Set once the draft was committed. */
    recipeId: text("recipe_id").references(() => recipes.id, { onDelete: "set null" }),
    createdAt: integer("created_at").notNull().$defaultFn(now),
    updatedAt: integer("updated_at").notNull().$defaultFn(now),
  },
  (table) => [
    index("import_drafts_group_id_idx").on(table.groupId),
    index("import_drafts_created_by_idx").on(table.createdBy),
    index("import_drafts_group_status_idx").on(table.groupId, table.status),
    index("import_drafts_recipe_id_idx").on(table.recipeId),
  ],
);

/* -------------------------------------------------------------------------- */
/* relations (for drizzle query API)                                          */
/* -------------------------------------------------------------------------- */

export const usersRelations = relations(users, ({ many }) => ({
  sessions: many(sessions),
  oauthAccounts: many(oauthAccounts),
  memberships: many(groupMembers),
}));

export const groupsRelations = relations(groups, ({ many, one }) => ({
  members: many(groupMembers),
  invites: many(groupInvites),
  recipes: many(recipes),
  tags: many(tags),
  collections: many(collections),
  drafts: many(importDrafts),
  creator: one(users, { fields: [groups.createdBy], references: [users.id] }),
}));

export const groupMembersRelations = relations(groupMembers, ({ one }) => ({
  group: one(groups, { fields: [groupMembers.groupId], references: [groups.id] }),
  user: one(users, { fields: [groupMembers.userId], references: [users.id] }),
}));

export const recipesRelations = relations(recipes, ({ many, one }) => ({
  group: one(groups, { fields: [recipes.groupId], references: [groups.id] }),
  author: one(users, { fields: [recipes.createdBy], references: [users.id] }),
  ingredients: many(recipeIngredients),
  steps: many(recipeSteps),
  recipeTags: many(recipeTags),
  collectionRecipes: many(collectionRecipes),
}));

export const recipeIngredientsRelations = relations(recipeIngredients, ({ one }) => ({
  recipe: one(recipes, { fields: [recipeIngredients.recipeId], references: [recipes.id] }),
}));

export const recipeStepsRelations = relations(recipeSteps, ({ one }) => ({
  recipe: one(recipes, { fields: [recipeSteps.recipeId], references: [recipes.id] }),
}));

export const recipeTagsRelations = relations(recipeTags, ({ one }) => ({
  recipe: one(recipes, { fields: [recipeTags.recipeId], references: [recipes.id] }),
  tag: one(tags, { fields: [recipeTags.tagId], references: [tags.id] }),
}));

export const collectionsRelations = relations(collections, ({ many, one }) => ({
  group: one(groups, { fields: [collections.groupId], references: [groups.id] }),
  collectionRecipes: many(collectionRecipes),
}));

export const collectionRecipesRelations = relations(collectionRecipes, ({ one }) => ({
  collection: one(collections, { fields: [collectionRecipes.collectionId], references: [collections.id] }),
  recipe: one(recipes, { fields: [collectionRecipes.recipeId], references: [recipes.id] }),
}));

export const importDraftsRelations = relations(importDrafts, ({ one }) => ({
  group: one(groups, { fields: [importDrafts.groupId], references: [groups.id] }),
  author: one(users, { fields: [importDrafts.createdBy], references: [users.id] }),
  recipe: one(recipes, { fields: [importDrafts.recipeId], references: [recipes.id] }),
}));

/* -------------------------------------------------------------------------- */
/* row types                                                                  */
/* -------------------------------------------------------------------------- */

export type UserRow = typeof users.$inferSelect;
export type NewUserRow = typeof users.$inferInsert;
export type OAuthAccountRow = typeof oauthAccounts.$inferSelect;
export type NewOAuthAccountRow = typeof oauthAccounts.$inferInsert;
export type SessionRow = typeof sessions.$inferSelect;
export type NewSessionRow = typeof sessions.$inferInsert;
export type GroupRow = typeof groups.$inferSelect;
export type NewGroupRow = typeof groups.$inferInsert;
export type GroupMemberRow = typeof groupMembers.$inferSelect;
export type NewGroupMemberRow = typeof groupMembers.$inferInsert;
export type GroupInviteRow = typeof groupInvites.$inferSelect;
export type NewGroupInviteRow = typeof groupInvites.$inferInsert;
export type RecipeRow = typeof recipes.$inferSelect;
export type NewRecipeRow = typeof recipes.$inferInsert;
export type RecipeIngredientRow = typeof recipeIngredients.$inferSelect;
export type NewRecipeIngredientRow = typeof recipeIngredients.$inferInsert;
export type RecipeStepRow = typeof recipeSteps.$inferSelect;
export type NewRecipeStepRow = typeof recipeSteps.$inferInsert;
export type TagRow = typeof tags.$inferSelect;
export type NewTagRow = typeof tags.$inferInsert;
export type RecipeTagRow = typeof recipeTags.$inferSelect;
export type CollectionRow = typeof collections.$inferSelect;
export type NewCollectionRow = typeof collections.$inferInsert;
export type CollectionRecipeRow = typeof collectionRecipes.$inferSelect;
export type ImportDraftRow = typeof importDrafts.$inferSelect;
export type NewImportDraftRow = typeof importDrafts.$inferInsert;
