# Vom frischen Raspberry Pi zur installierten App

Diese Anleitung fängt bei einer **leeren SD-Karte** an und endet mit der App als Icon auf dem
Homescreen. Sie ist einmal von oben nach unten durchzuarbeiten; jeder Schritt hat eine Prüfung,
die entweder klappt oder den Fehler nennt.

Danach ist [docs/deployment.md](./deployment.md) die Referenz für den **Betrieb** (Update,
Rollback, Backup, Logs, echte Mails, echtes Zertifikat) — das wird hier nicht wiederholt.

| | |
| --- | --- |
| Zeitbedarf | ca. 45 Minuten, davon ~20 Minuten Warten |
| Was danach läuft | API + PWA + TLS + lokaler Mailserver, alles auf dem Pi |
| Fremde Dienste | **keine.** Kein API-Key, kein Account, keine Cloud-Datenbank |

---

## 0 — Was du brauchst

- **Raspberry Pi 4 oder 5.** Ein 32-Bit-System reicht nicht: es gibt kein Bun für 32-Bit-ARM,
  das Image lässt sich dort nicht einmal starten. Später prüft das `uname -m`.
- **Mindestens 2 GB RAM.** Der Tesseract-Worker beim Foto-Import ist der Speicherfresser.
  Ein Foto-Import dauert auf einem Pi 4 rund 10–30 s.
- **SSD am USB-3-Port oder eine gute A2-SD-Karte.** SQLite auf einer billigen Karte ist der
  häufigste Grund für „die App ist langsam“.
- Ein Rechner mit dem **Raspberry Pi Imager** und ein Netzwerkkabel oder WLAN-Zugang.
- Optional, aber deutlich bequemer: ein GitHub-Account, damit das Image in der CI gebaut wird
  (Weg **A** in [Schritt 5](#5--das-image-auf-den-pi-bringen)) statt auf dem Pi.

---

## 1 — Betriebssystem schreiben

Im **Raspberry Pi Imager**:

1. *Choose OS* → **Raspberry Pi OS Lite (64-bit)**. „Lite“ genügt — es läuft nur Docker darauf,
   ein Desktop kostet nur RAM. Entscheidend ist **64-bit**.
2. *Choose Storage* → die Karte bzw. die SSD.
3. **Zahnrad / „Einstellungen bearbeiten“** — hier gleich alles setzen, dann ist kein Monitor
   nötig:
   - **Hostname:** `rezepte` (dieser Name wird gleich Teil der Adresse: `rezepte.fritz.box`)
   - **Benutzer + Passwort** anlegen
   - **SSH aktivieren** → *Public-Key-Authentifizierung* wenn du einen Schlüssel hast
   - **WLAN** eintragen, falls kein Kabel

Karte in den Pi, Strom dran, ein bis zwei Minuten warten.

```bash
ssh <benutzer>@rezepte.fritz.box     # oder rezepte.local
uname -m                             # MUSS aarch64 ausgeben
```

> Gibt `uname -m` `armv7l` aus, ist ein 32-Bit-Image geschrieben worden. Dann hier abbrechen
> und die Karte mit der 64-Bit-Variante neu schreiben — jeder weitere Schritt wäre umsonst.

---

## 2 — Grundeinrichtung

```bash
sudo apt update && sudo apt full-upgrade -y
```

**Hostname prüfen.** Alle Geräte müssen die App später unter *genau demselben* Namen aufrufen,
weil das Zertifikat pro Name ausgestellt wird. Der Name aus dem Imager steht in `hostnamectl`;
ändern ginge mit `sudo hostnamectl set-hostname rezepte` (danach neu starten).

- **FRITZ!Box:** der Pi ist automatisch als `<hostname>.fritz.box` erreichbar → Adresse ist
  `rezepte.fritz.box`.
- **`*.local`** (mDNS): auf iOS/macOS zuverlässig, unter Android nur eingeschränkt.
- **Eigene Domain:** der beste Weg, wenn du später ein echtes Zertifikat willst — siehe
  „Auf ein echtes Zertifikat wechseln“ in [deployment.md](./deployment.md#auf-ein-echtes-zertifikat-wechseln).

Sinnvoll, sobald der Pi per SSH von außen erreichbar sein soll (z. B. für den späteren
Auto-Deploy): in `/etc/ssh/sshd_config` `PasswordAuthentication no` setzen und Schlüssel
benutzen.

---

## 3 — Zwei Pi-Eigenheiten vorher geradeziehen

### 3a — Memory-cgroup einschalten

Raspberry Pi OS startet den Kernel **ohne** Memory-Cgroup. Docker ignoriert dann jedes
Speicherlimit stillschweigend — also auch `TOON_MEM_LIMIT` aus der compose-Datei. Genau dieses
Limit soll verhindern, dass ein Tesseract-Worker bei einem 12-MP-Foto den ganzen Pi mitnimmt
statt nur den eigenen Container.

`/boot/firmware/cmdline.txt` ist **eine einzige Zeile** — die Parameter müssen ans Ende
derselben Zeile, nicht in eine neue:

```bash
sudo sed -i '1 s/$/ cgroup_memory=1 cgroup_enable=memory/' /boot/firmware/cmdline.txt
cat /boot/firmware/cmdline.txt      # kontrollieren: eine Zeile, Parameter am Ende
sudo reboot
```

(Auf älteren Systemen ohne `/boot/firmware/` heißt die Datei `/boot/cmdline.txt`.)

Nach dem Reboot in [Schritt 4](#4--docker-installieren) prüfen — `docker info` sagt es dann
selbst.

### 3b — Swap vergrößern

Standard sind 100 MB. Das reicht für den laufenden Betrieb, aber nicht, wenn das Image auf dem
Pi gebaut werden soll (Weg **C**) oder bei 2 GB RAM ein PDF-Import dazwischenkommt:

```bash
sudo dphys-swapfile swapoff
sudo sed -i 's/^CONF_SWAPSIZE=.*/CONF_SWAPSIZE=2048/' /etc/dphys-swapfile
sudo dphys-swapfile setup && sudo dphys-swapfile swapon
free -h                             # Swap: ~2,0Gi
```

---

## 4 — Docker installieren

```bash
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker "$USER"
exit                                 # neu einloggen, sonst greift die Gruppe nicht
```

Neu einloggen und prüfen:

```bash
docker run --rm hello-world          # läuft ohne sudo?
docker info | grep -i -e warning -e cgroup
```

Erwartet: `Cgroup Version: 2`, `Cgroup Driver: systemd`, und **keine** Zeile
`WARNING: No memory limit support`. Steht sie doch da, hat [Schritt 3a](#3a--memory-cgroup-einschalten)
nicht gegriffen.

---

## 5 — Das Image auf den Pi bringen

Es gibt drei Wege. **A** ist der bequemste und der, den das Repo vorbereitet hat; **B**
braucht keinen GitHub-Account; **C** braucht gar keinen zweiten Rechner, kostet dafür Zeit.

### Weg A — von GHCR ziehen (empfohlen)

Ein Push auf `main` (oder Actions → **Release** → *Run workflow*) baut das Image für
`linux/arm64` und legt es unter `ghcr.io/toonvish/toon-recipe:latest` ab.

Danach das Paket **einmal** auf *public* stellen: GitHub → *Packages* → `toon-recipe` →
*Package settings* → *Change visibility*. Dann braucht der Pi keine Zugangsdaten.

Bleibt es privat, muss sich der Pi anmelden (Read-Only-PAT mit `read:packages`):

```bash
echo "<PAT>" | docker login ghcr.io -u <github-user> --password-stdin
```

In der `.env` aus [Schritt 6](#6--verzeichnis-compose-dateien-env):
`TOON_IMAGE=ghcr.io/toonvish/toon-recipe:latest`

### Weg B — auf dem Laptop bauen, per SSH übertragen

Auf dem **Laptop**, im Repo (x86-Rechner brauchen einmalig die ARM-Emulation):

```bash
docker run --privileged --rm tonistiigi/binfmt --install arm64
docker buildx build --platform linux/arm64 -t toon-recipe:local --load . > /tmp/build.log 2>&1
echo $?      # 0 = ok. NICHT durch eine Pipe prüfen: der Exit-Code wäre der von tail
```

Übertragen und auf dem Pi kontrollieren, dass es angekommen ist:

```bash
docker save toon-recipe:local | gzip | ssh <benutzer>@rezepte.fritz.box 'gunzip | docker load'
ssh <benutzer>@rezepte.fritz.box 'docker images toon-recipe'
```

`.env`: `TOON_IMAGE=toon-recipe:local`

### Weg C — direkt auf dem Pi bauen

Braucht das Repo auf dem Pi, den vergrößerten Swap aus [Schritt 3b](#3b--swap-vergrößern) und
Geduld: der Web-Build und die OCR-Sprachdaten entstehen hier nativ auf dem Pi statt auf einem
CI-Runner, das sind je nach Modell 20–60 Minuten.

```bash
sudo apt install -y git
git clone https://github.com/Toonvish/toon-recipe.git ~/toon-recipe
cd ~/toon-recipe
docker build -t toon-recipe:local . > /tmp/build.log 2>&1
echo $?      # 0 = ok; sonst: tail -40 /tmp/build.log
```

`.env`: `TOON_IMAGE=toon-recipe:local`

> Warum nicht `docker build … | tail`: der Exit-Code einer Pipeline ist der des **letzten**
> Befehls, ein gescheiterter Build sähe damit wie ein Erfolg aus.

---

## 6 — Verzeichnis, compose-Dateien, `.env`

```bash
sudo mkdir -p /opt/toon-recipe/docker
sudo chown -R "$USER" /opt/toon-recipe
cd /opt/toon-recipe
```

`docker-compose.yml` und `docker/Caddyfile` kommen aus dem Repo. Beim späteren Auto-Deploy
kopiert der Job sie bei jedem Lauf dorthin; jetzt einmal von Hand:

```bash
curl -fsSLO https://raw.githubusercontent.com/Toonvish/toon-recipe/main/docker-compose.yml
curl -fsSL  https://raw.githubusercontent.com/Toonvish/toon-recipe/main/docker/Caddyfile \
     -o docker/Caddyfile
```

(Bei Weg **C** stattdessen aus dem Klon: `cp ~/toon-recipe/docker-compose.yml . &&
cp ~/toon-recipe/docker/Caddyfile docker/`.)

Die Konfiguration ist eine `.env` **neben** der `docker-compose.yml`. Vorlage mit allen
Kommentaren: [`docker/env.example`](../docker/env.example). Nur drei Werte sind Pflicht:

```bash
cat > .env <<'EOF'
TOON_HOSTNAME=rezepte.fritz.box
SESSION_SECRET=
TOON_IMAGE=ghcr.io/toonvish/toon-recipe:latest
MAIL_FROM=Rezepte <rezepte@localhost>
TOON_MEM_LIMIT=1500m
EOF

sed -i "s|^SESSION_SECRET=.*|SESSION_SECRET=$(openssl rand -hex 32)|" .env
chmod 600 .env
```

- `TOON_HOSTNAME` — **genau** der Name, unter dem alle Geräte die App aufrufen. Ein Zugriff
  über die IP erzeugt eine neue Zertifikatswarnung.
- `TOON_IMAGE` — je nach Weg aus [Schritt 5](#5--das-image-auf-den-pi-bringen).
- `TOON_MEM_LIMIT` — 2 GB RAM → `1200m`, 4 GB → `1500m`, Pi 5 mit 8 GB → `3000m`.

> **`SESSION_SECRET` danach nicht mehr ändern.** Er signiert auch die `?sig`-Parameter der
> `/uploads`-URLs; ein neuer Wert macht alle bereits ausgelieferten Bild-URLs ungültig (die
> Bilder selbst bleiben erhalten).

Was hier bewusst **nicht** steht: kein Datenbank-Token (die libSQL-Datei liegt im Volume),
kein Mail-API-Key (Mailpit läuft im Stack) und keine OAuth-Zugangsdaten (E-Mail + Passwort ist
der selbstgehostete Weg — Google/GitHub bleiben Dritte und sind absichtlich aus).

---

## 7 — Starten und prüfen

```bash
cd /opt/toon-recipe
docker compose pull                  # bei Weg B/C überspringen: das Image ist schon lokal
docker compose up -d
docker compose ps
```

Erwartet: drei Container `running`, `app` nach ~40 s **healthy**. Die Migrationen laufen bei
jedem Start automatisch; ein Fehler dort stoppt den Container absichtlich, statt halb
migriert Anfragen zu beantworten.

```bash
docker compose logs app | tail -20   # "applying database migrations" -> "starting: ..."
curl -fsSk --resolve "$(grep TOON_HOSTNAME .env | cut -d= -f2):443:127.0.0.1" \
     "https://$(grep TOON_HOSTNAME .env | cut -d= -f2)/api/health"
```

Antwort: `{"status":"ok","version":"…","time":"…","database":"file"}`. `-k` ist hier korrekt —
der Pi selbst kennt seine eigene lokale CA nicht, und genau darum geht es im nächsten Schritt.

Bleibt `app` `unhealthy`: `docker compose logs app`. Fehlt eine Variable, nennt die API sie
beim Start im Klartext.

---

## 8 — Wurzelzertifikat auf jedes Gerät

**Dieser Schritt ist nicht optional, wenn die App als App laufen soll.** Caddy stellt das
Zertifikat mit einer eigenen lokalen CA aus. Ein Gerät, das diese CA nicht kennt, bekommt
nicht nur eine Warnung, sondern **keinen Service-Worker** — „trotzdem fortfahren“ macht den
Origin nicht sicher. Ohne Service-Worker: keine Installation auf dem Homescreen, **keine
Einkaufsliste offline**, keine gecachten Rezeptbilder. Als normale Webseite mit Warnung
funktioniert alles.

Im Browser des jeweiligen Geräts öffnen:

```
http://rezepte.fritz.box/toon-root-ca.crt
```

Absichtlich `http://`: ein Gerät, das die CA noch nicht kennt, kann sie nicht über das von ihr
signierte HTTPS laden.

Die Installation unterscheidet sich pro Betriebssystem — **auf iOS sind es zwei Schritte**, und
der zweite wird gern vergessen. Die Schritt-für-Schritt-Liste für iOS, Android, macOS, Windows
und Linux steht in
[deployment.md → Wurzelzertifikat](./deployment.md#5--das-wurzelzertifikat-auf-jedes-gerät-bringen).

---

## 9 — Erster Account und PWA installieren

`https://rezepte.fritz.box` öffnen und registrieren. Der erste Account bekommt automatisch
eine eigene Gruppe („Meine Rezepte“).

Installieren: iOS *Teilen* → *Zum Home-Bildschirm*; Android/Chrome zeigt „App installieren“
von selbst oder über das Menü.

Weitere Personen: *Profil* → *Gruppen* → *Einladen*. Der Einladungslink wird direkt angezeigt
**und** per Mail verschickt — die Mail landet in Mailpit, erreichbar nur über einen SSH-Tunnel:

```bash
ssh -N -L 8025:127.0.0.1:8025 <benutzer>@rezepte.fritz.box
# dann http://localhost:8025
```

Mailpit hört bewusst nur auf dem Loopback-Interface des Pi: seine Oberfläche zeigt jeden
Passwort-Reset-Link, im LAN wäre das Kontoübernahme für jeden im WLAN.

---

## 10 — Optional: Auto-Deploy per GitHub Actions

Ab hier deployt jeder Push auf `main` von selbst: `release.yml` baut das Image, `deploy.yml`
kopiert die compose-Dateien auf den Pi und startet per Image-**Digest** neu. Einzurichten sind
ein Deploy-Schlüssel auf dem Pi und ein paar Repository-Secrets — beschrieben in
[deployment.md → Deploy-Zugang für GitHub Actions](./deployment.md#4--deploy-zugang-für-github-actions-einrichten).

Ohne das bleibt das Update ein Zweizeiler auf dem Pi:

```bash
cd /opt/toon-recipe && docker compose pull && docker compose up -d
```

---

## Abschluss-Checkliste

- [ ] `uname -m` → `aarch64`
- [ ] `docker info` ohne `WARNING: No memory limit support`
- [ ] `docker compose ps` → drei Container, `app` healthy
- [ ] `/api/health` antwortet `status: ok`
- [ ] `https://<hostname>` lädt **ohne** Warnung (Wurzelzertifikat installiert)
- [ ] Browser-DevTools → *Application* → *Service Workers*: einer ist aktiv
- [ ] Ein Rezept angelegt, auf eine Einkaufsliste gesetzt, **Flugmodus an**, Häkchen gesetzt,
      Flugmodus aus → das Häkchen ist noch weg. Das ist der Test, der den ganzen
      TLS-Aufwand rechtfertigt.
- [ ] **Backup eingerichtet** — [deployment.md → Backup](./deployment.md#backup). Alles Wichtige
      liegt im Volume `toon-recipe_toon-data`.

---

## Fehlersuche bei der Erstinstallation

| Symptom | Ursache / Behebung |
| --- | --- |
| `exec format error` beim Start | 32-Bit-OS. `uname -m` muss `aarch64` sein → Karte neu schreiben. |
| `docker: permission denied` | Nach `usermod -aG docker` nicht neu eingeloggt. |
| `WARNING: No memory limit support` | [Schritt 3a](#3a--memory-cgroup-einschalten) fehlt oder `cmdline.txt` hat jetzt zwei Zeilen. |
| `SESSION_SECRET fehlt` beim `up` | Die `.env` liegt nicht **neben** der `docker-compose.yml` oder `SESSION_SECRET` ist leer. |
| `manifest unknown` / `denied` beim Pull | GHCR-Paket noch privat → `docker login ghcr.io` (Weg A) oder falscher `TOON_IMAGE`-Wert. |
| Build auf dem Pi bricht mit „killed“ ab | Swap zu klein → [Schritt 3b](#3b--swap-vergrößern), oder Weg **A**/**B** nehmen. |
| Warnung **und** keine Installations-Option | Wurzelzertifikat fehlt oder ist auf iOS nicht *aktiviert* → [Schritt 8](#8--wurzelzertifikat-auf-jedes-gerät). |
| Warnung, obwohl das Zertifikat installiert ist | Zugriff über die IP oder einen anderen Namen als `TOON_HOSTNAME`. |
| Einkaufsliste funktioniert offline nicht | Gleiche Ursache: kein Service-Worker ohne vertrauenswürdiges Zertifikat. |
| Hostname nicht auflösbar | Ohne FRITZ!Box/mDNS: feste IP im Router vergeben und den Namen dort (oder per `/etc/hosts` je Gerät) hinterlegen. |
| `ocr_failed` beim ersten Foto-Import | Sprachdaten fehlen im Volume: `docker compose exec app ls data/tessdata`, sonst `docker compose exec app bun run ocr:prefetch`. |
| Import bricht bei großen PDFs ab | Speicher: `TOON_MEM_LIMIT` prüfen (2-GB-Pi → `1200m`). |

Alles Weitere — Update, Rollback, Backup, Logs, echte Mails, echtes Zertifikat — in
**[docs/deployment.md](./deployment.md)**.
