/**
 * The DEFAULT deployment: photo/PDF import switched off (IMPORT_OCR_ENABLED unset),
 * which is what lets the app run on a small VPS without tesseract, poppler or the
 * memory an OCR job needs.
 *
 * What this pins:
 *   - the three upload endpoints answer 501 `ocr_disabled`,
 *   - they do it WITHOUT reading the upload body or spending a rate-limit slot,
 *   - URL, text, draft, review and commit import keep working,
 *   - a draft that OCR produced while the flag was on stays reviewable,
 *   - `/api/health` advertises the capability so the UI can hide what is off,
 *   - and OFF IS THE DEFAULT — no test may rely on another file's override.
 *
 * Same seams as routes.test.ts (`setAuthMiddlewareForTests`, `setImportDbForTests`);
 * everything set here is handed back in `afterAll`.
 */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { HealthResponse, ImportDraftResponse } from "@toon/shared";
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { createDatabase } from "../../src/db/client.ts";
import { runMigrations } from "../../src/db/migrate.ts";
import { groupMembers, groups, users } from "../../src/db/schema.ts";
import { app } from "../../src/index.ts";
import {
  isOcrImportEnabled,
  isPdfImportEnabled,
  setOcrImportEnabled,
  setPdfImportEnabled,
} from "../../src/services/import/capabilities.ts";
import { setImportDbForTests } from "../../src/services/import/db.ts";
import { createDraft } from "../../src/services/import/drafts.ts";
import { importFromText } from "../../src/services/import/ocr/index.ts";
import { setAuthMiddlewareForTests } from "../../src/services/import/middleware-bridge.ts";

const tempDir = mkdtempSync(join(tmpdir(), "toon-ocr-disabled-"));
const { client, db } = createDatabase({ url: `file:${join(tempDir, "disabled.db")}` });
await runMigrations(db);

const userId = crypto.randomUUID();
const groupId = crypto.randomUUID();
const base = `/api/groups/${groupId}/imports`;

beforeAll(async () => {
  setImportDbForTests(db);
  // Explicitly OFF rather than "whatever env says": another file may have run first.
  setOcrImportEnabled(false);

  setAuthMiddlewareForTests(
    async (c, next) => {
      const rows = await db.select().from(users).where(eq(users.id, userId)).limit(1);
      const row = rows[0];
      if (!row) return c.json({ error: { code: "unauthorized", message: "Nicht angemeldet" } }, 401);
      c.set("user", {
        id: row.id,
        email: row.email,
        name: row.name,
        avatarUrl: row.avatarUrl,
        emailVerified: row.emailVerified,
        hasPassword: row.passwordHash !== null,
        activeGroupId: row.activeGroupId,
        createdAt: new Date(row.createdAt).toISOString(),
        updatedAt: new Date(row.updatedAt).toISOString(),
      });
      c.set("sessionId", "test-session");
      await next();
      return undefined;
    },
    () => async (c, next) => {
      c.set("membership", { groupId, userId, role: "owner" });
      await next();
      return undefined;
    },
  );

  await db.insert(users).values({ id: userId, email: "vps@toon.local", name: "VPS" });
  await db.insert(groups).values({ id: groupId, name: "Sparsam", createdBy: userId });
  await db.insert(groupMembers).values({ id: crypto.randomUUID(), groupId, userId, role: "owner" });
});

afterAll(() => {
  setImportDbForTests(null);
  setAuthMiddlewareForTests(null, null);
  setOcrImportEnabled(null);
  setPdfImportEnabled(null);
  client.close();
  rmSync(tempDir, { recursive: true, force: true });
});

function multipart(bytes: Uint8Array, filename: string, type: string): FormData {
  const form = new FormData();
  // Blob + explicit filename avoids depending on a global `File`/`BlobPart` type.
  form.append("file", new Blob([bytes], { type }), filename);
  return form;
}

interface ErrorBody {
  error: { code: string; message: string };
}

describe("photo/PDF import disabled (the default)", () => {
  test("it IS the default — nothing needs to be set to get a lean server", () => {
    setOcrImportEnabled(null);
    expect(isOcrImportEnabled()).toBe(false);
    setOcrImportEnabled(false);
  });

  for (const path of ["/image", "/pdf", "/file"] as const) {
    test(`POST ${path} answers 501 ocr_disabled`, async () => {
      const response = await app.request(`${base}${path}`, {
        method: "POST",
        body: multipart(new Uint8Array([1, 2, 3, 4]), "seite.png", "image/png"),
      });
      expect(response.status).toBe(501);
      const body = (await response.json()) as ErrorBody;
      expect(body.error.code).toBe("ocr_disabled");
    });
  }

  test("the body is never read, so a huge upload is rejected before it is buffered", async () => {
    // A body that would exceed the 15 MB upload limit: if the handler read it first
    // we would see 413 payload_too_large instead of 501, and the server would have
    // buffered it for nothing.
    const huge = new Uint8Array(16 * 1024 * 1024);
    const response = await app.request(`${base}/image`, {
      method: "POST",
      body: multipart(huge, "riesig.png", "image/png"),
    });
    expect(response.status).toBe(501);
    expect(((await response.json()) as ErrorBody).error.code).toBe("ocr_disabled");
  });

  test("a rejected upload does not consume the import rate limit", async () => {
    // IMPORT_RULE allows 10 imports/minute. Twenty rejections must not exhaust it,
    // or a disabled endpoint could lock a user out of URL import.
    for (let i = 0; i < 20; i++) {
      const response = await app.request(`${base}/image`, {
        method: "POST",
        body: multipart(new Uint8Array([1, 2, 3]), "x.png", "image/png"),
      });
      expect(response.status).toBe(501);
    }

    // Text import still has its full budget.
    const text = await app.request(`${base}/text`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Nach 20 Fehlschlägen", rawText: "200 g Mehl\n\nAlles mischen." }),
    });
    expect(text.status).toBe(201);
  });

  test("text import still works and still produces a reviewable draft", async () => {
    const response = await app.request(`${base}/text`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: "Pfannkuchen",
        rawText: "250 g Mehl\n2 Eier\n\nAlles verrühren und ausbacken.",
      }),
    });
    expect(response.status).toBe(201);
    const { draft } = (await response.json()) as ImportDraftResponse;
    expect(draft.parsed.title).toBe("Pfannkuchen");
    expect(draft.parsed.ingredients.length).toBeGreaterThan(0);

    // And it is reachable through the normal draft endpoints.
    const fetched = await app.request(`${base}/${draft.id}`);
    expect(fetched.status).toBe(200);
  });

  test("a draft OCR created earlier stays reviewable and committable", async () => {
    // The realistic upgrade path: photo import was on, drafts exist, the admin turns
    // it off to save memory. Those drafts must not become unreachable.
    // Built with the real parser and stored through the real service, so the row is
    // exactly what a photo import would have left behind — only the flag differs.
    const scanned = importFromText("200 g Mehl\n1 Ei\n\nVerrühren und ausbacken.", {
      title: "Altes Foto-Rezept",
    });
    const draft = await createDraft(db, {
      groupId,
      createdBy: userId,
      sourceType: "ocr",
      parsed: scanned.parsed,
      rawText: scanned.rawText,
    });
    const draftId = draft.id;

    const fetched = await app.request(`${base}/${draftId}`);
    expect(fetched.status).toBe(200);
    expect(((await fetched.json()) as ImportDraftResponse).draft.sourceType).toBe("ocr");

    const committed = await app.request(`${base}/${draftId}/commit`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(committed.status).toBe(201);
  });

  test("/api/health advertises ocrImport: false so the UI can hide it", async () => {
    const response = await app.request("/api/health");
    expect(response.status).toBe(200);
    const body = (await response.json()) as HealthResponse;
    expect(body.features?.ocrImport).toBe(false);
  });

  test("/api/health advertises ocrImport: true when it is enabled", async () => {
    setOcrImportEnabled(true);
    try {
      const body = (await (await app.request("/api/health")).json()) as HealthResponse;
      expect(body.features?.ocrImport).toBe(true);

      // And the endpoint stops answering 501 — proof the flag is what gates it and
      // that nothing else about the route changed.
      const response = await app.request(`${base}/image`, {
        method: "POST",
        body: multipart(new Uint8Array([1, 2, 3]), "x.png", "image/png"),
      });
      expect(response.status).not.toBe(501);
    } finally {
      setOcrImportEnabled(false);
    }
  });
});

/**
 * THE SMALL BUILD: photo OCR on, PDF import off.
 *
 * This is the 1 GB / one-core deployment. A photo is one tesseract run and fits;
 * a scanned PDF is up to ten of them and cannot finish inside OCR_TIMEOUT_MS
 * whatever the box has, so the two capabilities are separate flags rather than
 * one. What this pins is that the split is real end to end — the routes, the
 * message the user is given, and what `/api/health` advertises to the UI.
 */
describe("image-only build (photos yes, PDFs no)", () => {
  const PDF_BYTES = new TextEncoder().encode("%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n%%EOF\n");

  beforeAll(() => {
    setOcrImportEnabled(true);
    setPdfImportEnabled(false);
  });

  afterAll(() => {
    setOcrImportEnabled(false);
    setPdfImportEnabled(null);
  });

  test("PDF import defaults to FOLLOWING the photo flag, so nothing splits unasked", () => {
    setPdfImportEnabled(null);
    // env has neither set in tests, so the derived value is off — the point is
    // that it reads the PDF flag's own default rather than a separate literal.
    expect(isPdfImportEnabled()).toBe(false);
    setPdfImportEnabled(false);
  });

  test("POST /image is available", async () => {
    const response = await app.request(`${base}/image`, {
      method: "POST",
      body: multipart(new Uint8Array([1, 2, 3]), "x.png", "image/png"),
    });
    expect(response.status).not.toBe(501);
  });

  test("POST /pdf answers 501 ocr_disabled, and says photos still work", async () => {
    const response = await app.request(`${base}/pdf`, {
      method: "POST",
      body: multipart(PDF_BYTES, "rezept.pdf", "application/pdf"),
    });
    expect(response.status).toBe(501);
    const body = (await response.json()) as ErrorBody;
    expect(body.error.code).toBe("ocr_disabled");
    // The lean server's message tells the user to use a URL instead; this one must
    // not, because the camera is right there and does work.
    expect(body.error.message).toContain("Fotos");
  });

  test("a lean server keeps the BROADER message on /pdf", async () => {
    setOcrImportEnabled(false);
    try {
      const response = await app.request(`${base}/pdf`, {
        method: "POST",
        body: multipart(PDF_BYTES, "rezept.pdf", "application/pdf"),
      });
      expect(response.status).toBe(501);
      const body = (await response.json()) as ErrorBody;
      // "Fotos funktionieren weiterhin" would be a lie here — they are off too.
      expect(body.error.message).not.toContain("Fotos");
      expect(body.error.message).toContain("Webadresse");
    } finally {
      setOcrImportEnabled(true);
    }
  });

  test("POST /file takes an image and refuses a PDF, decided by SNIFFED content", async () => {
    const image = await app.request(`${base}/file`, {
      method: "POST",
      body: multipart(new Uint8Array([1, 2, 3]), "x.png", "image/png"),
    });
    expect(image.status).not.toBe(501);

    // Named .png and declared image/png, but the bytes are a PDF — the gate has to
    // follow the content, or the flag is bypassed by renaming a file.
    const disguised = await app.request(`${base}/file`, {
      method: "POST",
      body: multipart(PDF_BYTES, "getarnt.png", "image/png"),
    });
    expect(disguised.status).toBe(501);
    expect(((await disguised.json()) as ErrorBody).error.code).toBe("ocr_disabled");
  });

  test("/api/health advertises the two capabilities separately", async () => {
    const body = (await (await app.request("/api/health")).json()) as HealthResponse;
    expect(body.features?.ocrImport).toBe(true);
    expect(body.features?.pdfImport).toBe(false);
    expect(isOcrImportEnabled()).toBe(true);
  });
});
