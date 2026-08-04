import { describe, expect, test } from "bun:test";
import {
  ApiErrorSchema,
  CreateRecipeRequestSchema,
  ImportDraftSchema,
  ParsedRecipeSchema,
  RecipeListQuerySchema,
  RegisterRequestSchema,
  emptyParsedRecipe,
  isHttpUrl,
  roleAtLeast,
} from "../src/index.ts";

describe("ApiErrorSchema", () => {
  test("accepts the standard envelope", () => {
    expect(ApiErrorSchema.parse({ error: { code: "not_found", message: "Rezept nicht gefunden" } })).toBeTruthy();
  });

  test("rejects a bare message", () => {
    expect(ApiErrorSchema.safeParse({ message: "nope" }).success).toBe(false);
  });
});

describe("RegisterRequestSchema", () => {
  test("lowercases and trims the e-mail", () => {
    const parsed = RegisterRequestSchema.parse({
      email: "  Test@Example.COM ",
      name: "Erik",
      password: "supersicher1",
    });
    expect(parsed.email).toBe("test@example.com");
  });

  test("rejects short passwords", () => {
    expect(
      RegisterRequestSchema.safeParse({ email: "a@b.de", name: "A", password: "kurz" }).success,
    ).toBe(false);
  });
});

describe("CreateRecipeRequestSchema", () => {
  test("defaults child arrays", () => {
    const parsed = CreateRecipeRequestSchema.parse({ title: "Pfannkuchen" });
    expect(parsed.ingredients).toEqual([]);
    expect(parsed.steps).toEqual([]);
    expect(parsed.tags).toEqual([]);
    expect(parsed.collectionIds).toEqual([]);
  });

  test("accepts ingredient input without position/raw", () => {
    const parsed = CreateRecipeRequestSchema.parse({
      title: "Pfannkuchen",
      ingredients: [{ name: "Mehl", quantity: 250, unit: "g" }],
      steps: [{ text: "Alles verrühren." }],
    });
    expect(parsed.ingredients[0]?.name).toBe("Mehl");
    expect(parsed.steps[0]?.text).toBe("Alles verrühren.");
  });

  test("rejects an empty title", () => {
    expect(CreateRecipeRequestSchema.safeParse({ title: "  " }).success).toBe(false);
  });
});

describe("RecipeListQuerySchema", () => {
  test("coerces query strings and applies defaults", () => {
    const parsed = RecipeListQuerySchema.parse({ limit: "10", offset: "20" });
    expect(parsed).toMatchObject({ limit: 10, offset: 20, sort: "newest" });
  });

  test("clamps invalid limits", () => {
    expect(RecipeListQuerySchema.safeParse({ limit: "1000" }).success).toBe(false);
  });
});

describe("ParsedRecipeSchema", () => {
  test("emptyParsedRecipe is valid", () => {
    expect(ParsedRecipeSchema.safeParse(emptyParsedRecipe()).success).toBe(true);
  });

  test("carries per-field confidence", () => {
    const parsed = ParsedRecipeSchema.parse({
      title: "Chefkoch Lasagne",
      ingredients: [{ position: 0, name: "Mehl", quantity: 250, unit: "g", raw: "250 g Mehl" }],
      steps: [{ position: 0, text: "Backofen vorheizen." }],
      confidence: { overall: 0.9, title: 1, ingredients: 0.8 },
    });
    expect(parsed.confidence.ingredients).toBe(0.8);
    expect(parsed.tags).toEqual([]);
  });

  test("rejects confidence out of range", () => {
    expect(ParsedRecipeSchema.safeParse({ confidence: { overall: 2 } }).success).toBe(false);
  });
});

describe("ImportDraftSchema", () => {
  test("round-trips a full draft", () => {
    const now = new Date().toISOString();
    const draft = {
      id: crypto.randomUUID(),
      groupId: crypto.randomUUID(),
      createdBy: crypto.randomUUID(),
      status: "pending",
      sourceType: "url",
      sourceUrl: "https://www.chefkoch.de/rezepte/123/Lasagne.html",
      rawText: null,
      parsed: emptyParsedRecipe({ title: "Lasagne" }),
      confidence: 0.7,
      sourceMeta: { method: "json-ld", host: "www.chefkoch.de" },
      recipeId: null,
      createdAt: now,
      updatedAt: now,
    };
    const result = ImportDraftSchema.safeParse(draft);
    expect(result.success).toBe(true);
  });
});

describe("roleAtLeast", () => {
  test("owner satisfies everything", () => {
    expect(roleAtLeast("owner", "admin")).toBe(true);
    expect(roleAtLeast("admin", "owner")).toBe(false);
    expect(roleAtLeast("member", "member")).toBe(true);
    expect(roleAtLeast("member", "admin")).toBe(false);
  });
});

/**
 * STORED-XSS REGRESSION. `sourceUrl` is rendered into an <a href> on the recipe
 * page and the import review screen, so a `javascript:` value stored by any group
 * member would run on the app origin with the victim's session.
 */
describe("sourceUrl accepts only http(s)", () => {
  const evil = [
    "javascript:alert(1)",
    "JavaScript:fetch('/api/auth/me')",
    "data:text/html,<script>1</script>",
    "vbscript:msgbox",
    "/relative/path",
    "not a url",
  ];

  test.each(evil)("CreateRecipeRequest rejects %p", (sourceUrl) => {
    const result = CreateRecipeRequestSchema.safeParse({ title: "Test", sourceUrl });
    expect(result.success).toBe(false);
  });

  test.each(evil)("ParsedRecipe rejects %p", (sourceUrl) => {
    const result = ParsedRecipeSchema.safeParse({ sourceUrl, confidence: { overall: 0.5 } });
    expect(result.success).toBe(false);
  });

  test.each(["https://www.chefkoch.de/rezepte/1", "http://localhost:8080/fixture.html"])(
    "accepts %p",
    (sourceUrl) => {
      expect(CreateRecipeRequestSchema.safeParse({ title: "Test", sourceUrl }).success).toBe(true);
    },
  );

  test("null/undefined stay allowed (no source)", () => {
    expect(CreateRecipeRequestSchema.safeParse({ title: "Test" }).success).toBe(true);
    expect(CreateRecipeRequestSchema.safeParse({ title: "Test", sourceUrl: null }).success).toBe(true);
  });

  test("isHttpUrl matches the schema", () => {
    expect(isHttpUrl("https://a.example")).toBe(true);
    expect(isHttpUrl("javascript:1")).toBe(false);
  });
});
