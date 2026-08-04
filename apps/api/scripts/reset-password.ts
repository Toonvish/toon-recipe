#!/usr/bin/env bun
/**
 * `bun run auth:reset-password <email> [--send]`
 *
 * The operator escape hatch for a locked-out password-only account. Mints exactly
 * the same token as `POST /api/auth/password/forgot` and prints the reset URL, so
 * it works on an install with NO mail configured at all — which is the point.
 *
 * It does NOT set a password itself. Whoever runs this can already read the
 * database, but a printed link still leaves the new password known only to the
 * user, and it leaves the same audit row behind as the self-service flow.
 *
 * `--send` additionally tries to mail the link (no-op beyond a log line when
 * MAIL_TRANSPORT is unset).
 *
 * Runs against DATABASE_URL from the root .env, like every other script here.
 */
import { db } from "../src/db/client.ts";
import { env } from "../src/env.ts";
import { webUrl } from "../src/lib/oauth.ts";
import {
  PASSWORD_RESET_TTL_MINUTES,
  createPasswordResetToken,
} from "../src/services/auth/passwordReset.ts";
import { findUserByEmail } from "../src/services/auth/users.ts";
import { isMailConfigured, passwordResetMail, trySendMail } from "../src/services/mail/index.ts";

function usage(): never {
  console.error(
    [
      "Aufruf: bun run auth:reset-password <e-mail> [--send]",
      "",
      "  <e-mail>   Konto, für das ein Reset-Link erzeugt wird",
      "  --send     Link zusätzlich per E-Mail verschicken (braucht MAIL_TRANSPORT)",
    ].join("\n"),
  );
  process.exit(1);
}

const args = process.argv.slice(2);
const email = args.find((value) => !value.startsWith("-"));
const send = args.includes("--send");
if (email === undefined || email.length === 0) usage();

const user = await findUserByEmail(db, email);
if (!user) {
  // An operator on a terminal is not an enumeration risk — unlike the HTTP
  // endpoint, this MUST say plainly that the address is unknown, otherwise the
  // answer to "why did the link not work?" is unfindable.
  console.error(`Kein Konto mit der Adresse ${email} gefunden (DB: ${env.databaseKind}).`);
  process.exit(2);
}

const { token, expiresAt } = await createPasswordResetToken(db, user.id, { requestedIp: "cli" });
const resetUrl = webUrl(`/reset-password/${token}`);

console.log("");
console.log(`Konto:    ${user.name} <${user.email}>`);
console.log(`Gültig:   ${PASSWORD_RESET_TTL_MINUTES} Minuten (bis ${new Date(expiresAt).toISOString()})`);
if (!user.passwordHash) {
  console.log("Hinweis:  Dieses Konto hatte bisher kein Passwort (nur OAuth).");
}
console.log("");
console.log(resetUrl);
console.log("");
console.log("Der Link kann genau EINMAL verwendet werden und meldet danach alle Geräte ab.");

if (send) {
  const result = await trySendMail(
    passwordResetMail({
      to: user.email,
      name: user.name,
      resetUrl,
      expiresInMinutes: PASSWORD_RESET_TTL_MINUTES,
    }),
  );
  console.log(
    result.delivered
      ? `Per E-Mail verschickt (${result.transport}).`
      : `Nicht verschickt (${result.transport}${result.error ? `: ${result.error}` : ""}).${
          isMailConfigured() ? "" : " MAIL_TRANSPORT ist nicht konfiguriert."
        }`,
  );
}

process.exit(0);
