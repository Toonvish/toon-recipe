/**
 * Every message this app can send, as pure functions: input -> `MailMessage`.
 *
 * No I/O and no URL building here — the caller passes the finished link, because
 * only the caller knows whether it points at the web app (`WEB_ORIGIN`) or at
 * something an operator printed on a terminal. That keeps these testable and
 * keeps the "which origin?" decision in one place per feature.
 *
 * All copy is German (see docs/open-work.md: new user-facing copy is German).
 * Both parts are always filled: `text` is what most mail clients actually show
 * for a short notice, `html` only makes the link tappable.
 */
import type { MailMessage } from "./types.ts";

/** Escapes the four characters that can break out of HTML text or an attribute. */
function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

/**
 * One shared HTML skeleton: a heading, paragraphs, a button and a plain copy of
 * the link. Inline styles only — mail clients drop <style> blocks.
 */
function htmlDocument(options: {
  heading: string;
  paragraphs: readonly string[];
  action: { label: string; url: string };
  footer: string;
}): string {
  const paragraphs = options.paragraphs
    .map(
      (text) =>
        `<p style="margin:0 0 12px;font-size:15px;line-height:1.55;color:#3b3733">${escapeHtml(text)}</p>`,
    )
    .join("");
  const url = escapeHtml(options.action.url);
  return [
    `<div style="margin:0 auto;max-width:520px;padding:24px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#faf5ee">`,
    `<h1 style="margin:0 0 16px;font-size:20px;line-height:1.3;color:#1f1c19">${escapeHtml(options.heading)}</h1>`,
    paragraphs,
    `<p style="margin:24px 0"><a href="${url}" style="display:inline-block;padding:12px 20px;border-radius:10px;background:#c2532c;color:#ffffff;font-size:15px;font-weight:600;text-decoration:none">${escapeHtml(options.action.label)}</a></p>`,
    `<p style="margin:0 0 12px;font-size:13px;line-height:1.5;color:#6b635b">Falls der Button nicht funktioniert, kopiere diese Adresse in deinen Browser:<br><span style="word-break:break-all">${url}</span></p>`,
    `<p style="margin:24px 0 0;font-size:12px;line-height:1.5;color:#8a8078">${escapeHtml(options.footer)}</p>`,
    `</div>`,
  ].join("");
}

/* -------------------------------------------------------------------------- */
/* group invite                                                               */
/* -------------------------------------------------------------------------- */

export interface InviteMailInput {
  to: string;
  groupName: string;
  invitedByName: string;
  inviteUrl: string;
  /** Days until the link stops working (INVITE_TTL_DAYS). */
  expiresInDays: number;
}

export function inviteMail(input: InviteMailInput): MailMessage {
  const heading = `${input.invitedByName} lädt dich zu „${input.groupName}“ ein`;
  const paragraphs = [
    `${input.invitedByName} möchte die Rezepte der Gruppe „${input.groupName}“ mit dir teilen.`,
    `Öffne den Link, um beizutreten. Du kannst dich dabei neu registrieren oder ein vorhandenes Konto verwenden.`,
  ];
  const footer = `Der Link ist ${input.expiresInDays} Tage gültig. Wenn du diese Einladung nicht erwartet hast, kannst du diese E-Mail einfach ignorieren.`;
  return {
    to: input.to,
    subject: `Einladung zur Gruppe „${input.groupName}“`,
    text: [heading, "", ...paragraphs, "", input.inviteUrl, "", footer].join("\n"),
    html: htmlDocument({
      heading,
      paragraphs,
      action: { label: "Einladung annehmen", url: input.inviteUrl },
      footer,
    }),
  };
}

/* -------------------------------------------------------------------------- */
/* password reset                                                             */
/* -------------------------------------------------------------------------- */

export interface PasswordResetMailInput {
  to: string;
  name: string;
  resetUrl: string;
  /** Minutes until the token expires (PASSWORD_RESET_TTL_MS). */
  expiresInMinutes: number;
}

export function passwordResetMail(input: PasswordResetMailInput): MailMessage {
  const heading = "Passwort zurücksetzen";
  const paragraphs = [
    `Hallo ${input.name}, für dein Konto wurde ein neues Passwort angefordert.`,
    "Öffne den Link und wähle ein neues Passwort. Danach wirst du auf allen Geräten abgemeldet und musst dich einmal neu anmelden.",
  ];
  const footer = `Der Link gilt ${input.expiresInMinutes} Minuten und kann nur einmal verwendet werden. Wenn du das nicht warst, musst du nichts tun — dein aktuelles Passwort bleibt gültig.`;
  return {
    to: input.to,
    subject: "Neues Passwort für dein Rezepte-Konto",
    text: [heading, "", ...paragraphs, "", input.resetUrl, "", footer].join("\n"),
    html: htmlDocument({
      heading,
      paragraphs,
      action: { label: "Neues Passwort setzen", url: input.resetUrl },
      footer,
    }),
  };
}

/* -------------------------------------------------------------------------- */
/* e-mail verification                                                        */
/* -------------------------------------------------------------------------- */

export interface VerifyEmailMailInput {
  to: string;
  name: string;
  verifyUrl: string;
  /** Hours until the token expires (EMAIL_VERIFICATION_TTL_MS). */
  expiresInHours: number;
}

export function verifyEmailMail(input: VerifyEmailMailInput): MailMessage {
  const heading = "E-Mail-Adresse bestätigen";
  const paragraphs = [
    `Hallo ${input.name}, bitte bestätige, dass diese Adresse dir gehört.`,
    "Danach können wir dich bei einem vergessenen Passwort sicher wiedererkennen.",
  ];
  const footer = `Der Link gilt ${input.expiresInHours} Stunden. Wenn du kein Konto bei Rezepte angelegt hast, ignoriere diese E-Mail.`;
  return {
    to: input.to,
    subject: "Bitte bestätige deine E-Mail-Adresse",
    text: [heading, "", ...paragraphs, "", input.verifyUrl, "", footer].join("\n"),
    html: htmlDocument({
      heading,
      paragraphs,
      action: { label: "E-Mail bestätigen", url: input.verifyUrl },
      footer,
    }),
  };
}
