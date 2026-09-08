/**
 * Generates one self-contained brief per redesign task, so a build agent loads ~50KB
 * instead of the 622KB the first two runs made every agent re-read on every tool call.
 *
 * Measured before this existed: 159k tokens of required reading per agent against a
 * 154k observed average context per request — i.e. the docs WERE the context, re-sent
 * as a cache read ~150 times per agent. That cost ~23M all-in tokens each.
 *
 * A brief carries only what its task cites: the PLAN.md entry verbatim, the §4 rulings
 * it names, the area-spec sections it references, its i18n namespace tables, and its
 * artboards. Everything else stays greppable on disk rather than preloaded.
 */
const ROOT = new URL("../", import.meta.url).pathname;
const R = (p: string) => Bun.file(ROOT + p).text();

const plan = await R("docs/redesign/PLAN.md");
const i18n = await R("docs/redesign/i18n-keys.md");
const design = await R("docs/redesign/design.dc.html");
const claude = await R("CLAUDE.md");
const spec = await R("docs/redesign/SPEC.md");

const areas: Record<string, string> = {};
for (const [n, f] of [["A01", "01-design-system"], ["A02", "02-backend-planner"], ["A03", "03-backend-shopping"],
  ["A04", "04-frontend-designed"], ["A05", "05-frontend-shell"], ["A06", "06-platform"]] as const) {
  areas[n] = await R(`docs/redesign/specs/${f}.md`);
}

/** Slice from a heading matching `re` up to the next heading at the same level. */
function section(doc: string, re: RegExp, level: string): string | null {
  const m = doc.match(re);
  if (!m || m.index === undefined) return null;
  const rest = doc.slice(m.index + m[0].length);
  const next = rest.search(new RegExp(`^${level} `, "m"));
  return (m[0] + (next === -1 ? rest : rest.slice(0, next))).trimEnd();
}

const taskIds = [...plan.matchAll(/^#### (T\d+\.\d+) —/gm)].map((m) => m[1]);

// A compact index of CLAUDE.md's gotchas: headline only, greppable for the rest.
const gotchaIndex = [...claude.matchAll(/^- \*\*(.+?)\*\*/gms)]
  .map((m) => "  - " + m[1].replace(/\s+/g, " ").slice(0, 150))
  .join("\n");

const decisions = section(spec, /^## 3 — Settled decisions/m, "##") ?? "";
const decisions7 = section(spec, /^## 7 — Decisions settled after/m, "##") ?? "";

let total = 0;
const rows: string[] = [];

for (const id of taskIds) {
  const entry = section(plan, new RegExp(`^#### ${id.replace(".", "\\.")} — .*$`, "m"), "####");
  if (!entry) continue;

  // Rulings, area-spec sections and artboards this entry actually cites.
  const allR = [...new Set([...entry.matchAll(/\bR(\d+)\b/g)].map((m) => m[1]))];
  const rulings = allR.slice(0, 10)
    .map((n) => section(plan, new RegExp(`^### R${n} — .*$`, "m"), "###"))
    .filter(Boolean);

  const areaBits: string[] = [];
  for (const [, a, secs] of entry.matchAll(/\b(A0[1-6])\s+((?:§[\d.]+(?:\/§?[\d.]+)*[,\s]*)+)/g)) {
    for (const s of secs.matchAll(/[\d.]+/g)) {
      const num = s[0];
      const lvl = num.includes(".") ? "###" : "##";
      const hit = section(areas[a], new RegExp(`^${lvl} ${num.replace(".", "\\.")}[ .—]`, "m"), lvl);
      if (areaBits.length >= 8) continue;
      if (hit && !areaBits.some((b) => b.includes(hit.slice(0, 60)))) areaBits.push(`<!-- ${a} §${num} -->\n${hit}`);
    }
  }

  const nsHits: string[] = [];
  for (const ns of ["ui", "plan", "shopping", "recipes", "groups", "server"]) {
    const cites = new RegExp(`\\b${ns}\\.[a-zA-Z]`).test(entry) || new RegExp(`\`${ns}\` namespace`).test(entry);
    if (!cites) continue;
    const hit = section(i18n, new RegExp(`^## \\d+ — \\\`?${ns}\\\`? namespace`, "m"), "##");
    if (hit) nsHits.push(hit);
  }

  const boards: string[] = [];
  for (const b of [...new Set([...entry.matchAll(/\b1([a-h])\b/g)].map((m) => "1" + m[1]))].slice(0, 3)) {
    const i = design.indexOf(`id="${b}"`);
    if (i === -1) continue;
    const start = design.lastIndexOf("<div", i);
    const end = design.indexOf('<div id="1', i + 10);
    boards.push(`<!-- artboard ${b} -->\n${design.slice(start, end === -1 ? design.length : end).trim()}`);
  }
  // renderVals() is the data shape every screen needs.
  if (boards.length) {
    const rv = design.indexOf("renderVals()");
    if (rv !== -1) boards.push(`<!-- renderVals(): the data each screen needs -->\n${design.slice(rv, design.indexOf("</script>", rv))}`);
  }

  const brief = `# Brief — ${id}

READ THIS FILE INSTEAD OF THE FULL PLANNING DOCS. It contains your task entry verbatim,
every ruling and area-spec section it cites, your i18n keys and your artboards. The full
documents are still on disk if you need something not here — \`grep\` them, do not read
them whole:

  docs/redesign/PLAN.md          the whole plan (260KB — grep it)
  docs/redesign/i18n-keys.md     the key inventory (92KB — authoritative on keys)
  docs/redesign/specs/0N-*.md    the area specs
  docs/redesign/design.dc.html   the artboards
  CLAUDE.md                      the repo's locked decisions and gotchas (84KB — grep it)

## Your task

${entry}

## Settled decisions (do not reopen)

${decisions}

${decisions7}
${rulings.length ? `\n## Rulings this task cites\n\n${rulings.join("\n\n")}\n${allR.length > 10 ? `\n> This task cites ${allR.length} rulings. The ${allR.length - 10} not inlined here are R${allR.slice(10).join(", R")} — grep PLAN.md §4 for them.\n` : ""}` : ""}
${areaBits.length ? `\n## Area-spec sections this task cites\n\n${areaBits.join("\n\n")}\n` : ""}
${nsHits.length ? `\n## Your i18n keys (authoritative — never invent one)\n\n${nsHits.join("\n\n")}\n` : ""}
${boards.length ? `\n## Your artboards\n\n\`\`\`html\n${boards.join("\n\n")}\n\`\`\`\n` : ""}
## CLAUDE.md gotcha index

Grep CLAUDE.md for the full text of any that applies. Your task entry names the ones that
bind you; these are the rest, so you can recognise one you are about to trip:

${gotchaIndex}
`;

  await Bun.write(`${ROOT}docs/redesign/briefs/${id}.md`, brief);
  total += brief.length;
  rows.push(`${id}\t${(brief.length / 1024).toFixed(0)}KB\trulings:${rulings.length} areaSecs:${areaBits.length} ns:${nsHits.length} boards:${boards.length}`);
}

console.log(rows.join("\n"));
console.log(`\n${taskIds.length} tasks, ${(total / 1024).toFixed(0)}KB total, mean ${(total / taskIds.length / 1024).toFixed(0)}KB/brief`);
console.log(`was: 622KB per agent`);
