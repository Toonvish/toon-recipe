/**
 * German display formatting. Pure functions — safe to use anywhere.
 * Domain formatting (durations, quantities, servings) is delegated to @toon/shared
 * so the API and the UI always agree.
 */
import { formatDuration, formatServings, type Servings } from "@toon/shared";

const dateFormatter = new Intl.DateTimeFormat("de-DE", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

const dateTimeFormatter = new Intl.DateTimeFormat("de-DE", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

const relativeFormatter = new Intl.RelativeTimeFormat("de-DE", { numeric: "auto" });

/** "03.08.2026" */
export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "–";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "–";
  return dateFormatter.format(date);
}

/** "03.08.2026, 15:48" */
export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "–";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "–";
  return dateTimeFormatter.format(date);
}

/** "vor 3 Tagen", "gerade eben" */
export function formatRelative(iso: string | null | undefined): string {
  if (!iso) return "–";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "–";
  const diffSeconds = (date.getTime() - Date.now()) / 1000;
  const absolute = Math.abs(diffSeconds);
  if (absolute < 45) return "gerade eben";
  const steps: Array<[Intl.RelativeTimeFormatUnit, number]> = [
    ["minute", 60],
    ["hour", 3600],
    ["day", 86_400],
    ["week", 604_800],
    ["month", 2_629_800],
    ["year", 31_557_600],
  ];
  let unit: Intl.RelativeTimeFormatUnit = "minute";
  let divisor = 60;
  for (const [candidateUnit, candidateDivisor] of steps) {
    if (absolute >= candidateDivisor) {
      unit = candidateUnit;
      divisor = candidateDivisor;
    }
  }
  return relativeFormatter.format(Math.round(diffSeconds / divisor), unit);
}

/** "1 Std. 15 Min." — thin wrapper so components don't import @toon/shared directly. */
export function formatMinutes(minutes: number | null | undefined): string {
  if (minutes === null || minutes === undefined) return "–";
  return formatDuration(minutes);
}

/** "4 Portionen" */
export function formatServingsLabel(
  amount: number | null | undefined,
  unit: string | null | undefined,
): string {
  if (amount === null || amount === undefined) return "–";
  const servings: Servings = { amount, unit: unit && unit.length > 0 ? unit : "Portionen" };
  return formatServings(servings);
}

/** "1,5 MB" */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toLocaleString("de-DE", { maximumFractionDigits: 1 })} MB`;
}

/** "Erika Mustermann" -> "EM" (max 2 letters, always uppercase). */
export function initials(name: string | null | undefined): string {
  const parts = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  const first = parts[0]?.[0] ?? "";
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? "") : "";
  return `${first}${last}`.toUpperCase();
}

/**
 * A URL that is safe to hand to an `href`, or undefined.
 *
 * DEFENCE IN DEPTH: `CreateRecipeRequest.sourceUrl` now rejects anything that is
 * not http(s), but a row written before that (or by a future importer bug) must
 * still never produce a live `javascript:` link — clicking one would run the
 * attacker's script on the app origin with the victim's session. Every component
 * that renders a server-supplied link goes through here.
 */
export function safeHttpUrl(value: string | null | undefined): string | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  if (trimmed.length === 0) return undefined;
  try {
    const protocol = new URL(trimmed, window.location.origin).protocol;
    if (protocol !== "http:" && protocol !== "https:") return undefined;
  } catch {
    return undefined;
  }
  return trimmed;
}

/** Domain of a source URL, without "www.". */
export function hostFromUrl(url: string | null | undefined): string | undefined {
  if (!url) return undefined;
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return undefined;
  }
}

/** Cuts text on a word boundary and appends an ellipsis. */
export function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const lastSpace = cut.lastIndexOf(" ");
  return `${(lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
}

/** German role labels. */
export const roleLabels = {
  owner: "Eigentümer:in",
  admin: "Administrator:in",
  member: "Mitglied",
} as const;

export const difficultyLabels = {
  einfach: "Einfach",
  mittel: "Mittel",
  schwer: "Schwer",
} as const;

/**
 * Readable text colour for a user-chosen tag colour (#rrggbb).
 * Uses the perceived-luminance rule, so both dark and light tags stay legible.
 */
export function readableTextColor(hex: string | null | undefined): string {
  const match = /^#?([0-9a-f]{6})$/i.exec(hex ?? "");
  if (!match?.[1]) return "inherit";
  const value = Number.parseInt(match[1], 16);
  const r = (value >> 16) & 255;
  const g = (value >> 8) & 255;
  const b = value & 255;
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.62 ? "#241d18" : "#ffffff";
}

/** German pluralisation helper: `plural(2, "Rezept", "Rezepte")` -> "2 Rezepte". */
export function plural(count: number, singular: string, pluralForm: string): string {
  return `${count} ${count === 1 ? singular : pluralForm}`;
}
