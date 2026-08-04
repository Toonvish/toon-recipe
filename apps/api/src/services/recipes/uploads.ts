/**
 * Recipe photo upload.
 *
 * The client filename is never trusted: the real content type is sniffed from
 * the magic bytes and the file is stored as `data/uploads/<uuid>.<ext>`
 * (served publicly by GET /uploads/:filename, see src/index.ts).
 */
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import type { UploadResponse } from "@toon/shared";
import { MAX_UPLOAD_BYTES } from "@toon/shared";
import { env } from "../../env.ts";
import { ApiError } from "../../lib/errors.ts";

interface SniffedType {
  mimeType: string;
  extension: string;
}

const ISO_BMFF_IMAGE_BRANDS: Record<string, SniffedType> = {
  heic: { mimeType: "image/heic", extension: "heic" },
  heix: { mimeType: "image/heic", extension: "heic" },
  hevc: { mimeType: "image/heic", extension: "heic" },
  hevx: { mimeType: "image/heic", extension: "heic" },
  heim: { mimeType: "image/heif", extension: "heif" },
  heis: { mimeType: "image/heif", extension: "heif" },
  mif1: { mimeType: "image/heif", extension: "heif" },
  msf1: { mimeType: "image/heif", extension: "heif" },
  avif: { mimeType: "image/avif", extension: "avif" },
  avis: { mimeType: "image/avif", extension: "avif" },
};

function ascii(bytes: Uint8Array, start: number, end: number): string {
  return String.fromCharCode(...bytes.subarray(start, end));
}

/** Detects the accepted image formats from the file header, or undefined. */
export function sniffImageType(bytes: Uint8Array): SniffedType | undefined {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return { mimeType: "image/jpeg", extension: "jpg" };
  }
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return { mimeType: "image/png", extension: "png" };
  }
  if (bytes.length >= 12 && ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 12) === "WEBP") {
    return { mimeType: "image/webp", extension: "webp" };
  }
  if (bytes.length >= 12 && ascii(bytes, 4, 8) === "ftyp") {
    return ISO_BMFF_IMAGE_BRANDS[ascii(bytes, 8, 12).toLowerCase()];
  }
  return undefined;
}

/**
 * Reads the multipart `file` field, validates size + real type and stores it.
 * Throws 400/413/415 with the documented error codes.
 */
export async function storeUploadedImage(
  formData: FormData,
  field = "file",
): Promise<UploadResponse> {
  const file = formData.get(field);
  if (!(file instanceof File)) {
    throw ApiError.badRequest(`Es wurde keine Datei im Feld "${field}" gesendet`);
  }
  if (file.size === 0) throw ApiError.badRequest("Die Datei ist leer");
  if (file.size > MAX_UPLOAD_BYTES) throw ApiError.payloadTooLarge();

  const bytes = new Uint8Array(await file.arrayBuffer());
  if (bytes.byteLength > MAX_UPLOAD_BYTES) throw ApiError.payloadTooLarge();

  const sniffed = sniffImageType(bytes);
  if (!sniffed) {
    throw ApiError.unsupportedMediaType(
      "Nur Bilder (JPEG, PNG, WebP, HEIC/HEIF, AVIF) werden unterstützt",
    );
  }

  const filename = `${crypto.randomUUID()}.${sniffed.extension}`;
  await mkdir(env.uploadDir, { recursive: true });
  await Bun.write(join(env.uploadDir, filename), bytes);

  return {
    // Absolute when PUBLIC_API_URL is configured, otherwise a path the web dev
    // server proxies — both resolve to GET /uploads/:filename.
    url: `${(env.PUBLIC_API_URL ?? "").replace(/\/+$/, "")}/uploads/${filename}`,
    filename,
    mimeType: sniffed.mimeType,
    size: bytes.byteLength,
  };
}
