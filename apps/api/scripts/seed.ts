/**
 * bun run seed — creates a demo user, a demo group "Familie", three tags and three
 * realistic German recipes (two of them with ingredient/step SECTIONS), so the app is
 * not empty on first run. Idempotent: running it twice reuses user/group/tags and
 * skips recipes whose title already exists in the group.
 *
 * Login: demo@toon.local / demo1234
 */
import { foldText, parseIngredientBlock, parseStepBlock, type RecipeStep } from "@toon/shared";
import { eq } from "drizzle-orm";
import { client, db } from "../src/db/client.ts";
import { runMigrations } from "../src/db/migrate.ts";
import {
  groupMembers,
  groups,
  recipeIngredients,
  recipeSteps,
  recipeTags,
  recipes,
  tags,
  users,
} from "../src/db/schema.ts";

const DEMO_EMAIL = "demo@toon.local";
const DEMO_PASSWORD = "demo1234";

const HEADING_LINE = /^([^:]{2,80}):\s*$/u;

/**
 * Splits a step block on standalone "Für den Teig:" heading lines and runs the shared
 * `parseStepBlock` per section.
 *
 * `parseStepBlock` on its own only splits BEFORE a numbered step, so a heading between
 * "3. …" and "4. …" ends up glued to the end of step 3 instead of becoming a section
 * (see "Known gaps" in README.md). Splitting first keeps the shared parser untouched.
 */
function parseSectionedSteps(text: string): RecipeStep[] {
  const out: RecipeStep[] = [];
  let section: string | undefined;
  let buffer: string[] = [];

  const flush = (): void => {
    if (buffer.length === 0) return;
    for (const step of parseStepBlock(buffer.join("\n"))) {
      out.push({ ...step, position: out.length, ...(section ? { section } : {}) });
    }
    buffer = [];
  };

  for (const line of text.split("\n")) {
    const heading = HEADING_LINE.exec(line.trim());
    if (heading) {
      flush();
      section = heading[1]!.trim();
      continue;
    }
    buffer.push(line);
  }
  flush();
  return out;
}

await runMigrations();

const now = Date.now();

const existingUser = await db.select().from(users).where(eq(users.email, DEMO_EMAIL)).limit(1);
let userId = existingUser[0]?.id;

if (!userId) {
  userId = crypto.randomUUID();
  await db.insert(users).values({
    id: userId,
    email: DEMO_EMAIL,
    name: "Demo Koch",
    // The flag and its evidence ALWAYS move together — see the column comment in
    // db/schema.ts and markEmailVerified() in services/auth/emailVerification.ts.
    // `true` is fine here because the demo account's address is fictional and the
    // seed is the thing vouching for it; leaving `emailVerifiedAt` null would have
    // shipped a row that contradicts the invariant.
    emailVerified: true,
    emailVerifiedAt: now,
    passwordHash: await Bun.password.hash(DEMO_PASSWORD, { algorithm: "argon2id" }),
    createdAt: now,
    updatedAt: now,
  });
  console.log(`[seed] user ${DEMO_EMAIL} / ${DEMO_PASSWORD}`);
}

const existingGroup = await db.select().from(groups).where(eq(groups.createdBy, userId)).limit(1);
let groupId = existingGroup[0]?.id;

if (!groupId) {
  groupId = crypto.randomUUID();
  await db.insert(groups).values({
    id: groupId,
    name: "Familie",
    description: "Unsere gemeinsamen Rezepte",
    createdBy: userId,
    createdAt: now,
    updatedAt: now,
  });
  await db.insert(groupMembers).values({
    id: crypto.randomUUID(),
    groupId,
    userId,
    role: "owner",
    createdAt: now,
  });
  await db.update(users).set({ activeGroupId: groupId, updatedAt: now }).where(eq(users.id, userId));
  console.log(`[seed] group "Familie" (${groupId})`);
}

const tagNames = ["Hauptgericht", "Backen", "Vegetarisch"] as const;
const tagIds = new Map<string, string>();
for (const name of tagNames) {
  const existing = await db.select().from(tags).where(eq(tags.name, name)).limit(1);
  const row = existing.find((tag) => tag.groupId === groupId);
  if (row) {
    tagIds.set(name, row.id);
    continue;
  }
  const id = crypto.randomUUID();
  await db.insert(tags).values({ id, groupId, name, createdAt: now });
  tagIds.set(name, id);
}

interface DemoRecipe {
  title: string;
  description: string;
  servingsAmount: number;
  servingsUnit: string;
  prepMinutes: number;
  cookMinutes: number;
  difficulty: "einfach" | "mittel" | "schwer";
  ingredients: string;
  steps: string;
  tags: string[];
}

const demoRecipes: DemoRecipe[] = [
  {
    title: "Klassische Pfannkuchen",
    description: "Dünne Pfannkuchen wie bei Oma — süß oder herzhaft.",
    servingsAmount: 4,
    servingsUnit: "Portionen",
    prepMinutes: 10,
    cookMinutes: 20,
    difficulty: "einfach",
    ingredients: [
      "250 g Mehl",
      "500 ml Milch",
      "3 Eier",
      "1 Prise Salz",
      "2 EL Zucker",
      "etwas Butter zum Braten",
    ].join("\n"),
    steps: [
      "1. Mehl, Milch, Eier, Salz und Zucker zu einem glatten Teig verrühren.",
      "2. Den Teig 15 Minuten ruhen lassen.",
      "3. Butter in einer Pfanne erhitzen und den Teig portionsweise goldbraun ausbacken.",
    ].join("\n"),
    tags: ["Hauptgericht", "Vegetarisch"],
  },
  {
    title: "Schneller Schokokuchen",
    description: "Saftiger Rührkuchen mit Schokoguss, in 15 Minuten im Ofen.",
    servingsAmount: 12,
    servingsUnit: "Stück",
    prepMinutes: 15,
    cookMinutes: 40,
    difficulty: "einfach",
    // Section headings ("Für den Teig:") are recognised by parseIngredientBlock /
    // parseStepBlock and end up in recipe_ingredients.section / recipe_steps.section.
    ingredients: [
      "Für den Teig:",
      "200 g Mehl",
      "200 g Zucker",
      "1 Pck. Backpulver",
      "4 EL Kakao",
      "200 ml Öl",
      "200 ml Wasser",
      "1 Prise Salz",
      "Für den Guss:",
      "100 g Zartbitterschokolade",
      "1 EL Butter",
      "2 EL Milch",
    ].join("\n"),
    steps: [
      "Für den Teig:",
      "1. Backofen auf 180 °C Ober-/Unterhitze vorheizen und eine Springform fetten.",
      "2. Alle trockenen Zutaten mischen, dann Öl und Wasser unterrühren, bis ein glatter Teig entsteht.",
      "3. Den Teig in die Form geben und 40 Minuten backen. Stäbchenprobe machen.",
      "Für den Guss:",
      "4. Schokolade mit Butter und Milch über dem Wasserbad schmelzen.",
      "5. Den abgekühlten Kuchen mit dem Guss überziehen und 30 Minuten fest werden lassen.",
    ].join("\n"),
    tags: ["Backen", "Vegetarisch"],
  },
  {
    title: "Zwiebelkuchen vom Blech",
    description: "Herzhafter Blechkuchen mit Hefeteig und Speck — klassisch zum Federweißer.",
    servingsAmount: 12,
    servingsUnit: "Stück",
    prepMinutes: 30,
    cookMinutes: 45,
    difficulty: "mittel",
    ingredients: [
      "Für den Hefeteig:",
      "500 g Mehl (Type 405)",
      "1 Pck. Trockenhefe",
      "250 ml lauwarme Milch",
      "60 g weiche Butter",
      "1 TL Salz",
      "1 TL Zucker",
      "Für den Belag:",
      "1,5 kg Zwiebeln",
      "200 g durchwachsener Speck",
      "3 Eier",
      "200 g Schmand",
      "1 EL Mehl",
      "1 TL Kümmel, ganz",
      "Salz und Pfeffer",
    ].join("\n"),
    steps: [
      "Für den Hefeteig:",
      "1. Mehl, Trockenhefe, Zucker und Salz mischen, lauwarme Milch und Butter zugeben und 5 Minuten glatt kneten.",
      "2. Den Teig zugedeckt an einem warmen Ort 45 Minuten gehen lassen, bis er sich verdoppelt hat.",
      "Für den Belag:",
      "3. Zwiebeln halbieren und in feine Streifen schneiden. Speck würfeln und in einer großen Pfanne auslassen.",
      "4. Zwiebeln im Speckfett bei mittlerer Hitze 15 Minuten glasig dünsten, nicht braun werden lassen. Abkühlen lassen.",
      "5. Eier mit Schmand und Mehl verquirlen, unter die Zwiebeln rühren und mit Salz, Pfeffer und Kümmel abschmecken.",
      "6. Den Teig auf ein gefettetes Backblech ausrollen, den Belag gleichmäßig verteilen.",
      "7. Bei 200 °C Ober-/Unterhitze 40-45 Minuten backen, bis der Belag goldgelb gestockt ist. Lauwarm servieren.",
    ].join("\n"),
    tags: ["Hauptgericht", "Backen"],
  },
];

for (const demo of demoRecipes) {
  const existing = await db.select({ id: recipes.id, title: recipes.title }).from(recipes).where(eq(recipes.groupId, groupId));
  if (existing.some((recipe) => recipe.title === demo.title)) {
    console.log(`[seed] recipe "${demo.title}" already present`);
    continue;
  }

  const recipeId = crypto.randomUUID();
  const parsedIngredients = parseIngredientBlock(demo.ingredients);
  const parsedSteps = parseSectionedSteps(demo.steps);

  await db.insert(recipes).values({
    id: recipeId,
    groupId,
    title: demo.title,
    titleFold: foldText(demo.title),
    description: demo.description,
    descriptionFold: foldText(demo.description),
    servingsAmount: demo.servingsAmount,
    servingsUnit: demo.servingsUnit,
    prepMinutes: demo.prepMinutes,
    cookMinutes: demo.cookMinutes,
    totalMinutes: demo.prepMinutes + demo.cookMinutes,
    difficulty: demo.difficulty,
    language: "de",
    createdBy: userId,
    createdAt: now,
    updatedAt: now,
  });

  if (parsedIngredients.length > 0) {
    await db.insert(recipeIngredients).values(
      parsedIngredients.map((ingredient) => ({
        id: crypto.randomUUID(),
        recipeId,
        position: ingredient.position,
        section: ingredient.section ?? null,
        quantity: ingredient.quantity ?? null,
        quantityMax: ingredient.quantityMax ?? null,
        unit: ingredient.unit ?? null,
        name: ingredient.name,
        nameFold: foldText(ingredient.name),
        note: ingredient.note ?? null,
        raw: ingredient.raw,
      })),
    );
  }

  if (parsedSteps.length > 0) {
    await db.insert(recipeSteps).values(
      parsedSteps.map((step) => ({
        id: crypto.randomUUID(),
        recipeId,
        position: step.position,
        section: step.section ?? null,
        text: step.text,
      })),
    );
  }

  const links = demo.tags
    .map((name) => tagIds.get(name))
    .filter((id): id is string => typeof id === "string")
    .map((tagId) => ({ recipeId, tagId }));
  if (links.length > 0) await db.insert(recipeTags).values(links);

  console.log(`[seed] recipe "${demo.title}" (${parsedIngredients.length} Zutaten, ${parsedSteps.length} Schritte)`);
}

console.log("[seed] done");
console.log("");
console.log("  Login:    " + DEMO_EMAIL);
console.log("  Passwort: " + DEMO_PASSWORD);
console.log("");
client.close();
