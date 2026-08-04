# Deployment auf einem Raspberry Pi

Ein Container-Stack, ein Origin, keine fremden Dienste. Von einem frischen Pi bis zur
installierten App auf dem Handy sind es die fünf Schritte in [Erstinstallation](#erstinstallation).

**GitHub Actions baut nur, es deployt nicht.** Jeder Push auf `main` veröffentlicht ein
neues Image auf GHCR; ausgerollt wird es von Hand auf dem Pi:

```bash
cd /opt/toon-recipe && docker compose pull && docker compose up -d --remove-orphans
```

Das ist eine bewusste Entscheidung: so liegt kein SSH-Schlüssel für den Pi in den
GitHub-Secrets, und der SSH-Port muss nicht aus dem Internet erreichbar sein.

> **Ganz von vorn — leere SD-Karte, kein Docker, kein GitHub?** Dann ist
> **[docs/pi-setup.md](./pi-setup.md)** die Anleitung: Betriebssystem schreiben, Pi-Eigenheiten
> (Memory-Cgroup, Swap), Docker, und drei Wege, das Image auf den Pi zu bekommen. Dieses Dokument
> hier setzt einen Pi mit Docker voraus und ist danach die Referenz für den Betrieb.

---

## Was hier läuft

```
        Handy / Laptop
              │  https://rezepte.fritz.box
              ▼
    ┌─────────────────────┐
    │ caddy               │  TLS (eigene lokale CA), 80 + 443
    └──────────┬──────────┘
               │ http, nur im Docker-Netz
    ┌──────────▼──────────┐        ┌──────────────────────┐
    │ app                 │───────►│ mailpit              │
    │ API + PWA, ein Port │  SMTP  │ SMTP + Web-UI        │
    └──────────┬──────────┘        └──────────────────────┘
               │
        Volume toon-data
        (Datenbank · Uploads · OCR-Sprachdaten)
```

**Kein einziger API-Key ist nötig.** Was vorher extern war, läuft jetzt mit:

| vorher | jetzt |
| --- | --- |
| Resend (`MAIL_API_KEY`) | `mailpit` im Stack, per SMTP ohne Zugangsdaten. Alle Mails im Web-UI lesbar. |
| Turso (`DATABASE_AUTH_TOKEN`) | war schon optional — eine libSQL-Datei im Volume |
| OCR | lief schon serverseitig; die Sprachpakete stecken im Image |
| Google-/GitHub-Login | **bleibt extern und ist bewusst aus.** E-Mail + Passwort ist der selbstgehostete Weg. |

Es gibt keinen selbstgehosteten Ersatz für Google-/GitHub-OAuth — dafür wäre ein eigener
OIDC-Provider (Authentik, Keycloak) plus eine generische OIDC-Anbindung nötig, die die App
heute nicht hat. Ohne OAuth fehlt nichts: Registrierung, Login, Einladungen und
Passwort-Reset funktionieren vollständig.

---

## Voraussetzungen

- **Raspberry Pi 4 oder 5 mit einem 64-Bit-Betriebssystem.** `uname -m` muss `aarch64`
  ausgeben. Für 32-Bit-ARM gibt es kein Bun, das Image lässt sich dort nicht starten.
- **Mindestens 2 GB RAM.** Der Tesseract-Worker ist der Speicherfresser; mit 2 GB
  `TOON_MEM_LIMIT=1200m` setzen. Ein Foto-Import dauert auf einem Pi 4 rund 10–30 s.
- **SSD oder gute SD-Karte.** SQLite auf einer billigen SD-Karte ist der häufigste Grund
  für „die App ist langsam“.
- Docker inkl. Compose-Plugin:
  ```bash
  curl -fsSL https://get.docker.com | sh
  sudo usermod -aG docker "$USER"   # danach neu einloggen
  ```

---

## Erstinstallation

### 1 — Image veröffentlichen lassen

Push auf `main` (oder Actions → **Release** → *Run workflow*) baut das Image für
`linux/arm64` und legt es unter `ghcr.io/toonvish/toon-recipe` ab.

Danach einmal das Paket auf **public** stellen: GitHub → Profil/Organisation → *Packages*
→ `toon-recipe` → *Package settings* → *Change visibility*. Dann braucht der Pi keine
Zugangsdaten zum Ziehen. (Alternative: privat lassen und sich auf dem Pi einmalig mit
einem Read-Only-PAT anmelden: `docker login ghcr.io -u <user>`.)

### 2 — Hostname festlegen

Alle Geräte müssen die App unter **demselben Namen** erreichen, denn das Zertifikat wird
pro Name ausgestellt. Ein Zugriff über die IP erzeugt eine neue Warnung.

- **FRITZ!Box (empfohlen):** der Pi ist als `<hostname>.fritz.box` erreichbar, sobald er
  im Netz ist. Also z. B. `TOON_HOSTNAME=rezepte.fritz.box`, wenn der Pi `rezepte` heißt.
- **`*.local`:** funktioniert per mDNS auf iOS/macOS zuverlässig, unter Android nur
  eingeschränkt.
- **Eigene Domain:** am besten, wenn du später ein echtes Zertifikat willst — siehe
  [Auf ein echtes Zertifikat wechseln](#auf-ein-echtes-zertifikat-wechseln).

### 3 — Verzeichnis und `.env` auf dem Pi

```bash
sudo mkdir -p /opt/toon-recipe/docker
sudo chown -R "$USER" /opt/toon-recipe
cd /opt/toon-recipe

# .env anlegen (die Vorlage steht im Repo unter docker/env.example)
cat > .env <<'EOF'
TOON_HOSTNAME=rezepte.fritz.box
SESSION_SECRET=
TOON_IMAGE=ghcr.io/toonvish/toon-recipe:latest
MAIL_FROM=Rezepte <rezepte@localhost>
TOON_MEM_LIMIT=1500m
EOF

# Secret erzeugen und eintragen
sed -i "s|^SESSION_SECRET=.*|SESSION_SECRET=$(openssl rand -hex 32)|" .env
chmod 600 .env
```

> **`SESSION_SECRET` nicht mehr ändern.** Er signiert auch die `?sig`-Parameter der
> `/uploads`-URLs. Ein neuer Wert macht alle bereits ausgelieferten Bild-URLs ungültig
> (die Bilder selbst bleiben erhalten).

`docker-compose.yml` und `docker/Caddyfile` gehören ebenfalls dorthin. Sie kommen aus dem
Repo und werden bei einem Update von Hand neu geholt (siehe [Update](#update)):

```bash
curl -fsSLO https://raw.githubusercontent.com/Toonvish/toon-recipe/main/docker-compose.yml
curl -fsSL  https://raw.githubusercontent.com/Toonvish/toon-recipe/main/docker/Caddyfile \
     -o docker/Caddyfile
docker compose up -d
```

### 4 — Das Wurzelzertifikat auf jedes Gerät bringen

**Dieser Schritt ist nicht optional, wenn die App als App laufen soll.** Caddy stellt das
Zertifikat mit einer eigenen lokalen CA aus. Ohne installiertes Wurzelzertifikat gibt es
nicht nur eine Warnung, sondern **keinen Service-Worker** — der Browser behandelt den
Origin trotz „trotzdem fortfahren“ als unsicher. Ohne Service-Worker:

- kein „Zum Homescreen hinzufügen“ / keine Installation,
- **keine Einkaufsliste offline** — genau das Feature, das offline funktionieren soll,
- keine gecachten Rezeptbilder.

Die App selbst funktioniert trotzdem, wie eine normale Webseite mit Warnung.

Zertifikat holen — im Browser des Geräts:

```
http://rezepte.fritz.box/toon-root-ca.crt
```

(absichtlich `http://`: ein Gerät, das die CA noch nicht kennt, kann sie nicht über das
von ihr signierte HTTPS laden, ohne in genau die Warnung zu laufen.)

Dann installieren:

- **iPhone / iPad:** Datei laden → *Einstellungen* → *Profil geladen* → **Installieren**.
  Danach **zwingend** *Einstellungen* → *Allgemein* → *Info* → *Zertifikatsvertrauens­einstellungen*
  → das Zertifikat **aktivieren**. Ohne diesen zweiten Schritt bleibt es wirkungslos.
- **Android:** *Einstellungen* → *Sicherheit* → *Verschlüsselung & Zugangsdaten* →
  *Zertifikat installieren* → *CA-Zertifikat* → Warnung bestätigen. Chrome auf Android
  akzeptiert nur so installierte Nutzer-CAs.
- **macOS:** Doppelklick → Schlüsselbund *System* → im Schlüsselbundverwalter das
  Zertifikat öffnen → *Vertrauen* → *Immer vertrauen*.
- **Windows:** Doppelklick → *Zertifikat installieren* → *Lokaler Computer* →
  *Vertrauenswürdige Stammzertifizierungsstellen*.
- **Linux:** `sudo cp toon-root-ca.crt /usr/local/share/ca-certificates/ && sudo update-ca-certificates`

> Das Volume `caddy-data` enthält den **privaten Schlüssel dieser CA**. Geht es verloren,
> erzeugt Caddy eine neue CA und das Wurzelzertifikat muss auf allen Geräten erneut
> installiert werden. Nicht in ein Backup legen, das du weitergibst.

### 5 — Ersten Account anlegen

`https://rezepte.fritz.box` öffnen und registrieren. Der erste Account bekommt automatisch
eine eigene Gruppe („Meine Rezepte“). Weitere Personen lädst du über
*Profil* → *Gruppen* → *Einladen* ein; der Einladungslink wird angezeigt **und** per Mail
verschickt (die dann in Mailpit landet).

---

## Betrieb

### Mails ansehen

Mailpit hört **nur auf dem Loopback-Interface des Pi**, nicht im LAN. Das ist Absicht: die
Mails enthalten Passwort-Reset- und Einladungslinks — wer das UI öffnen kann, kann jedes
Konto übernehmen. Zugriff per SSH-Tunnel:

```bash
ssh -N -L 8025:127.0.0.1:8025 <user>@<pi>
# dann http://localhost:8025 im Browser
```

### Update

Ein Push auf `main` veröffentlicht das neue Image, rollt es aber **nicht** aus. Auf dem Pi:

```bash
cd /opt/toon-recipe && docker compose pull && docker compose up -d --remove-orphans
docker compose ps                     # app soll "healthy" sein
```

Wenn sich `docker-compose.yml` oder `docker/Caddyfile` im Repo geändert haben, vorher neu
holen — der Pi bekommt sie nicht mehr von selbst:

```bash
cd /opt/toon-recipe
curl -fsSLO https://raw.githubusercontent.com/Toonvish/toon-recipe/main/docker-compose.yml
curl -fsSL  https://raw.githubusercontent.com/Toonvish/toon-recipe/main/docker/Caddyfile \
     -o docker/Caddyfile
```

`TOON_IMAGE` in der `.env` entscheidet, *was* gezogen wird. Steht dort `:latest`, holt
`pull` den neuesten `main`-Build; steht dort ein `@sha256:…`-Digest, bleibt die Version
festgenagelt, bis du sie änderst. Digests stehen in der Summary jedes Release-Laufs.

### Caddy und Mailpit aktualisieren

Beide sind in der `docker-compose.yml` **auf eine Version festgenagelt** und wandern
deshalb bei einem `docker compose pull` nicht mit. Das ist Absicht: ein gleitendes
`caddy:2-alpine` kann die TLS-Terminierung unter einer laufenden Installation
austauschen, und wenn dabei etwas schiefgeht, ist die Seite weg, über die du den Pi
erreichst. Sicherheitsupdates muss man dafür selbst einspielen — ein bis zwei Mal im
Jahr nachsehen genügt:

```bash
# aktuelle Versionen nachschlagen
curl -s https://api.github.com/repos/caddyserver/caddy/releases/latest  | grep '"tag_name"'
curl -s https://api.github.com/repos/axllent/mailpit/releases/latest    | grep '"tag_name"'
```

Dann die `image:`-Zeilen in `docker-compose.yml` im Repo anpassen, pushen und die Datei auf
dem Pi neu holen (siehe [Update](#update)). Vorher lokal gegenprüfen:

```bash
docker run --rm -v "$PWD/docker/Caddyfile:/etc/caddy/Caddyfile:ro" \
  -e TOON_HOSTNAME=rezepte.test caddy:<neue-version>-alpine \
  caddy validate --config /etc/caddy/Caddyfile
```

Die Bun-Version steht an einer Stelle: `ARG BUN_VERSION` im `Dockerfile`, plus
`.bun-version` für die CI. Beide müssen zusammenpassen.

### Rollback

Den Digest der guten Version holen: Actions → **Release** → vergangenen Lauf öffnen →
Digest aus der Summary kopieren. Dann auf dem Pi:

```bash
cd /opt/toon-recipe
sed -i "s|^TOON_IMAGE=.*|TOON_IMAGE=ghcr.io/toonvish/toon-recipe@sha256:<digest>|" .env
docker compose pull && docker compose up -d
```

Danach steht in der `.env` ein fester Digest. Für den nächsten normalen Update wieder auf
`TOON_IMAGE=ghcr.io/toonvish/toon-recipe:latest` zurückstellen.

> Migrationen laufen bei jedem Start und sind **nicht** rückwärts anwendbar. Ein Rollback
> auf ein Image vor einer Schema-Änderung braucht das Backup von vorher.

### Backup

Alles Wichtige liegt in einem Volume: `toon-data` (Datenbank, Uploads, OCR-Cache).

```bash
cd /opt/toon-recipe
docker compose stop app                       # SQLite konsistent sichern
docker run --rm -v toon-recipe_toon-data:/data -v "$PWD:/backup" alpine \
  tar czf "/backup/toon-$(date +%F).tar.gz" -C /data .
docker compose start app
```

Zurückspielen:

```bash
docker compose down
docker run --rm -v toon-recipe_toon-data:/data -v "$PWD:/backup" alpine \
  sh -c "rm -rf /data/* && tar xzf /backup/toon-2026-08-04.tar.gz -C /data"
docker compose up -d
```

Der genaue Volume-Name kommt aus `docker volume ls` (Präfix = `name:` in der
compose-Datei, also `toon-recipe_`).

### Logs

```bash
docker compose logs -f app        # API-Zugriffe, Import-/Mail-Fehler
docker compose logs -f caddy      # TLS, Zertifikate
docker compose ps                 # Health-Status
```

---

## Auf ein echtes Zertifikat wechseln

Sobald du eine eigene Domain hast, verschwinden Warnung und CA-Installation. In
`docker/Caddyfile` die Zeile `tls internal` ersetzen:

**Öffentlich erreichbarer Pi** (Ports 80/443 weitergeleitet) — Zeile einfach **löschen**.
Caddy holt automatisch ein Let's-Encrypt-Zertifikat.

**Pi bleibt im LAN** (empfohlen, keine offenen Ports) — DNS-01-Challenge, z. B. Cloudflare:

```
tls {
	dns cloudflare {env.CLOUDFLARE_API_TOKEN}
}
```

Dazu ein Caddy-Image mit dem DNS-Plugin bauen (`caddy:builder`, Modul
`github.com/caddy-dns/cloudflare`) und `CLOUDFLARE_API_TOKEN` im `caddy`-Service setzen.
Der Hostname in `TOON_HOSTNAME` muss dann die echte Domain sein, und `WEB_ORIGIN` /
`OAUTH_REDIRECT_BASE` folgen automatisch (sie werden in der compose-Datei daraus gebildet).

Danach ist auch `Strict-Transport-Security` sinnvoll — bei der lokalen CA ist es bewusst
nicht gesetzt, weil ein gepinntes HTTPS auf einem `.fritz.box`-Namen dich aussperren kann.

---

## Echte Mails nach draußen schicken

Mailpit liefert **nichts** aus, es sammelt nur. Für echte Zustellung im `app`-Service:

```yaml
MAIL_TRANSPORT: smtp
MAIL_HOST: smtp.dein-anbieter.de
MAIL_PORT: "587"
MAIL_SECURITY: starttls
MAIL_USER: ${MAIL_USER}
MAIL_PASSWORD: ${MAIL_PASSWORD}
MAIL_FROM: Rezepte <rezepte@deine-domain.de>
```

Es ist derselbe Adapter — nur ein anderes Ziel. Zwei Dinge dazu:

- **`MAIL_SECURITY=none` und Zugangsdaten schließen sich aus**, und die API startet in
  dieser Kombination absichtlich nicht: die Zugangsdaten gingen im Klartext über das Netz.
- **Einen eigenen Mailserver auf dem Pi zu betreiben, ist keine gute Idee.** Privat-IPs
  stehen praktisch überall auf Blocklisten; die Mails landen im Spam oder werden abgewiesen.
  Der SMTP-Zugang eines normalen Mailanbieters ist der pragmatische Weg — und es ist immer
  noch kein proprietärer API-Key.

Und: **ohne Mail funktioniert alles**, nur unbequemer. Einladungslinks zeigt die UI direkt
an, und ein ausgesperrter Account wird so entsperrt:

```bash
docker compose exec app bun apps/api/scripts/reset-password.ts <email>
```

---

## Fehlersuche

| Symptom | Ursache / Behebung |
| --- | --- |
| `exec format error` beim Start | 32-Bit-OS. `uname -m` muss `aarch64` sein. |
| Browser-Warnung **und** keine Installations-Option | Wurzelzertifikat fehlt oder ist auf iOS nicht *aktiviert* → [Schritt 4](#4--das-wurzelzertifikat-auf-jedes-gerät-bringen) |
| Einkaufsliste funktioniert offline nicht | Gleiche Ursache: kein Service-Worker ohne vertrauenswürdiges Zertifikat. In den DevTools unter *Application → Service Workers* prüfen. |
| Warnung, obwohl das Zertifikat installiert ist | Zugriff über IP oder einen anderen Namen als `TOON_HOSTNAME`. Immer denselben Namen benutzen. |
| App zeigt nach dem Update die alte Version | Meist ein CDN/Proxy davor. `sw.js` und `index.html` liefert die API mit `Cache-Control: no-cache` aus — das darf nichts überschreiben. |
| `ocr_failed` beim ersten Foto-Import | Sprachdaten fehlen im Volume. `docker compose exec app ls data/tessdata` prüfen, sonst `docker compose exec app bun run ocr:prefetch` (braucht einmal ausgehendes HTTPS). |
| Import bricht bei großen PDFs ab | Speicher. `TOON_MEM_LIMIT` prüfen; auf einem 2-GB-Pi `1200m`. |
| Container ständig `unhealthy` | `docker compose logs app`. Meist eine fehlende Variable — die API nennt sie beim Start im Klartext. |
| `docker compose pull` scheitert mit `denied` | GHCR-Package ist privat. Entweder auf *public* stellen (siehe [Schritt 1](#1--image-veröffentlichen-lassen)) oder auf dem Pi `docker login ghcr.io -u <user>` mit einem Read-Only-PAT. |
| `docker compose pull` holt nichts Neues | In der `.env` steht ein fester `@sha256:…`-Digest in `TOON_IMAGE`. Für laufende Updates auf `:latest` zurückstellen. |

---

## Lokal testen, ohne Pi

Der Stack läuft auch auf einem Laptop, mit `rezepte.test` als Hostname:

```bash
docker build -t toon-recipe:local .
echo "127.0.0.1 rezepte.test" | sudo tee -a /etc/hosts

cat > .env.local-stack <<'EOF'
TOON_HOSTNAME=rezepte.test
SESSION_SECRET=lokal-nur-zum-testen-lokal-nur-zum-testen
TOON_IMAGE=toon-recipe:local
EOF

docker compose --env-file .env.local-stack -p toonstack up -d
# https://rezepte.test  (Warnung wegzuklicken oder das Zertifikat wie oben installieren)
docker compose -p toonstack down -v
```
