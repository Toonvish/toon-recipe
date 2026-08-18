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
    /**
     * WHEN the address was proved: a confirmation click on a mailed link, or an
     * OAuth provider that reported it verified. Always written together with
     * `emailVerified` (see markEmailVerified in services/auth/emailVerification.ts).
     *
     * The boolean alone is NOT evidence — self-registration used to set it and that
     * was an account-takeover via OAuth auto-linking. Anything that wants to trust
     * the address must look at this timestamp.
     */
    emailVerifiedAt: integer("email_verified_at"),
    /** argon2id hash from Bun.password. NULL for OAuth-only accounts. */
    passwordHash: text("password_hash"),
    /**
     * Last group the user had selected. Deliberately WITHOUT a FK: it is a soft
     * UI pointer and a FK here would create a users <-> groups cycle in the
     * generated migration. Readers must tolerate a stale/absent group id.
     */
    activeGroupId: text("active_group_id"),
    /**
     * The account's INTERFACE locale ("de" | "en"), mirrored from the device
     * preference only because mail is delivered outside any browser. NULL
     * means "never chosen" — `env.defaultLocale` wins for those, which is
     * what lets a deployment's default change without a backfill. This is
     * NOT `recipes.language` (the CONTENT axis); see CLAUDE.md.
     */
    locale: text("locale"),
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

/**
 * Single-use secrets from a mailed link: password reset and e-mail confirmation.
 *
 * WE STORE A SHA-256 HASH, NEVER THE TOKEN. Note the deliberate difference from
 * `group_invites.token` below, which keeps the raw value: a leaked invites table
 * costs you group membership, a leaked reset table would cost every account. The
 * hash is unsalted and un-stretched on purpose — the input is already 256 bits of
 * CSPRNG output, so there is nothing to brute-force and argon2 here would only
 * make lookup-by-token impossible.
 *
 * `used_at` makes consumption one-shot; rows are never updated in place, so a
 * replay is a plain `used_at IS NOT NULL` check.
 */
export const passwordResetTokens = sqliteTable(
  "password_reset_tokens",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** SHA-256 (hex) of the token that travelled in the link. */
    tokenHash: text("token_hash").notNull(),
    /** 1 hour after creation — far shorter than the invites' 14 days. */
    expiresAt: integer("expires_at").notNull(),
    usedAt: integer("used_at"),
    /** For abuse forensics; only trustworthy when TRUST_PROXY=1. */
    requestedIp: text("requested_ip"),
    createdAt: integer("created_at").notNull().$defaultFn(now),
  },
  (table) => [
    uniqueIndex("password_reset_tokens_hash_unique").on(table.tokenHash),
    index("password_reset_tokens_user_id_idx").on(table.userId),
    index("password_reset_tokens_expires_at_idx").on(table.expiresAt),
  ],
);

/** Same shape and the same hashing rule as `password_reset_tokens`, 24 h TTL. */
export const emailVerificationTokens = sqliteTable(
  "email_verification_tokens",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull(),
    /**
     * Address the token was issued FOR. Checked on confirm, so a token minted
     * before a profile e-mail change cannot verify the new address.
     */
    email: text("email").notNull(),
    expiresAt: integer("expires_at").notNull(),
    usedAt: integer("used_at"),
    requestedIp: text("requested_ip"),
    createdAt: integer("created_at").notNull().$defaultFn(now),
  },
  (table) => [
    uniqueIndex("email_verification_tokens_hash_unique").on(table.tokenHash),
    index("email_verification_tokens_user_id_idx").on(table.userId),
    index("email_verification_tokens_expires_at_idx").on(table.expiresAt),
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
 * SEARCH STRATEGY: `GET /recipes?q=` LIKEs the PRE-FOLDED columns
 * `title_fold` / `description_fold` plus an EXISTS sub-query on
 * `recipe_ingredients.name_fold`. FTS5 is still out of scope — see below for why
 * these columns were the answer instead.
 *
 * WHY THE FOLD IS STORED. It used to be computed per row per query: `foldSql()`
 * expands {@link FOLD_PAIRS} into 23 nested `replace(lower(…))` calls, and the
 * `total` half of the list envelope is a `count(*)` that cannot stop early, so
 * EVERY row's title and description were folded on EVERY search. Measured on 2000
 * recipes: 32 ms for a search, of which 31.8 ms was that one `count(*)`, and 91 ms
 * for a term that matches nothing (the page half loses its early exit too). Cost
 * grows linearly with the library — 6 ms at 300 recipes, 34 ms at 2000 — and
 * because libSQL serialises a local file, one such query delays every other
 * request behind it. With the fold stored, the same no-match search is ~9 ms.
 *
 * WHY NOT A GENERATED COLUMN. It would be the obvious fit and it does not work
 * here: libSQL 0.17.4 bundles SQLite 3.45.1, which rejects
 * `ALTER TABLE … ADD COLUMN … GENERATED ALWAYS AS (…) STORED` outright ("cannot
 * add a STORED column"). Note that `bun:sqlite` is 3.53 and accepts it, so a
 * migration tested only through bun:sqlite would pass locally and fail on deploy.
 * A VIRTUAL column is no use: it recomputes the fold on read, which is the cost we
 * are removing.
 *
 * SO THE APP WRITES THEM, exactly as it already does for the shopping list's
 * `name_key` / `merge_key`. The columns are `.notNull()` WITHOUT a drizzle default
 * on purpose: that makes them required in `$inferInsert`, so `tsc` fails on any
 * insert site that forgets one rather than silently storing NULL and making the
 * recipe unfindable. The migration adds them with a SQL-level `DEFAULT ''` because
 * SQLite cannot add a NOT NULL column to a populated table without one — a
 * deliberate divergence, and the reason `bun run db:generate` will offer to
 * "fix" it. Do not let it.
 *
 * KEEP THEM IN STEP WITH `foldText()`. Adding a pair to {@link FOLD_PAIRS} makes
 * every stored value stale until rewritten — the same rule the shopping-list keys
 * already carry. `test/recipes-search.test.ts` pins the agreement.
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
    /** `foldText(title)` — the searchable/sortable form. See the table comment. */
    titleFold: text("title_fold").notNull(),
    /** `foldText(description ?? "")`; empty string when there is no description. */
    descriptionFold: text("description_fold").notNull(),
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
    /**
     * `?sort=title`. It has to be the FOLDED column: ordering by an expression
     * (`foldSql(title)`) cannot use an index, so the planner fell back to
     * `USE TEMP B-TREE FOR ORDER BY` over every row in the group — 6.7 ms against
     * 2.1 ms for `?sort=newest`, which reads its order straight out of
     * `recipes_group_created_at_idx`.
     *
     * This REPLACES the old `recipes_group_title_idx` on the raw title, which no
     * query could use once sorting became case/diacritic-insensitive.
     */
    index("recipes_group_title_fold_idx").on(table.groupId, table.titleFold),
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
    /** `foldText(name)` — searched by the `?q=` EXISTS sub-query. See `recipes`. */
    nameFold: text("name_fold").notNull(),
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
/* shopping lists                                                             */
/* -------------------------------------------------------------------------- */

/**
 * A named shopping list owned by a GROUP — several per group are supported
 * ("Rewe", "Drogerie", "Wochenendeinkauf").
 *
 * The unique index is on the RAW name, which only stops exact duplicates. The service
 * additionally rejects names that merely FOLD to the same key (`eqFolded`), so "rewe"
 * and "Rewe" collide too; the index is the backstop against a race between two
 * concurrent creates.
 */
export const shoppingLists = sqliteTable(
  "shopping_lists",
  {
    id: text("id").primaryKey(),
    groupId: text("group_id")
      .notNull()
      .references(() => groups.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    createdBy: text("created_by")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: integer("created_at").notNull().$defaultFn(now),
    updatedAt: integer("updated_at").notNull().$defaultFn(now),
  },
  (table) => [
    uniqueIndex("shopping_lists_group_name_unique").on(table.groupId, table.name),
    index("shopping_lists_group_id_idx").on(table.groupId),
    index("shopping_lists_created_by_idx").on(table.createdBy),
  ],
);

/**
 * One line on a list. There is NO `checked` column: checking an item off deletes the
 * row and bumps `shopping_list_catalog` instead, which is the Bring-style behaviour
 * the UI mimics (item leaves the list, reappears under "Häufig gekauft").
 *
 * `merge_key` is `shoppingItemKey(name, unit)` from @toon/shared — a folded name plus
 * the unit's merge bucket. The UNIQUE index on it is what makes "200 g Mehl" twice
 * become "400 g Mehl" instead of two lines, enforced by the DB rather than by a
 * read-modify-write that two members could interleave.
 *
 * `source_recipe_ids` is a JSON array and deliberately NOT a join table: ids are only
 * ever read as a set for display, a merge rewrites the whole set anyway, and a FK
 * would force a decision about what a deleted recipe does to an item that is already
 * in someone's shopping basket. Unknown ids are simply not resolved (see toShoppingItem).
 */
export const shoppingListItems = sqliteTable(
  "shopping_list_items",
  {
    id: text("id").primaryKey(),
    listId: text("list_id")
      .notNull()
      .references(() => shoppingLists.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    /** shoppingItemKey(name, unit) — the merge identity. */
    mergeKey: text("merge_key").notNull(),
    /** NULL means "no amount given"; never store 0 for that. */
    quantity: real("quantity"),
    unit: text("unit"),
    note: text("note"),
    position: integer("position").notNull().default(0),
    /** JSON string array of recipe ids this line was merged from. */
    sourceRecipeIds: text("source_recipe_ids", { mode: "json" }).$type<string[]>(),
    createdAt: integer("created_at").notNull().$defaultFn(now),
    updatedAt: integer("updated_at").notNull().$defaultFn(now),
  },
  (table) => [
    uniqueIndex("shopping_list_items_list_merge_key_unique").on(table.listId, table.mergeKey),
    index("shopping_list_items_list_id_idx").on(table.listId),
    index("shopping_list_items_list_position_idx").on(table.listId, table.position),
  ],
);

/**
 * "Häufig gekauft": everything that has been on this list before, so re-adding the
 * weekly milk is one tap instead of typing.
 *
 * `use_count` counts CHECK-OFFS, not adds, so the ranking reflects what actually gets
 * bought rather than what gets typed and deleted again. `name_key` is `nameKey(name)`
 * from @toon/shared — the unit is remembered for convenience but is NOT part of the
 * identity, because "Milch" is one suggestion whether you bought 1 l or 2 Flaschen.
 */
export const shoppingListCatalog = sqliteTable(
  "shopping_list_catalog",
  {
    id: text("id").primaryKey(),
    listId: text("list_id")
      .notNull()
      .references(() => shoppingLists.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    /** nameKey(name) — the suggestion identity. */
    nameKey: text("name_key").notNull(),
    /** Last unit this item was bought in, pre-filled on re-add. */
    unit: text("unit"),
    useCount: integer("use_count").notNull().default(0),
    lastUsedAt: integer("last_used_at").notNull().$defaultFn(now),
  },
  (table) => [
    uniqueIndex("shopping_list_catalog_list_name_unique").on(table.listId, table.nameKey),
    index("shopping_list_catalog_list_rank_idx").on(
      table.listId,
      table.useCount,
      table.lastUsedAt,
    ),
  ],
);

/**
 * Idempotency ledger for shopping mutations — the thing that makes OFFLINE EDITING
 * safe rather than merely possible.
 *
 * A phone that adds a recipe while offline queues the request and replays it on
 * reconnect. If the original request DID reach the server but its response was lost,
 * the replay would add every ingredient a second time — and because items merge by
 * quantity, the failure mode is a silently doubled amount, not a visible duplicate.
 *
 * So every replayable mutation carries a client-generated `mutationId` and the API
 * records it here before answering. A second request with the same id returns the
 * current state without applying anything. Entries older than
 * `MUTATION_LEDGER_TTL_MS` are pruned on write (services/shopping/idempotency.ts).
 */
export const shoppingMutations = sqliteTable(
  "shopping_mutations",
  {
    /** The client-generated mutation id (uuid). */
    id: text("id").primaryKey(),
    listId: text("list_id")
      .notNull()
      .references(() => shoppingLists.id, { onDelete: "cascade" }),
    appliedAt: integer("applied_at").notNull().$defaultFn(now),
  },
  (table) => [
    index("shopping_mutations_list_id_idx").on(table.listId),
    index("shopping_mutations_applied_at_idx").on(table.appliedAt),
  ],
);

/* -------------------------------------------------------------------------- */
/* saved cards                                                                */
/* -------------------------------------------------------------------------- */

/**
 * A loyalty/membership barcode the user keeps in the app so the plastic card can
 * stay at home ("Karten"): Payback, DeutschlandCard, the gym, the library.
 *
 * OWNED BY A USER, NOT BY A GROUP — the only table here that is, and deliberately
 * so (see the header of packages/shared/src/schemas/card.ts). A loyalty number is
 * personal property that earns points, it has to follow its owner into every group
 * they are in, and nothing about it is collaborative. `user_id` cascades, so
 * deleting an account takes its wallet with it.
 *
 * `value` is stored NORMALISED (digits only for the numeric symbologies, check
 * digit included) because the schemas normalise on the way in — so the display path
 * can encode a row without cleaning it up first, and a duplicate is detectable by
 * string comparison.
 *
 * `last_used_at` is bumped when a card is SHOWN, and is what the list is ordered
 * by: the card you used yesterday is the one you want at the till today. NULL until
 * it has been shown once, which is why the ordering has to fall back to `created_at`
 * rather than treating NULL as zero in the index.
 */
export const cards = sqliteTable(
  "cards",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** What the user calls it: "Payback", "Rewe", "Stadtbibliothek". */
    label: text("label").notNull(),
    /** A `BarcodeFormat` from @toon/shared: qr | ean13 | ean8 | upca | code128 | code39 | itf. */
    format: text("format").notNull(),
    /** The normalised payload the symbol encodes. */
    value: text("value").notNull(),
    note: text("note"),
    /** When the card was last shown at a till. NULL = never. */
    lastUsedAt: integer("last_used_at"),
    createdAt: integer("created_at").notNull().$defaultFn(now),
    updatedAt: integer("updated_at").notNull().$defaultFn(now),
  },
  (table) => [
    // The same number saved twice is a mistake, not a feature: the second copy
    // would sit next to the first in the wallet with no way to tell them apart.
    uniqueIndex("cards_user_format_value_unique").on(table.userId, table.format, table.value),
    index("cards_user_id_idx").on(table.userId),
    index("cards_user_last_used_idx").on(table.userId, table.lastUsedAt),
  ],
);

/* -------------------------------------------------------------------------- */
/* relations (for drizzle query API)                                          */
/* -------------------------------------------------------------------------- */

export const usersRelations = relations(users, ({ many }) => ({
  sessions: many(sessions),
  cards: many(cards),
  oauthAccounts: many(oauthAccounts),
  memberships: many(groupMembers),
  passwordResetTokens: many(passwordResetTokens),
  emailVerificationTokens: many(emailVerificationTokens),
}));

export const passwordResetTokensRelations = relations(passwordResetTokens, ({ one }) => ({
  user: one(users, { fields: [passwordResetTokens.userId], references: [users.id] }),
}));

export const emailVerificationTokensRelations = relations(emailVerificationTokens, ({ one }) => ({
  user: one(users, { fields: [emailVerificationTokens.userId], references: [users.id] }),
}));

export const groupsRelations = relations(groups, ({ many, one }) => ({
  members: many(groupMembers),
  invites: many(groupInvites),
  recipes: many(recipes),
  tags: many(tags),
  collections: many(collections),
  drafts: many(importDrafts),
  shoppingLists: many(shoppingLists),
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

export const cardsRelations = relations(cards, ({ one }) => ({
  user: one(users, { fields: [cards.userId], references: [users.id] }),
}));

export const shoppingListsRelations = relations(shoppingLists, ({ many, one }) => ({
  group: one(groups, { fields: [shoppingLists.groupId], references: [groups.id] }),
  creator: one(users, { fields: [shoppingLists.createdBy], references: [users.id] }),
  items: many(shoppingListItems),
  catalog: many(shoppingListCatalog),
}));

export const shoppingListItemsRelations = relations(shoppingListItems, ({ one }) => ({
  list: one(shoppingLists, { fields: [shoppingListItems.listId], references: [shoppingLists.id] }),
}));

export const shoppingListCatalogRelations = relations(shoppingListCatalog, ({ one }) => ({
  list: one(shoppingLists, {
    fields: [shoppingListCatalog.listId],
    references: [shoppingLists.id],
  }),
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
export type PasswordResetTokenRow = typeof passwordResetTokens.$inferSelect;
export type NewPasswordResetTokenRow = typeof passwordResetTokens.$inferInsert;
export type EmailVerificationTokenRow = typeof emailVerificationTokens.$inferSelect;
export type NewEmailVerificationTokenRow = typeof emailVerificationTokens.$inferInsert;
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
export type ShoppingListRow = typeof shoppingLists.$inferSelect;
export type NewShoppingListRow = typeof shoppingLists.$inferInsert;
export type ShoppingListItemRow = typeof shoppingListItems.$inferSelect;
export type NewShoppingListItemRow = typeof shoppingListItems.$inferInsert;
export type ShoppingListCatalogRow = typeof shoppingListCatalog.$inferSelect;
export type NewShoppingListCatalogRow = typeof shoppingListCatalog.$inferInsert;
export type ShoppingMutationRow = typeof shoppingMutations.$inferSelect;
export type CardRow = typeof cards.$inferSelect;
export type NewCardRow = typeof cards.$inferInsert;
