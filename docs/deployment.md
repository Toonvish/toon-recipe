# Deployment auf einem kleinen Server

Ein Container-Stack, ein Origin, keine fremden Dienste. Zielbild ist ein günstiger VPS mit einer
eigenen Domain — es läuft aber auf jedem 64-Bit-Linux mit Docker, auch auf einer Kiste im LAN
(siehe [Ohne eigene Domain](#ohne-eigene-domain-im-lan)).

**GitHub Actions baut nur, es deployt nicht.** Jeder Push auf `main` veröffentlicht ein
neues Image auf GHCR; ausgerollt wird es von Hand auf dem Server:

```bash
cd /opt/toon-recipe && docker compose pull && docker compose up -d --remove-orphans
```

Das ist eine bewusste Entscheidung: so liegt kein SSH-Schlüssel für den Server in den
GitHub-Secrets, und der SSH-Port muss nicht aus dem Internet erreichbar sein.

> **Ganz von vorn — frisch bestellter VPS, kein Docker, keine DNS-Einträge?** Dann ist
> **[docs/server-setup.md](./server-setup.md)** die Anleitung: Grundeinrichtung, SSH, Firewall,
> Swap, Docker, DNS. Dieses Dokument hier setzt einen Server mit Docker voraus und ist danach die
> Referenz für Konfiguration und Betrieb.

---

## Was hier läuft

```
        Handy / Laptop
              │  https://rezepte.example.org
              ▼
    ┌─────────────────────┐
    │ caddy               │  TLS (Let's Encrypt), 80 + 443
    └──────────┬──────────┘
               │ http, nur im Docker-Netz
    ┌──────────▼──────────┐        ┌──────────────────────┐
    │ app                 │───────►│ mailpit              │
    │ API + PWA, ein Port │  SMTP  │ SMTP-Senke + Web-UI  │
    └──────────┬──────────┘        └──────────────────────┘
               │                    (oder ein echter Relay,
        Volume toon-data              siehe Schritt 4)
        (Datenbank · Uploads)
```

**Kein einziger API-Key ist nötig, um das zu starten.** Was einmal extern war:

| vorher | jetzt |
| --- | --- |
| Resend (`MAIL_API_KEY`) | derselbe SMTP-Adapter — gegen `mailpit` im Stack oder gegen den SMTP-Zugang eines beliebigen Mailanbieters. Kein API-Key nötig. |
| Turso (`DATABASE_AUTH_TOKEN`) | war schon optional — eine libSQL-Datei im Volume |
| OCR | lief schon serverseitig; **jetzt optional** — nur mit `--build-arg WITH_OCR=1` im Image (siehe unten) |
| Google-/GitHub-Login | **bleibt extern und ist bewusst aus.** E-Mail + Passwort ist der selbstgehostete Weg. |

Es gibt keinen selbstgehosteten Ersatz für Google-/GitHub-OAuth — dafür wäre ein eigener
OIDC-Provider (Authentik, Keycloak) plus eine generische OIDC-Anbindung nötig, die die App
heute nicht hat. Ohne OAuth fehlt nichts: Registrierung, Login, Einladungen und
Passwort-Reset funktionieren vollständig.

---

## Voraussetzungen

- **64-Bit-Linux mit Docker**, `x86_64` oder `arm64` — das Image gibt es für beide. `uname -m` muss
  `x86_64` oder `aarch64` ausgeben; für 32-Bit gibt es kein Bun, dort lässt sich das Image nicht
  starten.
- **RAM: hängt am Foto-/PDF-Import.** Ohne ihn — dem Standard, siehe „Import per Foto/PDF ist
  optional“ — bleiben Bun, die libSQL-Datei und das Ausliefern der PWA übrig; das läuft in
  **512 MB bis 1 GB**. Mit OCR gilt **mindestens 2 GB mit Reserve**: die Texterkennung ist der
  Speicherfresser. Als Referenz: ein Ein-Kern-VPS mit 1 GB RAM und 30 GB SSD (z. B. netcup VPS pico,
  Hetzner CX/CAX, Oracle Free Tier) trägt den Standardbetrieb bequem.
- **1–2 GB Swap.** Nicht für den Normalbetrieb, sondern damit ein Ausreißer nicht sofort den
  OOM-Killer holt — siehe [server-setup.md](./server-setup.md).
- **SSD.** SQLite auf langsamem Speicher ist der häufigste Grund für „die App ist langsam“.
- **Eine (Sub-)Domain mit A-Record auf die Server-IP** (plus AAAA, wenn es IPv6 gibt) und
  **erreichbare Ports 80 + 443** — beides braucht Caddy für das Let's-Encrypt-Zertifikat.
- Docker inkl. Compose-Plugin:
  ```bash
  curl -fsSL https://get.docker.com | sh
  sudo usermod -aG docker "$USER"   # danach neu einloggen
  ```

---

## Erstinstallation

### 1 — Image veröffentlichen lassen

Push auf `main` (oder Actions → **Release** → *Run workflow*) baut das Image für
`linux/amd64` **und** `linux/arm64` und legt es unter `ghcr.io/toonvish/toon-recipe` ab.

Danach einmal das Paket auf **public** stellen: GitHub → Profil/Organisation → *Packages*
→ `toon-recipe` → *Package settings* → *Change visibility*. Dann braucht der Server keine
Zugangsdaten zum Ziehen. (Alternative: privat lassen und sich auf dem Server einmalig mit
einem Read-Only-PAT anmelden: `docker login ghcr.io -u <user>`.)

Das veröffentlichte Image ist die **schlanke Variante ohne OCR**. Wer Foto-/PDF-Import will, baut
selbst — siehe [Import per Foto/PDF ist optional](#import-per-fotopdf-ist-optional).

### 2 — Hostname und DNS

Alle Geräte müssen die App unter **demselben Namen** erreichen: das Zertifikat wird pro Name
ausgestellt, ein Zugriff über die IP erzeugt eine neue Warnung, und `WEB_ORIGIN` — also die Links in
den ausgehenden Mails — wird daraus gebildet.

Beim DNS-Anbieter der Domain also anlegen:

```
rezepte   A      <IPv4 des Servers>
rezepte   AAAA   <IPv6 des Servers>     # nur wenn der Server IPv6 hat
```

Kontrollieren, bevor der Stack startet — ein falscher Eintrag kostet sonst ein
Let's-Encrypt-Rate-Limit:

```bash
dig +short rezepte.example.org
```

### 3 — Verzeichnis und `.env` auf dem Server

```bash
sudo mkdir -p /opt/toon-recipe/docker
sudo chown -R "$USER" /opt/toon-recipe
cd /opt/toon-recipe

# .env anlegen (die Vorlage steht im Repo unter docker/env.example)
cat > .env <<'EOF'
TOON_HOSTNAME=rezepte.example.org
SESSION_SECRET=
TOON_IMAGE=ghcr.io/toonvish/toon-recipe:latest
MAIL_FROM=Rezepte <rezepte@example.org>
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
```

### 4 — Mailversand einrichten

Ohne weitere Angaben liefert die App an den **Mailpit**-Container im Stack. Der sammelt Mails und
schickt **nichts** raus — gut für den ersten Blick, unbrauchbar für einen Passwort-Reset an eine
echte Adresse. Für echte Zustellung gehört der SMTP-Zugang eines Mailanbieters in die `.env`:

```bash
cat >> .env <<'EOF'
MAIL_HOST=mx.example.net
MAIL_PORT=465
MAIL_SECURITY=tls
MAIL_USER=rezepte@example.org
MAIL_PASSWORD=…
MAIL_FROM=Rezepte <rezepte@example.org>
EOF
```

Es ist derselbe Adapter wie für Mailpit, nur ein anderes Ziel. Vier Dinge dazu:

- **`MAIL_SECURITY`**: `tls` = implizites TLS auf Port 465 (empfohlen), `starttls` = Upgrade auf
  Port 587. `none` ist nur für einen Relay im eigenen Netz gedacht, und **`none` zusammen mit
  Zugangsdaten verweigert die API beim Start** — die gingen im Klartext über das Netz.
- **`MAIL_FROM` muss eine Adresse sein, die der Relay senden darf.** Sonst weist er die Mail ab.
- **SPF, DKIM und DMARC beim Anbieter einrichten** und die Records in die DNS-Zone der Domain
  legen. Ohne sie landen Reset- und Einladungsmails im Spam, wo sie nichts nützen.
- **Einen eigenen Mailserver auf demselben Server zu betreiben, ist keine gute Idee.** Frische
  VPS-IP-Bereiche stehen praktisch überall auf Blocklisten, und Port 25 ausgehend ist bei vielen
  Anbietern gesperrt. Der SMTP-Zugang eines normalen Mailanbieters ist der pragmatische Weg — und
  es ist immer noch kein proprietärer API-Key. (`MAIL_TRANSPORT=resend` gibt es auch, dann mit
  `MAIL_API_KEY`.)

Prüfen, ob es wirklich rausgeht: eine Passwort-Reset-Mail an eine eigene, externe Adresse anfordern
und in `docker compose logs app` nach `[mail]` sehen — ein fehlgeschlagener Versand steht dort mit
Grund, bricht die Aktion aber bewusst nicht ab.

**Ohne Mail funktioniert alles**, nur unbequemer: Einladungslinks zeigt die UI direkt an, und ein
ausgesperrter Account wird so entsperrt:

```bash
docker compose exec app bun apps/api/scripts/reset-password.ts <email>
```

### 5 — Starten und ersten Account anlegen

```bash
cd /opt/toon-recipe
docker compose up -d
docker compose ps                     # app soll "healthy" sein
docker compose logs -f caddy          # das Zertifikat kommt in den ersten Sekunden
```

Dann `https://rezepte.example.org` öffnen und registrieren. Der erste Account bekommt automatisch
eine eigene Gruppe („Meine Rezepte“). Weitere Personen lädst du über *Profil* → *Gruppen* →
*Einladen* ein; der Einladungslink wird angezeigt **und** per Mail verschickt.

Die App ist installierbar (Android: ⋮ → *App installieren*, iOS: *Teilen* → *Zum Home-Bildschirm*)
und die Einkaufsliste funktioniert danach offline — beides hängt am Service-Worker und der am
gültigen Zertifikat, das hier von selbst da ist.

---

## Betrieb

### Mails ansehen (Mailpit)

Mailpit hört **nur auf dem Loopback-Interface des Servers**, nicht öffentlich. Das ist Absicht: die
Mails enthalten Passwort-Reset- und Einladungslinks — wer das UI öffnen kann, kann jedes Konto
übernehmen. Zugriff per SSH-Tunnel:

```bash
ssh -N -L 8025:127.0.0.1:8025 <user>@<server>
# dann http://localhost:8025 im Browser
```

Mit einem echten Relay ist Mailpit nur noch Beiwerk; wer es loswerden will, löscht den Service und
das `depends_on` aus der `docker-compose.yml`.

### Update

Ein Push auf `main` veröffentlicht das neue Image, rollt es aber **nicht** aus. Auf dem Server:

```bash
cd /opt/toon-recipe && docker compose pull && docker compose up -d --remove-orphans
docker compose ps                     # app soll "healthy" sein
```

Wenn sich `docker-compose.yml` oder `docker/Caddyfile` im Repo geändert haben, vorher neu
holen — der Server bekommt sie nicht von selbst:

```bash
cd /opt/toon-recipe
curl -fsSLO https://raw.githubusercontent.com/Toonvish/toon-recipe/main/docker-compose.yml
curl -fsSL  https://raw.githubusercontent.com/Toonvish/toon-recipe/main/docker/Caddyfile \
     -o docker/Caddyfile
```

`TOON_IMAGE` in der `.env` entscheidet, *was* gezogen wird. Steht dort `:latest`, holt
`pull` den neuesten `main`-Build; steht dort ein `@sha256:…`-Digest, bleibt die Version
festgenagelt, bis du sie änderst. Digests stehen in der Summary jedes Release-Laufs.

#### Wie die neue Version auf die Geräte kommt

**Nichts zu tun — die installierte App holt sie selbst.** Sie fragt beim Server nach einer
neuen Version, sobald sie in den Vordergrund kommt (dazu noch alle 30 Minuten und wenn die
Verbindung zurückkommt), lädt sie im Hintergrund und startet sich dann neu. Eine
installierte iOS-Web-App navigiert nur beim Start, deshalb ist der Vordergrund-Check der
entscheidende: einmal aus dem App-Switcher zurückholen genügt.

Ausnahme: **wenn gerade ungespeicherte Eingaben auf dem Bildschirm stehen** (ein halb
getipptes Rezept, ein Import-Entwurf mit offenen Änderungen) lädt sie *nicht* von selbst neu
— sonst wären die Eingaben weg. Stattdessen erscheint oben ein Hinweis „Neue Version
verfügbar“ mit einem Knopf. Speichern reicht auch: dann zieht sie das Update selbst nach.

Wenn eine App tagelang auf einer alten Version hängt, liegt es fast immer daran, dass etwas
`sw.js` oder `index.html` zwischenspeichert. Prüfen mit:

```bash
curl -sI https://<hostname>/sw.js | grep -i cache-control   # muss "no-cache" sein
```

### Caddy und Mailpit aktualisieren

Beide sind in der `docker-compose.yml` **auf eine Version festgenagelt** und wandern
deshalb bei einem `docker compose pull` nicht mit. Das ist Absicht: ein gleitendes
`caddy:2-alpine` kann die TLS-Terminierung unter einer laufenden Installation
austauschen, und wenn dabei etwas schiefgeht, ist die Seite weg, über die du den Server
erreichst. Sicherheitsupdates muss man dafür selbst einspielen — ein bis zwei Mal im
Jahr nachsehen genügt:

```bash
# aktuelle Versionen nachschlagen
curl -s https://api.github.com/repos/caddyserver/caddy/releases/latest  | grep '"tag_name"'
curl -s https://api.github.com/repos/axllent/mailpit/releases/latest    | grep '"tag_name"'
```

Dann die `image:`-Zeilen in `docker-compose.yml` im Repo anpassen, pushen und die Datei auf
dem Server neu holen (siehe [Update](#update)). Vorher lokal gegenprüfen:

```bash
docker run --rm -v "$PWD/docker/Caddyfile:/etc/caddy/Caddyfile:ro" \
  -e TOON_HOSTNAME=rezepte.test caddy:<neue-version>-alpine \
  caddy validate --config /etc/caddy/Caddyfile
```

Die Bun-Version steht an einer Stelle: `ARG BUN_VERSION` im `Dockerfile`, plus
`.bun-version` für die CI. Beide müssen zusammenpassen.

### Rollback

Den Digest der guten Version holen: Actions → **Release** → vergangenen Lauf öffnen →
Digest aus der Summary kopieren. Dann auf dem Server:

```bash
cd /opt/toon-recipe
sed -i "s|^TOON_IMAGE=.*|TOON_IMAGE=ghcr.io/toonvish/toon-recipe@sha256:<digest>|" .env
docker compose pull && docker compose up -d
```

Danach steht in der `.env` ein fester Digest. Für das nächste normale Update wieder auf
`TOON_IMAGE=ghcr.io/toonvish/toon-recipe:latest` zurückstellen.

> Migrationen laufen bei jedem Start und sind **nicht** rückwärts anwendbar. Ein Rollback
> auf ein Image vor einer Schema-Änderung braucht das Backup von vorher.

### Backup

Alles Wichtige liegt in einem Volume: `toon-data` (Datenbank, Uploads).

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
compose-Datei, also `toon-recipe_`). Ein Snapshot beim Hoster ersetzt das nicht: eine laufende
SQLite-Datei im Snapshot ist nicht garantiert konsistent, die zwei Zeilen oben sind es.

### Logs

```bash
docker compose logs -f app        # API-Zugriffe, Import-/Mail-Fehler
docker compose logs -f caddy      # TLS, Zertifikate
docker compose ps                 # Health-Status
```

---

## Ohne eigene Domain (im LAN)

Ohne öffentlich auflösbaren Namen kann Caddy kein Let's-Encrypt-Zertifikat holen. Dann stellt es
eins mit einer **eigenen lokalen CA** aus:

```bash
# in der .env
TOON_TLS_ISSUER=internal
TOON_HSTS_MAX_AGE=0          # HSTS auf einem internen Namen sperrt dich sonst aus
TOON_HOSTNAME=rezepte.fritz.box
```

Als Name geht alles, was im Netz auflöst: `<hostname>.fritz.box` an einer FRITZ!Box, ein
`*.local`-Name per mDNS (iOS/macOS zuverlässig, Android nur eingeschränkt) oder ein fester Eintrag
im Router.

**Das Wurzelzertifikat muss dann auf jedes Gerät.** Ohne installiertes Wurzelzertifikat gibt es
nicht nur eine Warnung, sondern **keinen Service-Worker** — der Browser behandelt den Origin trotz
„trotzdem fortfahren“ als unsicher. Ohne Service-Worker:

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

> Das Volume `caddy-data` enthält dann den **privaten Schlüssel dieser CA**. Geht es verloren,
> erzeugt Caddy eine neue CA und das Wurzelzertifikat muss auf allen Geräten erneut
> installiert werden. Nicht in ein Backup legen, das du weitergibst.

**Dritter Fall — eigene Domain, aber keine offenen Ports** (Server im LAN, öffentliche
DNS-Einträge): DNS-01-Challenge. Dazu im `Caddyfile` den Issuer aufmachen, z. B. Cloudflare:

```
tls {
	issuer acme {
		dns cloudflare {env.CLOUDFLARE_API_TOKEN}
	}
}
```

Dazu ein Caddy-Image mit dem DNS-Plugin bauen (`caddy:builder`, Modul
`github.com/caddy-dns/cloudflare`) und `CLOUDFLARE_API_TOKEN` im `caddy`-Service setzen.

---

## Import per Foto/PDF ist optional

Standardmäßig **aus**, und das veröffentlichte Image enthält die Binaries nicht. Import per
Webadresse und per eingefügtem Text ist reines Abrufen und Parsen; OCR ist der einzige Teil dieser
App mit echtem Appetit: `tesseract` und `pdftoppm` sind mit Sprachdaten ~120 MB, und ein laufender
Job hält `sharp`, ein dekodiertes ~2000-px-Bild und bei einem PDF das komplette geparste Dokument
von `unpdf` im Speicher. Genau deshalb ist es abschaltbar — so passt die App auf einen 1-GB-VPS.

**Es sind zwei Schalter, und beide gehören zusammen:**

| | wo | Wirkung |
| --- | --- | --- |
| `--build-arg WITH_OCR=1` | `docker build` | installiert `tesseract-ocr`, `tesseract-ocr-deu`, `tesseract-ocr-eng`, `poppler-utils` ins Image |
| `IMPORT_OCR_ENABLED=1` | Laufzeit (`.env`) | schaltet die Endpunkte frei. **Standard ist der Wert des Build-Args**, das Image ist also von sich aus konsistent. |

```bash
# schlank (Standard, und was in GHCR liegt): kein tesseract, kein poppler
docker build -t toon-recipe:local .

# mit Foto-/PDF-Import
docker build --build-arg WITH_OCR=1 -t toon-recipe:local .
```

Wer OCR auf dem Server will, braucht also ein eigenes Image (auf dem Laptop bauen und in eine
Registry pushen oder per `docker save | ssh … docker load` übertragen — auf einem Ein-Kern-VPS zu
bauen ist Geduldsarbeit) **und ab 2 GB RAM**, plus `MAX_CONCURRENT_OCR=1` am unteren Ende.

Ist es aus, verhält sich die App durchgehend so:

- `POST /imports/{image,pdf,file}` antworten **`501 ocr_disabled`** mit einer deutschen Meldung,
  die auf Webadresse und Text verweist. Die Prüfung läuft **vor** dem Rate-Limit und **vor** dem
  Lesen des Bodys — eine abgelehnte 15-MB-Datei wird also nie gepuffert.
- `/api/health` meldet `features.ocrImport: false`, und die Weboberfläche **blendet die Abschnitte
  „Foto vom Rezept“ und „PDF oder Bilddatei“ aus** statt einen Knopf anzubieten, der nicht kann.
- Alles andere bleibt: Webadresse, Text, Entwurfsprüfung, Speichern — und ein Entwurf, den ein
  früherer Foto-Import erzeugt hat, bleibt prüf- und speicherbar.

`IMPORT_OCR_ENABLED=1` auf einem schlanken Image ist kein Absturz, sondern der dokumentierte 422,
der das fehlende Binary nennt (`tesseract_unavailable` bzw. `rasterization_unavailable`). Sinnvoll
ist es trotzdem nicht — dann lieber neu bauen.

---

## Fehlersuche

| Symptom | Ursache / Behebung |
| --- | --- |
| `exec format error` beim Start | 32-Bit-Userland. `uname -m` muss `x86_64` oder `aarch64` sein. |
| Kein Zertifikat, `caddy`-Log nennt ACME-Fehler | DNS zeigt nicht auf diesen Server, Port 80/443 nicht erreichbar, oder `TOON_HOSTNAME` ist ein interner Name → dann `TOON_TLS_ISSUER=internal`. `dig +short <hostname>` und `curl -I http://<hostname>` von außen prüfen. |
| Browser-Warnung **und** keine Installations-Option | Interne CA ohne installiertes Wurzelzertifikat (auf iOS zusätzlich *aktivieren*) → [Ohne eigene Domain](#ohne-eigene-domain-im-lan) |
| Einkaufsliste funktioniert offline nicht | Gleiche Ursache: kein Service-Worker ohne vertrauenswürdiges Zertifikat. In den DevTools unter *Application → Service Workers* prüfen. |
| Warnung, obwohl das Zertifikat installiert ist | Zugriff über IP oder einen anderen Namen als `TOON_HOSTNAME`. Immer denselben Namen benutzen. |
| Mails kommen nicht an | Ohne `MAIL_HOST` liefert die App an Mailpit, das nichts zustellt (Schritt 4). Mit Relay: `docker compose logs app \| grep '\[mail\]'`, und SPF/DKIM/DMARC prüfen, bevor du dem Spam-Ordner misstraust. |
| API startet nicht, meckert über `MAIL_SECURITY` | `none` zusammen mit `MAIL_USER`/`MAIL_PASSWORD` ist absichtlich verboten — `tls` (465) oder `starttls` (587) benutzen. |
| App zeigt nach dem Update die alte Version | Meist ein CDN/Proxy davor. `sw.js` und `index.html` liefert die API mit `Cache-Control: no-cache` aus — das darf nichts überschreiben. |
| `501 ocr_disabled` beim Foto-Import | Erwartet: das GHCR-Image ist die schlanke Variante. Eigenes Image mit `--build-arg WITH_OCR=1` bauen. |
| `ocr_failed` bei jedem Foto-Import | `IMPORT_OCR_ENABLED=1` auf einem Image ohne die Binaries. `docker compose exec app tesseract --list-langs` muss `deu` und `eng` zeigen. `reason` sagt, was fehlt: `tesseract_unavailable` (Binary) oder `language_data_missing` (Sprachpaket). Nichts wird zur Laufzeit nachgeladen. |
| `pdf_no_text_layer` bei jedem gescannten PDF | poppler fehlt: `docker compose exec app pdftoppm -v`. |
| Import bricht bei großen PDFs ab | Speicher. `TOON_MEM_LIMIT` prüfen und Swap; unter 2 GB RAM ist OCR nicht vorgesehen. |
| Container ständig `unhealthy` | `docker compose logs app`. Meist eine fehlende Variable — die API nennt sie beim Start im Klartext. |
| `docker compose pull` scheitert mit `denied` | GHCR-Package ist privat. Entweder auf *public* stellen (siehe [Schritt 1](#1--image-veröffentlichen-lassen)) oder auf dem Server `docker login ghcr.io -u <user>` mit einem Read-Only-PAT. |
| `docker compose pull` holt nichts Neues | In der `.env` steht ein fester `@sha256:…`-Digest in `TOON_IMAGE`. Für laufende Updates auf `:latest` zurückstellen. |

---

## Lokal testen, ohne Server

Der Stack läuft auch auf einem Laptop, mit `rezepte.test` als Hostname. Dort gibt es kein
öffentliches DNS, also die interne CA benutzen:

```bash
docker build -t toon-recipe:local .          # ohne OCR (Standard)
# mit Foto-/PDF-Import:  docker build --build-arg WITH_OCR=1 -t toon-recipe:local .
echo "127.0.0.1 rezepte.test" | sudo tee -a /etc/hosts

cat > .env.local-stack <<'EOF'
TOON_HOSTNAME=rezepte.test
SESSION_SECRET=lokal-nur-zum-testen-lokal-nur-zum-testen
TOON_IMAGE=toon-recipe:local
TOON_TLS_ISSUER=internal
TOON_HSTS_MAX_AGE=0
EOF

docker compose --env-file .env.local-stack -p toonstack up -d
# https://rezepte.test  (Warnung wegklicken oder das Zertifikat wie oben installieren)
docker compose -p toonstack down -v
```
