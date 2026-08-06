# Vom frischen Server zur installierten App

Die **eine** Anleitung für Betrieb und Installation: vom gerade bestellten VPS bis zum App-Icon auf
dem Handy, danach Update, Backup, Rollback und Fehlersuche. Ein Container-Stack, ein Origin, keine
fremden Dienste.

Zielbild ist ein günstiger VPS mit einer eigenen Domain — es läuft aber auf jedem 64-Bit-Linux mit
Docker, auch auf einer Kiste im LAN (siehe [Ohne eigene Domain](#ohne-eigene-domain-im-lan)).
Laufendes Beispiel: ein Ein-Kern-VPS mit 1 GB RAM und 30 GB SSD (netcup VPS pico, Hetzner CX/CAX,
Oracle Free Tier, IONOS VPS S) mit Debian 13 und einer eigenen Subdomain. Foto-/PDF-Import bleibt
aus — das ist der Standard und der Grund, warum die App auf diese Klasse passt.

| | |
| --- | --- |
| Zeitbedarf | ca. 30 Minuten, davon ~10 Minuten Warten auf DNS und Zertifikat |
| Was danach läuft | API + PWA + TLS, alles in einem Container-Stack auf dem Server |
| Fremde Dienste | eine Domain und (für echte Mails) der SMTP-Zugang eines Mailanbieters. Kein API-Key, keine Cloud-Datenbank. |

**Steht der Server schon** (Docker installiert, DNS gesetzt)? Dann direkt bei
[Teil 2 — App installieren](#teil-2--app-installieren) anfangen.

---

## Inhalt

- [Was hier läuft](#was-hier-läuft) · [Voraussetzungen](#voraussetzungen)
- [Teil 1 — Server vorbereiten](#teil-1--server-vorbereiten):
  [Werte sammeln](#0--werte-sammeln) ·
  [Server bestellen](#1--server-bestellen-und-erstanmeldung) ·
  [Benutzer + SSH](#2--benutzer-anlegen-und-schlüssel-eintragen) ·
  [Weg zurück zumauern](#3--den-weg-zurück-zumauern) ·
  [Firewall + Swap](#4--firewall-und-swap) ·
  [Docker](#5--docker) ·
  [DNS](#6--dns-eintragen-und-prüfen)
- [Teil 2 — App installieren](#teil-2--app-installieren):
  [Image](#7--image-beschaffen) ·
  [Verzeichnis und `.env`](#8--verzeichnis-env-compose-dateien) ·
  [Starten](#9--starten-und-ersten-account-anlegen) ·
  [Mailversand](#10--mailversand-einrichten) ·
  [Erstes Backup](#11--erstes-backup) ·
  [Auto-Deploy (optional)](#12--auto-deploy-per-github-actions-optional)
- [Abschluss-Checkliste](#abschluss-checkliste)
- [Betrieb](#betrieb): [Update](#update) · [Rollback](#rollback) · [Backup](#backup) ·
  [Logs](#logs) · [Mailversand prüfen](#mailversand-prüfen) ·
  [Caddy aktualisieren](#caddy-aktualisieren)
- [Varianten](#varianten): [Ohne eigene Domain (im LAN)](#ohne-eigene-domain-im-lan) ·
  [Import per Foto/PDF](#import-per-fotopdf-ist-optional) ·
  [Lokal testen, ohne Server](#lokal-testen-ohne-server)
- [Fehlersuche](#fehlersuche) · [Was hier bewusst fehlt](#was-hier-bewusst-fehlt)

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
    ┌──────────▼──────────┐   SMTP oder HTTPS   ┌──────────────────────┐
    │ app                 │ ··················► │ Mailanbieter         │
    │ API + PWA, ein Port │                     │ optional, Schritt 10 │
    └──────────┬──────────┘                     └──────────────────────┘
               │                     ohne Angaben: die App schreibt
        Volume toon-data             Reset-/Einladungslinks nur ins Log
        (Datenbank · Uploads)
```

**Zwei Container, und kein einziger API-Key ist nötig, um das zu starten.** Was einmal extern war:

| vorher | jetzt |
| --- | --- |
| Resend (`MAIL_API_KEY`) | optional. Ohne Mail-Angaben protokolliert die App die Links nur; für echte Zustellung genügt der SMTP-Zugang eines beliebigen Mailanbieters — kein API-Key nötig. Resend geht weiterhin, per SMTP oder per HTTP-Adapter. |
| Turso (`DATABASE_AUTH_TOKEN`) | war schon optional — eine libSQL-Datei im Volume |
| OCR | lief schon serverseitig; **jetzt optional** — nur mit `--build-arg WITH_OCR=1` im Image (siehe unten) |
| Google-/GitHub-Login | **bleibt extern und ist bewusst aus.** E-Mail + Passwort ist der selbstgehostete Weg. |

Es gibt keinen selbstgehosteten Ersatz für Google-/GitHub-OAuth — dafür wäre ein eigener
OIDC-Provider (Authentik, Keycloak) plus eine generische OIDC-Anbindung nötig, die die App heute
nicht hat. Ohne OAuth fehlt nichts: Registrierung, Login, Einladungen, E-Mail-Bestätigung und
Passwort-Reset funktionieren vollständig.

---

## Voraussetzungen

- **64-Bit-Linux mit Docker**, `x86_64` oder `arm64` — das Image gibt es für beide. `uname -m` muss
  `x86_64` oder `aarch64` ausgeben; für 32-Bit gibt es kein Bun, dort lässt sich das Image nicht
  starten.
- **RAM: hängt am Foto-/PDF-Import.** Ohne ihn — dem Standard, siehe
  [Import per Foto/PDF](#import-per-fotopdf-ist-optional) — bleiben Bun, die libSQL-Datei und das
  Ausliefern der PWA übrig; das läuft in **512 MB bis 1 GB**. Mit Foto-Import (ohne PDF) geht es ab
  **1 GB mit Swap**, mit PDF-Import gilt weiter **mindestens 2 GB mit Reserve**: die Texterkennung
  ist der Speicherfresser, und ein PDF ist bis zu zehn Seiten davon.
- **1–2 GB Swap.** Nicht für den Normalbetrieb, sondern damit ein Ausreißer nicht sofort den
  OOM-Killer holt — [Schritt 4](#4--firewall-und-swap).
- **SSD, ab ~10 GB.** Die App selbst ist klein, der Rest ist Platz für Rezeptbilder. SQLite auf
  langsamem Speicher ist der häufigste Grund für „die App ist langsam“.
- **Eine (Sub-)Domain mit A-Record auf die Server-IP** (plus AAAA, wenn es IPv6 gibt) und
  **erreichbare Ports 80 + 443** — beides braucht Caddy für das Let's-Encrypt-Zertifikat. Ohne
  eigene Domain geht es auch, dann aber nur im LAN und mit einer eigenen CA auf jedem Gerät:
  [Ohne eigene Domain](#ohne-eigene-domain-im-lan).
- **Ein SSH-Schlüsselpaar.** Falls keins da ist: `ssh-keygen -t ed25519`.
- Optional, für echte Mails: **SMTP-Zugangsdaten** (Host, Port, Benutzer, Passwort) von einem
  Mailanbieter. Kann später nachgerüstet werden.

---

# Teil 1 — Server vorbereiten

## 0 — Werte sammeln

Vor dem ersten Befehl diese vier Dinge bereitlegen — sie kommen in jedem Schritt vor:

| Platzhalter | Woher |
| --- | --- |
| `<server-ip>` | Server Control Panel des Anbieters → *Netzwerk / IP-Adressen*, oder die Liefermail |
| `<hostname>` | die geplante Subdomain, z. B. `rezepte.example.org` |
| `<user>` | der anzulegende Benutzer, im Folgenden `toon` |
| Public Key | auf dem Laptop: `cat ~/.ssh/id_ed25519.pub` |

**Alle folgenden Befehle laufen auf dem Server**, außer wo ausdrücklich „vom Laptop“ steht.

---

## 1 — Server bestellen und Erstanmeldung

Beim Bestellen:

1. **Betriebssystem:** Debian 13 oder Ubuntu 24.04 LTS, jeweils die minimale Variante. Kein Panel,
   kein vorinstalliertes Webhosting — es läuft nur Docker darauf.
2. **SSH-Schlüssel hinterlegen**, wenn der Anbieter das anbietet. Sonst kommt das Passwort per Mail
   und [Schritt 2](#2--benutzer-anlegen-und-schlüssel-eintragen) tauscht es gegen den Schlüssel.
3. **IPv4 + IPv6** nehmen, wenn beides angeboten wird. Reines IPv6 ist billiger und für Geräte in
   IPv4-Netzen nicht erreichbar.

```bash
ssh root@<server-ip>
apt update && apt full-upgrade -y
reboot
```

Kommt hier `Permission denied (publickey)` und das Passwort ist bekannt, erzwingt
`ssh -o PreferredAuthentications=password root@<server-ip>` den Passwort-Weg. Geht gar nichts, hilft
die **VNC-Konsole** im Panel des Anbieters: die ist kein SSH, also greift dort keine
`sshd_config`-Einstellung.

---

## 2 — Benutzer anlegen und Schlüssel eintragen

Nicht als `root` arbeiten:

```bash
adduser toon
usermod -aG sudo toon
install -d -m 700 -o toon -g toon /home/toon/.ssh
nano /home/toon/.ssh/authorized_keys        # Public Key vom Laptop einfügen
chown toon:toon /home/toon/.ssh/authorized_keys
chmod 600 /home/toon/.ssh/authorized_keys
```

> ⚠ **Gruppenmitgliedschaft gilt erst ab der nächsten Anmeldung.** Eine schon offene Sitzung
> — auch eine, die vor dem `usermod` aufgebaut wurde — kennt die Gruppe `sudo` nicht und antwortet
> `toon is not in the sudoers file`. Nach dem `usermod` also **komplett ab- und neu anmelden**, kein
> neues Shell-Fenster in derselben Sitzung. Kontrolle: `id` muss `sudo` auflisten.
>
> Dieselbe Falle kommt in [Schritt 5](#5--docker) mit der Gruppe `docker` noch einmal.

In einer **zweiten Sitzung** prüfen, dass die Anmeldung mit Schlüssel klappt — **erst danach**
Schritt 3:

```bash
ssh toon@<server-ip>
id                                          # muss "sudo" enthalten
sudo -v                                     # muss ohne Fehler durchlaufen
```

---

## 3 — Den Weg zurück zumauern

Erst wenn Schritt 2 nachweislich funktioniert, sonst sperrst du dich aus. In
`/etc/ssh/sshd_config`:

```
PermitRootLogin no
PasswordAuthentication no
```

```bash
sudo systemctl restart ssh
```

Sicherheitsupdates automatisch einspielen (der Kernel braucht danach gelegentlich einen Reboot, die
Container laufen ohne):

```bash
sudo apt install -y unattended-upgrades
sudo dpkg-reconfigure -plow unattended-upgrades
```

---

## 4 — Firewall und Swap

Offen müssen nur 22 (SSH), 80 und 443 (Caddy) sein. Sonst nichts — die App selbst veröffentlicht
keinen Port, sie ist nur im Docker-Netz erreichbar.

```bash
sudo apt install -y ufw
sudo ufw allow 22/tcp && sudo ufw allow 80/tcp && sudo ufw allow 443/tcp
sudo ufw enable
sudo ufw status
```

> **`ufw` schützt keine veröffentlichten Container-Ports.** Docker schreibt seine Regeln in die
> `DOCKER`-Chain, die vor den ufw-Regeln greift: was in der compose-Datei unter `ports:` steht, ist
> erreichbar, auch wenn ufw es verbietet. Deshalb stehen dort nur 80/443 ohne Adresse. Wer weitere
> Ports veröffentlicht — ein Debug-UI, ein Datenbank-Port —, muss die Adresse selbst auf
> `127.0.0.1:` begrenzen und per SSH-Tunnel drangehen; ufw erledigt das nicht.
>
> **Hat der Anbieter eine eigene Firewall vor der VM** (netcup, Hetzner Cloud, AWS), ist die der
> bessere Ort für dieselbe Regel — sie greift, bevor das Paket die Kiste erreicht. Dann müssen 80
> und 443 **auch dort** offen sein: eine geschlossene Anbieter-Firewall ist die häufigste Ursache
> für „kein Zertifikat“ in [Schritt 9](#9--starten-und-ersten-account-anlegen), und im App-Log ist
> davon nichts zu sehen.

Swap, damit ein Ausreißer nicht sofort den OOM-Killer holt. `swapon --show` zuerst — manche Images
bringen schon welchen oder `zram` mit, dann diesen Teil überspringen:

```bash
sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile
sudo mkswap /swapfile && sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
# Swap erst spät benutzen — er ist Reserve, nicht Arbeitsspeicher
echo 'vm.swappiness=10' | sudo tee /etc/sysctl.d/99-swappiness.conf
sudo sysctl -p /etc/sysctl.d/99-swappiness.conf
free -h
```

---

## 5 — Docker

```bash
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker "$USER"
exit                                        # neu anmelden, damit die Gruppe greift
```

Nach der neuen Anmeldung kontrollieren:

```bash
docker run --rm hello-world
docker compose version
docker info | grep -i -e warning -e "memory limit"
```

Warnungen über fehlende Speicherlimits darf es hier nicht geben — der Stack setzt `mem_limit` auf
den App-Container, und ohne Cgroup-Unterstützung wäre das wirkungslos. Bei einem normalen
VPS-Kernel ist sie vorhanden.

---

## 6 — DNS eintragen und prüfen

Alle Geräte müssen die App unter **demselben Namen** erreichen: das Zertifikat wird pro Name
ausgestellt, ein Zugriff über die IP erzeugt eine neue Warnung, und `WEB_ORIGIN` — also die Links in
den ausgehenden Mails — wird daraus gebildet.

Beim DNS-Anbieter der Domain also anlegen:

```
rezepte   A      <server-ip>
rezepte   AAAA   <IPv6 des Servers>         # nur wenn vorhanden
```

**Vor** dem Start des Stacks kontrollieren — ein falscher Eintrag kostet sonst ein
Let's-Encrypt-Rate-Limit:

```bash
dig +short <hostname>                       # muss die Server-IP liefern
```

Reverse DNS (PTR) ist nicht nötig: Mails gehen über den Relay eines Anbieters, nicht vom Server
selbst.

---

# Teil 2 — App installieren

## 7 — Image beschaffen

**Jeder Push auf `main` veröffentlicht ein neues Image auf GHCR**, gebaut für `linux/amd64` **und**
`linux/arm64`, unter `ghcr.io/toonvish/toon-recipe`. Manuell anstoßen geht über Actions → **Release**
→ *Run workflow*.

Ist das Paket **public**, braucht der Server keinerlei Zugangsdaten und dieser Schritt entfällt.
Umstellen einmalig unter GitHub → Profil/Organisation → *Packages* → `toon-recipe` →
*Package settings* → *Change visibility*. (Alternative: privat lassen und sich auf dem Server
einmalig mit einem Read-Only-PAT anmelden: `docker login ghcr.io -u <user>`.)

Das veröffentlichte Image ist die **schlanke Variante ohne OCR**. Wer Foto-/PDF-Import will, baut
selbst — siehe [Import per Foto/PDF](#import-per-fotopdf-ist-optional).

---

## 8 — Verzeichnis, `.env`, compose-Dateien

```bash
sudo mkdir -p /opt/toon-recipe/docker
sudo chown -R "$USER" /opt/toon-recipe
cd /opt/toon-recipe

cat > .env <<'EOF'
TOON_HOSTNAME=rezepte.example.org
SESSION_SECRET=
TOON_IMAGE=ghcr.io/toonvish/toon-recipe:latest
MAIL_FROM=Rezepte <rezepte@example.org>
EOF

sed -i "s|^SESSION_SECRET=.*|SESSION_SECRET=$(openssl rand -hex 32)|" .env
chmod 600 .env

curl -fsSLO https://raw.githubusercontent.com/Toonvish/toon-recipe/main/docker-compose.yml
curl -fsSL  https://raw.githubusercontent.com/Toonvish/toon-recipe/main/docker/Caddyfile \
     -o docker/Caddyfile
```

`TOON_HOSTNAME` und `MAIL_FROM` noch auf die echten Werte setzen. Die kommentierte Vorlage mit allen
Variablen steht im Repo unter [`docker/env.example`](../docker/env.example).

Drei Dinge, die hier schiefgehen:

- **`SESSION_SECRET` nie wieder ändern.** Er signiert auch die `?sig`-Parameter der
  `/uploads`-URLs — ein neuer Wert macht alle bereits ausgelieferten Bild-URLs ungültig (die Bilder
  selbst bleiben erhalten).
- **Die `.env` muss *neben* der `docker-compose.yml` liegen**, sonst bricht der Start mit
  `SESSION_SECRET fehlt` ab.
- **`PUBLIC_API_URL` nicht setzen.** Der leere Wert ist Absicht: das Bundle benutzt relative URLs
  und die API liefert es vom selben Origin aus.

---

## 9 — Starten und ersten Account anlegen

```bash
cd /opt/toon-recipe
docker compose up -d
docker compose ps                           # app muss "healthy" werden
docker compose logs -f caddy                # das Zertifikat kommt in den ersten Sekunden
```

Dann `https://<hostname>` öffnen und registrieren. Der erste Account bekommt automatisch eine eigene
Gruppe („Meine Rezepte“); weitere Personen über *Profil* → *Gruppen* → *Einladen* — der
Einladungslink wird angezeigt **und** per Mail verschickt.

Installieren: Android ⋮ → *App installieren*, iOS *Teilen* → *Zum Home-Bildschirm*. Die
Einkaufsliste funktioniert danach offline — das hängt am Service-Worker und der am gültigen
Zertifikat, das hier von selbst da ist.

---

## 10 — Mailversand einrichten

Optional, aber **vor dem ersten Passwort-Reset**. Ohne weitere Angaben verschickt die App **gar
keine** Mail: sie schreibt jeden Reset- und Einladungslink ins Container-Log und meldet das der UI
auch so („nicht eingerichtet“, nicht „verschickt“). Gut für den ersten Blick, unbrauchbar für einen
Reset an eine echte Adresse. Für echte Zustellung gehört der SMTP-Zugang eines Mailanbieters in die
`.env`:

```bash
cat >> .env <<'EOF'
MAIL_TRANSPORT=smtp
MAIL_HOST=mx.example.net
MAIL_PORT=465
MAIL_SECURITY=tls
MAIL_USER=rezepte@example.org
MAIL_PASSWORD=…
EOF
docker compose up -d
```

Fünf Dinge dazu:

- **`MAIL_TRANSPORT=smtp` gehört dazu**, sonst bleibt es beim Log. Die Zeile ist leicht zu
  vergessen, weil die anderen Werte danach aussehen, als würden sie den Versand schon einschalten —
  ein Relay ohne diese Zeile wird stillschweigend nie benutzt. Zu sehen ist es an der ersten Mail:
  `docker compose logs app | grep '\[mail\]'` zeigt dann
  `NOT SENT — MAIL_TRANSPORT is not configured`.

- **`MAIL_SECURITY`**: `tls` = implizites TLS auf Port 465 (empfohlen), `starttls` = Upgrade auf
  Port 587. `none` ist nur für einen Relay im eigenen Netz gedacht, und **`none` zusammen mit
  Zugangsdaten verweigert die API beim Start** — die gingen im Klartext über das Netz.
- **`MAIL_FROM` muss eine Adresse sein, die der Relay senden darf.** Sonst weist er die Mail ab.
- **SPF, DKIM und DMARC beim Anbieter einrichten** und die Records in die DNS-Zone der Domain
  legen. Ohne sie landen Reset- und Einladungsmails im Spam, wo sie nichts nützen.
- **Einen eigenen Mailserver auf demselben Server zu betreiben, ist keine gute Idee.** Frische
  VPS-IP-Bereiche stehen praktisch überall auf Blocklisten, und Port 25 ausgehend ist bei vielen
  Anbietern gesperrt. Der SMTP-Zugang eines normalen Mailanbieters ist der pragmatische Weg — und
  es ist immer noch kein proprietärer API-Key.

Prüfen, ob es wirklich rausgeht: eine Passwort-Reset-Mail an eine eigene, externe Adresse anfordern
und in `docker compose logs app` nach `[mail]` sehen — ein fehlgeschlagener Versand steht dort mit
Grund, bricht die Aktion aber bewusst nicht ab.

### Variante Resend

Der bequemste Anbieter für einen frischen Server, weil kein Postfach dazugehört: eine verifizierte
Domain plus ein API-Key sind das ganze Setup. Beide Wege unten brauchen dieselbe Vorbereitung im
Resend-Dashboard:

1. *Domains → Add Domain* mit der eigenen Domain. Resend zeigt einen `MX`- und zwei `TXT`-Records
   (Return-Path und DKIM) — die in **dieselbe DNS-Zone** wie den A-Record aus
   [Schritt 6](#6--dns-eintragen-und-prüfen) legen, dann *Verify*.
2. DMARC kommt **nicht** von Resend, den Record selbst dazu:
   `_dmarc TXT "v=DMARC1; p=none; rua=mailto:du@example.org"`.
3. *API Keys → Create API Key*, Recht *Sending access*. Der `re_…`-Wert ist nur einmal sichtbar.

Dann entweder **(a) über SMTP** — derselbe Adapter wie oben, `MAIL_USER` ist wörtlich `resend` und
der API-Key das Passwort:

```bash
cat >> .env <<'EOF'
MAIL_TRANSPORT=smtp
MAIL_HOST=smtp.resend.com
MAIL_PORT=465
MAIL_SECURITY=tls
MAIL_USER=resend
MAIL_PASSWORD=re_…
EOF
docker compose up -d
```

… oder **(b) über den HTTP-Adapter** (`services/mail/resend.ts`), dann ohne SMTP-Werte:

```bash
cat >> .env <<'EOF'
MAIL_TRANSPORT=resend
MAIL_API_KEY=re_…
EOF
docker compose up -d
```

`MAIL_FROM` muss in beiden Fällen auf der verifizierten Domain liegen. **(a) ist der empfohlene
Weg**: er benutzt genau die Variablen, die auch für jeden anderen Anbieter gelten, ein
Anbieterwechsel ist damit eine Zeile. (b) spart den SMTP-Handshake, verlangt aber `MAIL_API_KEY` —
**fehlt der Wert, startet der Container nicht** (`env.ts` verweigert den Start lieber, als Mails
still zu verschlucken). Die `docker-compose.yml` gibt `MAIL_API_KEY` durch; eine Kopie auf dem
Server, die älter ist als diese Zeile, tut das nicht und muss vorher neu geholt werden (die
`curl`-Zeilen aus [Schritt 8](#8--verzeichnis-env-compose-dateien)).

### Ohne Mail

Das ist der Standard, und **alles funktioniert**, nur unbequemer: Einladungslinks zeigt die UI
direkt an, jeder verschickte Text steht außerdem in `docker compose logs app` (ein Kasten mit
`[mail] NOT SENT`), und ein ausgesperrter Account wird so entsperrt:

```bash
docker compose exec app bun apps/api/scripts/reset-password.ts <email>
```

---

## 11 — Erstes Backup

Alles Wichtige liegt im Volume `toon-data` (Datenbank + Uploads):

```bash
cd /opt/toon-recipe
docker compose stop app                     # SQLite konsistent sichern
docker run --rm -v toon-recipe_toon-data:/data -v "$PWD:/backup" alpine \
  tar czf "/backup/toon-$(date +%F).tar.gz" -C /data .
docker compose start app
```

Die Datei anschließend **vom Server wegkopieren**. Ein Hoster-Snapshot ersetzt das nicht: eine
laufende SQLite-Datei darin ist nicht garantiert konsistent. Zurückspielen und Details:
[Backup](#backup).

---

## 12 — Auto-Deploy per GitHub Actions (optional)

Danach rollt jeder Push auf `main` sich selbst aus. Wer lieber von Hand deployt, überspringt diesen
Schritt komplett — solange die Variable `DEPLOY_ENABLED` nicht auf `true` steht, überspringt der
Release-Workflow den Deploy-Job und es bleibt beim
`docker compose pull && docker compose up -d` auf dem Server.

**Was hier NICHT passiert: ein Schlüssel mit Shell-Zugang in fremder Obhut.** Der Schlüssel wird an
ein festes Kommando gebunden (`command="…"` in der `authorized_keys`), das nur `deploy`,
`sync-config` und `status` kennt. Die Image-Herkunft steht in dem Skript, nicht in dem, was GitHub
schickt — sonst könnte ein gestohlener Schlüssel den Server auf ein beliebiges Image der Welt zeigen
lassen. `restrict` nimmt zusätzlich Port- und Agent-Forwarding, X11 und das PTY weg. Ein gestohlener
Schlüssel kann damit eine Version ausrollen — mehr nicht.

**a) Deploy-Skript installieren** (auf dem Server):

```bash
sudo curl -fsSL https://raw.githubusercontent.com/Toonvish/toon-recipe/main/docker/toon-deploy.sh \
     -o /usr/local/bin/toon-deploy
sudo chmod 755 /usr/local/bin/toon-deploy
toon-deploy status            # muss den laufenden Stack zeigen
```

Liegt die Installation nicht in `/opt/toon-recipe` oder das Image woanders, stehen `TOON_APP_DIR`
und `TOON_IMAGE_REPO` oben im Skript.

**b) Schlüsselpaar erzeugen** — eigenes Paar, nur für diesen Job, ohne Passphrase (ein Runner kann
keine eingeben):

```bash
ssh-keygen -t ed25519 -f ~/.ssh/gh-deploy -N '' -C github-actions-deploy
```

**c) Öffentlichen Teil eintragen**, mit dem festen Kommando davor:

```bash
printf 'restrict,command="/usr/local/bin/toon-deploy" %s\n' "$(cat ~/.ssh/gh-deploy.pub)" \
  >> ~/.ssh/authorized_keys
```

Gegenprüfen, dass der Schlüssel wirklich keine Shell öffnet — die Antwort muss die Fehlermeldung des
Skripts sein und nicht ein Prompt:

```bash
ssh -i ~/.ssh/gh-deploy -o IdentitiesOnly=yes localhost 'id'
# → FEHLER: Unbekannter Befehl: id (erlaubt: deploy, sync-config, status)
```

**d) Host-Key ablesen** (auf dem Server, nicht vom Laptop aus — sonst pinnst du, was dir unterwegs
geantwortet hat):

```bash
ssh-keyscan -p 22 <hostname-oder-ip>
```

**e) In GitHub eintragen**, Repo → *Settings* → *Secrets and variables* → *Actions*:

| Secret | Wert |
| --- | --- |
| `DEPLOY_SSH_HOST` | Hostname oder IP des Servers |
| `DEPLOY_SSH_USER` | der SSH-Benutzer (muss in der `docker`-Gruppe sein) |
| `DEPLOY_SSH_KEY` | Inhalt von `~/.ssh/gh-deploy` (der **private** Teil) |
| `DEPLOY_SSH_KNOWN_HOSTS` | die komplette Ausgabe aus (d) |
| `DEPLOY_SSH_PORT` | optional, Standard 22 |

Dazu unter *Variables* (kein Secret):

| Variable | Wert |
| --- | --- |
| `DEPLOY_ENABLED` | `true` — **der Schalter**. Fehlt er, wird der Deploy-Job übersprungen. Erst setzen, wenn die fünf Secrets oben stehen: sonst läuft der Job los und scheitert am leeren Host-Key. |
| `TOON_HOSTNAME` | nur für den anklickbaren Link am Deployment; der Server liest seinen Hostnamen aus der eigenen `.env` |

Den privaten Schlüssel danach vom Server löschen (`rm ~/.ssh/gh-deploy`); er liegt jetzt in GitHub
und wird auf dem Server nicht gebraucht.

**f) Environment anlegen**: *Settings* → *Environments* → **production**. Es ist der Ort, an dem die
fünf Secrets hängen sollten, damit kein anderer Workflow sie lesen kann. Wer nicht will, dass jeder
Push sofort live geht, trägt hier *Required reviewers* ein — dann wartet jeder Deploy auf eine
Freigabe.

**Testen**: Actions → **Release** → *Run workflow* → Haken bei *Nach dem Build auf den Server
deployen*. Der Job zeigt am Ende `app ist healthy` und `docker compose ps`.

> **`docker-compose.yml` und `docker/Caddyfile` kommen dabei nicht mit.** Der Schlüssel kann keine
> Dateien kopieren, und das ist Absicht: eine Compose- oder Caddy-Änderung ist eine
> Konfigurationsänderung und soll niemandem beiläufig passieren. Wenn sich die beiden im Repo
> geändert haben, einmal `toon-deploy sync-config` auf dem Server (oder die `curl`-Befehle aus
> [Update](#update)) — das nächste Deploy übernimmt sie dann.

**Wieder abschalten**: `DEPLOY_ENABLED` auf `false` setzen hält den Job an. Den *Zugang* nimmt aber
erst das Löschen der Zeile aus `~/.ssh/authorized_keys` weg — das ist der Schritt, der zählt, egal
was in GitHub noch gespeichert ist. Secrets und Environment danach in Ruhe aufräumen.

---

## Abschluss-Checkliste

- [ ] `ssh toon@<server-ip>` funktioniert mit Schlüssel, `id` zeigt `sudo`; `root`- und
      Passwort-Login sind aus.
- [ ] `sudo ufw status` zeigt 22, 80, 443 — und sonst nichts; die Anbieter-Firewall passt dazu.
- [ ] `free -h` zeigt Swap.
- [ ] `dig +short <hostname>` liefert die Server-IP.
- [ ] `docker compose ps` zeigt `app` als `healthy` und `caddy` als `running` — und sonst nichts.
- [ ] `https://<hostname>` öffnet die App **ohne** Zertifikatswarnung.
- [ ] Ein Account ist registriert, und die App lässt sich auf dem Handy installieren.
- [ ] Eine Passwort-Reset-Mail an eine externe Adresse kommt an (oder der Versand ist bewusst nicht
      eingerichtet — dann steht der Link im App-Log).
- [ ] Ein erstes Backup des `toon-data`-Volumes liegt außerhalb des Servers.

---

# Betrieb

## Update

**Mit eingerichtetem Auto-Deploy** ([Schritt 12](#12--auto-deploy-per-github-actions-optional)) ist
nichts zu tun: der Push auf `main` baut, testet und rollt aus, wartet auf `healthy` und schreibt den
ausgerollten Digest in die `.env` des Servers. Schlägt der Health-Check fehl, bleibt in der `.env`
die letzte gesunde Version stehen — `docker compose up -d` auf dem Server holt sie zurück, ohne dass
etwas editiert werden muss.

**Ohne Auto-Deploy** veröffentlicht der Push nur das Image. Auf dem Server:

```bash
cd /opt/toon-recipe && docker compose pull && docker compose up -d --remove-orphans
docker compose ps                     # app soll "healthy" sein
```

Wenn sich `docker-compose.yml` oder `docker/Caddyfile` im Repo geändert haben, neu holen — der
Server bekommt sie in **keinem** der beiden Fälle von selbst, auch nicht per Auto-Deploy
(`toon-deploy sync-config` macht genau das Folgende):

```bash
cd /opt/toon-recipe
curl -fsSLO https://raw.githubusercontent.com/Toonvish/toon-recipe/main/docker-compose.yml
curl -fsSL  https://raw.githubusercontent.com/Toonvish/toon-recipe/main/docker/Caddyfile \
     -o docker/Caddyfile
```

`TOON_IMAGE` in der `.env` entscheidet, *was* gezogen wird. Steht dort `:latest`, holt `pull` den
neuesten `main`-Build; steht dort ein `@sha256:…`-Digest, bleibt die Version festgenagelt, bis du
sie änderst. Digests stehen in der Summary jedes Release-Laufs.

### Wie die neue Version auf die Geräte kommt

**Nichts zu tun — die installierte App holt sie selbst.** Sie fragt beim Server nach einer neuen
Version, sobald sie in den Vordergrund kommt (dazu noch alle 30 Minuten und wenn die Verbindung
zurückkommt), lädt sie im Hintergrund und startet sich dann neu. Eine installierte iOS-Web-App
navigiert nur beim Start, deshalb ist der Vordergrund-Check der entscheidende: einmal aus dem
App-Switcher zurückholen genügt.

Ausnahme: **wenn gerade ungespeicherte Eingaben auf dem Bildschirm stehen** (ein halb getipptes
Rezept, ein Import-Entwurf mit offenen Änderungen) lädt sie *nicht* von selbst neu — sonst wären die
Eingaben weg. Stattdessen erscheint oben ein Hinweis „Neue Version verfügbar“ mit einem Knopf.
Speichern reicht auch: dann zieht sie das Update selbst nach.

Wenn eine App tagelang auf einer alten Version hängt, liegt es fast immer daran, dass etwas `sw.js`
oder `index.html` zwischenspeichert. Prüfen mit:

```bash
curl -sI https://<hostname>/sw.js | grep -i cache-control   # muss "no-cache" sein
```

## Rollback

Den Digest der guten Version holen: Actions → **Release** → vergangenen Lauf öffnen → Digest aus der
Summary kopieren. Dann auf dem Server:

```bash
cd /opt/toon-recipe
sed -i "s|^TOON_IMAGE=.*|TOON_IMAGE=ghcr.io/toonvish/toon-recipe@sha256:<digest>|" .env
docker compose pull && docker compose up -d
```

Mit Auto-Deploy geht dasselbe von GitHub aus: Actions → **Deploy** → *Run workflow*, Digest ins
Feld. Oder auf dem Server direkt `toon-deploy deploy sha256:<digest>` — beide Wege warten auf
`healthy` und tragen den Digest in die `.env` ein.

Danach steht in der `.env` ein fester Digest. Er überlebt den nächsten Auto-Deploy nicht: der
schreibt die Zeile auf die neu ausgerollte Version um. Wer eine Version länger festnageln will,
schaltet den Deploy-Job so lange ab (Zeile aus der `authorized_keys` nehmen oder im
`production`-Environment einen Reviewer verlangen). Für normale Updates von Hand wieder auf
`TOON_IMAGE=ghcr.io/toonvish/toon-recipe:latest` zurückstellen.

> Migrationen laufen bei jedem Start und sind **nicht** rückwärts anwendbar. Ein Rollback auf ein
> Image vor einer Schema-Änderung braucht das Backup von vorher.

## Backup

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

Der genaue Volume-Name kommt aus `docker volume ls` (Präfix = `name:` in der compose-Datei, also
`toon-recipe_`). Ein Snapshot beim Hoster ersetzt das nicht: eine laufende SQLite-Datei im Snapshot
ist nicht garantiert konsistent, die zwei Zeilen oben sind es. Die Sicherung anschließend **vom
Server wegkopieren**.

## Logs

```bash
docker compose logs -f app        # API-Zugriffe, Import-/Mail-Fehler
docker compose logs -f caddy      # TLS, Zertifikate
docker compose ps                 # Health-Status
```

## Mailversand prüfen

Es gibt kein Mail-UI im Stack — der Beweis steht im App-Log:

```bash
docker compose logs app | grep '\[mail\]'
```

Drei Ausgaben, drei Bedeutungen:

| Zeile | heißt |
| --- | --- |
| *nichts* | Der Versand hat funktioniert — oder es wurde noch keine Mail ausgelöst. Ein erfolgreicher Versand schreibt absichtlich nichts ins Log. |
| `[mail] NOT SENT — MAIL_TRANSPORT is not configured` + der ganze Mailtext | Kein Versand eingerichtet. Der Link im Kasten ist gültig und kann von Hand weitergegeben werden ([Schritt 10](#10--mailversand-einrichten)). |
| `[mail] Sending to … failed (smtp)` / `(resend)` | Ein konfigurierter Relay hat abgelehnt. Das ist ein kaputtes Deployment: die Aktion selbst ist absichtlich trotzdem durchgelaufen, die Mail aber weg. |

Dieselben drei Zustände zeigt die UI: das Einladungs-Panel und die E-Mail-Bestätigung färben
„verschickt“, „nicht eingerichtet“ und „fehlgeschlagen“ unterschiedlich — ein `docker compose logs`
ist also nur für den letzten Fall nötig.

**Wer Mails im Browser lesen will**, kann für einen Test einen Mailpit-Container dazustellen
(`axllent/mailpit`, `MAIL_TRANSPORT=smtp` / `MAIL_HOST=mailpit` / `MAIL_PORT=1025` /
`MAIL_SECURITY=none`). Dann aber **nur** mit `ports: ["127.0.0.1:8025:8025"]` und Zugriff per
`ssh -N -L 8025:127.0.0.1:8025 toon@<server-ip>`: das UI zeigt jeden Passwort-Reset- und
Einladungslink, wer es öffnen kann, übernimmt jedes Konto. Auf einer Produktionsinstallation mit
echtem Relay hat es nichts zu suchen.

## Caddy aktualisieren

Caddy ist in der `docker-compose.yml` **auf eine Version festgenagelt** und wandert deshalb bei
einem `docker compose pull` nicht mit. Das ist Absicht: ein gleitendes `caddy:2-alpine` kann die
TLS-Terminierung unter einer laufenden Installation austauschen, und wenn dabei etwas schiefgeht,
ist die Seite weg, über die du den Server erreichst. Sicherheitsupdates muss man dafür selbst
einspielen — ein bis zwei Mal im Jahr nachsehen genügt:

```bash
curl -s https://api.github.com/repos/caddyserver/caddy/releases/latest  | grep '"tag_name"'
```

Dann die `image:`-Zeile in `docker-compose.yml` im Repo anpassen, pushen und die Datei auf dem
Server neu holen (siehe [Update](#update)). Vorher lokal gegenprüfen:

```bash
docker run --rm -v "$PWD/docker/Caddyfile:/etc/caddy/Caddyfile:ro" \
  -e TOON_HOSTNAME=rezepte.test caddy:<neue-version>-alpine \
  caddy validate --config /etc/caddy/Caddyfile
```

Die Bun-Version steht an einer Stelle: `ARG BUN_VERSION` im `Dockerfile`, plus `.bun-version` für
die CI. Beide müssen zusammenpassen.

---

# Varianten

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

(absichtlich `http://`: ein Gerät, das die CA noch nicht kennt, kann sie nicht über das von ihr
signierte HTTPS laden, ohne in genau die Warnung zu laufen.)

Dann installieren:

- **iPhone / iPad:** Datei laden → *Einstellungen* → *Profil geladen* → **Installieren**.
  Danach **zwingend** *Einstellungen* → *Allgemein* → *Info* → *Zertifikatsvertrauens­einstellungen*
  → das Zertifikat **aktivieren**. Ohne diesen zweiten Schritt bleibt es wirkungslos.
- **Android:** *Einstellungen* → *Sicherheit* → *Verschlüsselung & Zugangsdaten* →
  *Zertifikat installieren* → *CA-Zertifikat* → Warnung bestätigen. Chrome auf Android akzeptiert
  nur so installierte Nutzer-CAs.
- **macOS:** Doppelklick → Schlüsselbund *System* → im Schlüsselbundverwalter das Zertifikat
  öffnen → *Vertrauen* → *Immer vertrauen*.
- **Windows:** Doppelklick → *Zertifikat installieren* → *Lokaler Computer* →
  *Vertrauenswürdige Stammzertifizierungsstellen*.
- **Linux:** `sudo cp toon-root-ca.crt /usr/local/share/ca-certificates/ && sudo update-ca-certificates`

> Das Volume `caddy-data` enthält dann den **privaten Schlüssel dieser CA**. Geht er verloren,
> erzeugt Caddy eine neue CA und das Wurzelzertifikat muss auf allen Geräten erneut installiert
> werden. Nicht in ein Backup legen, das du weitergibst.

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

## Import per Foto/PDF ist optional

Standardmäßig **aus**, und das veröffentlichte Image enthält die Binaries nicht. Import per
Webadresse und per eingefügtem Text ist reines Abrufen und Parsen; OCR ist der einzige Teil dieser
App mit echtem Appetit: `tesseract` ist mit den Sprachpaketen ~105 MB, `poppler-utils` weitere
~28 MB, und ein laufender Job hält `sharp`, ein dekodiertes ~2000-px-Bild und bei einem PDF das
komplette geparste Dokument von `unpdf` im Speicher. Genau deshalb ist es abschaltbar — so passt die
App auf einen 1-GB-VPS.

**Foto und PDF sind getrennt schaltbar**, und das ist der Unterschied zwischen "geht auf 1 GB" und
"geht nicht": ein Foto ist EIN tesseract-Lauf, ein gescanntes PDF sind bis zu zehn. Auf einem Kern
läuft der Scan in jedem Fall in die 60-s-Grenze des Servers — auch mit 4 GB RAM. Ein Kern schafft
Fotos und schafft keine Scans, deshalb kann man genau das konfigurieren.

**Vier Schalter, paarweise:**

| | wo | Wirkung |
| --- | --- | --- |
| `--build-arg WITH_OCR=1` | `docker build` | installiert `tesseract-ocr` + `tesseract-ocr-deu` (~105 MB) ins Image |
| `IMPORT_OCR_ENABLED=1` | Laufzeit (`.env`) | schaltet den **Foto**-Import frei. **Standard ist der Wert des Build-Args**, das Image ist also von sich aus konsistent. |
| `--build-arg WITH_PDF=1` | `docker build` | installiert `poppler-utils` (~28 MB). **Standard ist der Wert von `WITH_OCR`**, der alte Aufruf baut also weiter dasselbe Image. |
| `IMPORT_PDF_ENABLED=1` | Laufzeit (`.env`) | schaltet den **PDF**-Import frei. **Leer heißt "wie `IMPORT_OCR_ENABLED`"**, ein bestehendes `.env` ändert sein Verhalten also nicht. |

```bash
# schlank (Standard, und was in GHCR liegt): kein tesseract, kein poppler
docker build -t toon-recipe:local .

# NUR Foto-Import, deutsch — die Variante für einen Ein-Kern-VPS mit 1 GB
docker build --build-arg WITH_OCR=1 --build-arg WITH_PDF=0 -t toon-recipe:local .

# Foto UND PDF
docker build --build-arg WITH_OCR=1 -t toon-recipe:local .
```

Wer OCR auf dem Server will, braucht in jedem Fall ein eigenes Image (auf dem Laptop bauen und in
eine Registry pushen oder per `docker save | ssh … docker load` übertragen — auf einem Ein-Kern-VPS
zu bauen ist Geduldsarbeit). Dazu **ab 2 GB RAM für PDF**, oder **1 GB mit Swap für Fotos allein**.

### Deutscher Foto-Import auf 1 GB und einem Kern

Die Kombination, die auf einem netcup VPS pico (1 Kern, 1 GB) trägt — `.env` des Stacks:

```dotenv
IMPORT_OCR_ENABLED=1        # Fotos an
IMPORT_PDF_ENABLED=0        # PDFs bewusst aus: passen nicht in 60 s auf einen Kern
TESSERACT_LANGS=deu         # ein Sprachmodell statt zwei
IMPORT_OCR_CONCURRENCY=1    # ein tesseract-Prozess, das ist die Speicherobergrenze
```

`TOON_MEM_LIMIT` bleibt auf dem Standard `768m` — Foto-OCR braucht kein höheres Limit, siehe die
Messung unten. Dazu die **2 GB Swap aus [Schritt 4](#4--firewall-und-swap)** — nicht als
Arbeitsspeicher, sondern damit ein Ausreißer wartet statt erschossen zu werden.

**Gemessen** im Container mit `--memory=1g --cpus=1`, echtes 12-MP-Foto durch die reale Pipeline
(sharp → natives tesseract → Segmenter):

| | |
| --- | --- |
| Dauer eines Fotos | **2,3 s** auf einem schnellen Desktop-Kern |
| Speicher-Spitze, ganzer Job | **140 MB** (Bun + sharp + tesseract-Kind zusammen) |
| davon der tesseract-Prozess | ~44 MB (`deu`, 2000 px), ~59 MB mit `deu+eng` |
| Image | 527 MB statt 421 MB schlank (tesseract + deu = 105 MB) |

Der vCore eines billigen VPS ist deutlich langsamer als der Testkern; realistisch sind **eher
5–15 s pro Foto**, der Speicherbedarf bleibt gleich. Was das im Betrieb bedeutet:

- Die restliche App bleibt währenddessen bedienbar, weil tesseract ein eigener Prozess ist und die
  Event-Loop nicht blockiert — sie wird nur langsamer.
- Importiert eine zweite Person gleichzeitig, **wartet** ihr Job bis zu 30 s auf einen freien Slot
  und läuft dann; erst danach kommt `429`. Zwei gleichzeitige tesseract-Prozesse teilen sich auf
  einem Kern nur denselben Kern — beide würden doppelt so lange brauchen und eher in den 60-s-Timeout
  laufen, deshalb `IMPORT_OCR_CONCURRENCY=1` statt „warum nicht 2".
- `TESSERACT_LANGS=deu` heißt nicht, dass englische Rezepte nicht mehr gehen — die Rezept-Parser
  sind ohnehin deutsch. Es heißt, dass ein englisches FOTO schlechter erkannt wird. `deu+eng` kostet
  gemessen ~30 % mehr Zeit und ~15 MB mehr Speicher pro Seite.
- Die Oberfläche blendet den PDF-Teil aus (`features.pdfImport` auf `/api/health`), der Abschnitt
  „Bilddatei" bleibt. Ein PDF, das trotzdem hochgeladen wird, bekommt `501` mit einer Meldung, die
  auf das Foto verweist.

Ist es aus, verhält sich die App durchgehend so:

- `POST /imports/{image,pdf,file}` antworten **`501 ocr_disabled`** mit einer Meldung, die auf
  Webadresse und Text verweist. Die Prüfung läuft **vor** dem Rate-Limit und **vor** dem Lesen des
  Bodys — eine abgelehnte 15-MB-Datei wird also nie gepuffert.
- `/api/health` meldet `features.ocrImport: false` und `features.pdfImport: false`, und die
  Weboberfläche **blendet die Abschnitte „Foto vom Rezept“ und „PDF oder Bilddatei“ aus** statt
  einen Knopf anzubieten, der nicht kann.
- Alles andere bleibt: Webadresse, Text, Entwurfsprüfung, Speichern — und ein Entwurf, den ein
  früherer Foto-Import erzeugt hat, bleibt prüf- und speicherbar.

Ist nur PDF aus (die 1-GB-Variante oben), gilt dasselbe für `/imports/pdf` — und für `/imports/file`
genau dann, wenn die hochgeladene Datei **inhaltlich** ein PDF ist; entschieden wird nach Magic
Bytes, nicht nach Dateiname. Die Meldung ist dann eine andere: sie verweist aufs Foto, nicht auf die
Webadresse.

`IMPORT_OCR_ENABLED=1` bzw. `IMPORT_PDF_ENABLED=1` auf einem Image ohne das jeweilige Binary ist
kein Absturz, sondern der dokumentierte 422, der es benennt (`tesseract_unavailable` bzw.
`rasterization_unavailable`). Sinnvoll ist es trotzdem nicht — dann lieber neu bauen.

## Lokal testen, ohne Server

Der Stack läuft auch auf einem Laptop, mit `rezepte.test` als Hostname. Dort gibt es kein
öffentliches DNS, also die interne CA benutzen:

```bash
docker build -t toon-recipe:local .          # ohne OCR (Standard)
# nur Foto-Import:       docker build --build-arg WITH_OCR=1 --build-arg WITH_PDF=0 -t toon-recipe:local .
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

---

## Fehlersuche

### Erstinstallation

| Symptom | Ursache / Behebung |
| --- | --- |
| `Permission denied (publickey)` | Schlüssel nicht in `/home/<user>/.ssh/authorized_keys`, oder die Rechte stimmen nicht (`700` auf `.ssh`, `600` auf der Datei). |
| `toon is not in the sudoers file` | Sitzung ist älter als das `usermod -aG sudo toon`, oder es lief nie. Als `root` nachholen, dann **komplett neu anmelden**; `id` prüfen. Kein Root-SSH mehr → `su -`, sonst VNC-Konsole im Panel. Zeigt `id` schon `sudo`, wurde `/etc/sudoers` verändert: `grep -E '^%sudo' /etc/sudoers` muss `%sudo ALL=(ALL:ALL) ALL` liefern, Reparatur nur mit `visudo`. |
| `docker: permission denied` | Nach `usermod -aG docker` nicht neu eingeloggt. |
| `exec format error` beim Start | 32-Bit-Userland. `uname -m` muss `x86_64` oder `aarch64` sein. |
| `SESSION_SECRET fehlt` beim `up` | Die `.env` liegt nicht **neben** der `docker-compose.yml`, oder `SESSION_SECRET` ist leer. |
| `manifest unknown` / `denied` beim Pull | GHCR-Paket noch privat → `docker login ghcr.io -u <user>` mit einem Read-Only-PAT, oder auf *public* stellen ([Schritt 7](#7--image-beschaffen)); sonst falscher `TOON_IMAGE`-Wert. |
| Container ständig `unhealthy` | `docker compose logs app`. Meist eine fehlende Variable — die API nennt sie beim Start im Klartext. |

### TLS und Erreichbarkeit

| Symptom | Ursache / Behebung |
| --- | --- |
| Kein Zertifikat, ACME-Fehler im `caddy`-Log | DNS zeigt woanders hin, Port 80/443 ist zu (**zuerst die Anbieter-Firewall**), oder `TOON_HOSTNAME` ist ein interner Name → dann `TOON_TLS_ISSUER=internal`. Von außen: `dig +short <hostname>` und `curl -I http://<hostname>`. |
| Zertifikatswarnung trotz gültigem Zertifikat | Zugriff über die IP oder einen anderen Namen als `TOON_HOSTNAME`. Immer denselben Namen benutzen. |
| Browser-Warnung **und** keine Installations-Option | Interne CA ohne installiertes Wurzelzertifikat (auf iOS zusätzlich *aktivieren*) → [Ohne eigene Domain](#ohne-eigene-domain-im-lan). |
| Einkaufsliste funktioniert offline nicht | Gleiche Ursache: kein Service-Worker ohne vertrauenswürdiges Zertifikat. In den DevTools unter *Application → Service Workers* prüfen. |
| App zeigt nach dem Update die alte Version | Meist ein CDN/Proxy davor. `sw.js` und `index.html` liefert die API mit `Cache-Control: no-cache` aus — das darf nichts überschreiben. |

### Mail

| Symptom | Ursache / Behebung |
| --- | --- |
| Mails kommen nicht an | Zuerst `docker compose logs app \| grep '\[mail\]'` ([Mailversand prüfen](#mailversand-prüfen)). Steht dort `NOT SENT`, ist gar kein Versand eingerichtet — meist fehlt `MAIL_TRANSPORT=smtp`, obwohl `MAIL_HOST` & Co. gesetzt sind ([Schritt 10](#10--mailversand-einrichten)). Steht dort nichts, ging die Mail raus: dann SPF/DKIM/DMARC prüfen, bevor du dem Spam-Ordner misstraust. |
| API startet nicht, meckert über `MAIL_SECURITY` | `none` zusammen mit `MAIL_USER`/`MAIL_PASSWORD` ist absichtlich verboten — `tls` (465) oder `starttls` (587) benutzen. |
| Container startet nicht, `MAIL_API_KEY` fehlt | `MAIL_TRANSPORT=resend` ohne Key. Entweder den Key setzen oder auf den SMTP-Weg wechseln; eine zu alte `docker-compose.yml` auf dem Server gibt den Wert nicht durch. |

### Import, Speicher, Leistung

| Symptom | Ursache / Behebung |
| --- | --- |
| `501 ocr_disabled` beim Foto-Import | Erwartet: das GHCR-Image ist die schlanke Variante. Eigenes Image mit `--build-arg WITH_OCR=1` bauen. |
| `ocr_failed` bei jedem Foto-Import | `IMPORT_OCR_ENABLED=1` auf einem Image ohne die Binaries. `docker compose exec app tesseract --list-langs` muss `deu` und `eng` zeigen. `reason` sagt, was fehlt: `tesseract_unavailable` (Binary) oder `language_data_missing` (Sprachpaket). Nichts wird zur Laufzeit nachgeladen. |
| `pdf_no_text_layer` bei jedem gescannten PDF | poppler fehlt: `docker compose exec app pdftoppm -v`. |
| Container wird beim Import/Build „killed“ | Speicher. Swap prüfen ([Schritt 4](#4--firewall-und-swap)) und `TOON_MEM_LIMIT`. Auf 1 GB gehört `IMPORT_PDF_ENABLED=0` und `IMPORT_OCR_CONCURRENCY=1` dazu — siehe [Deutscher Foto-Import auf 1 GB](#deutscher-foto-import-auf-1-gb-und-einem-kern). |
| Foto-Import antwortet `429`, obwohl niemand sonst importiert | Ein früherer Job hängt noch in seinem Slot. `IMPORT_OCR_CONCURRENCY` ist die Slot-Zahl; ein neuer Import wartet 30 s auf einen freien und meldet erst dann `429`. Nach spätestens 60 s (`OCR_TIMEOUT_MS`) gibt jeder Job seinen Slot zurück. |
| App langsam, `docker stats` unauffällig | Platte. SQLite auf langsamem Speicher ist der häufigste Grund. |

### Auto-Deploy

| Symptom | Ursache / Behebung |
| --- | --- |
| Deploy läuft gar nicht | Meistens steht die Variable `DEPLOY_ENABLED` nicht auf `true` — der Job wird dann übersprungen (im Run als *skipped* zu sehen). Sonst: das `production`-Environment wartet auf eine Freigabe, oder der Push ging nicht auf `main`/einen `v*`-Tag. |
| `Host key verification failed` | `DEPLOY_SSH_KNOWN_HOSTS` passt nicht zum Server (neu aufgesetzt, anderer Port, oder vom Laptop statt auf dem Server abgelesen). Neu: `ssh-keyscan -p <port> <host>` **auf dem Server**. |
| `Permission denied (publickey)` | Der öffentliche Schlüssel steht nicht in der `authorized_keys` des `DEPLOY_SSH_USER`, oder in `DEPLOY_SSH_KEY` liegt der öffentliche statt des privaten Teils. |
| `FEHLER: Unbekannter Befehl` | Das feste Kommando greift, aber das Skript ist älter als der Workflow (oder umgekehrt). `toon-deploy` auf dem Server neu holen ([Schritt 12a](#12--auto-deploy-per-github-actions-optional)). |
| `permission denied` auf dem Docker-Socket | `DEPLOY_SSH_USER` ist nicht in der `docker`-Gruppe: `sudo usermod -aG docker <user>`. Wirkt erst für neue Sitzungen. |
| `docker compose pull` holt nichts Neues | In der `.env` steht ein fester `@sha256:…`-Digest in `TOON_IMAGE`. Für laufende Updates auf `:latest` zurückstellen. |

---

## Was hier bewusst fehlt

- **Foto-/PDF-Import ist aus.** `IMPORT_OCR_ENABLED` steht auf `0`, und das veröffentlichte Image
  ist die schlanke Variante **ohne** `tesseract`/`pdftoppm` — die Flag dort zu setzen bringt nur die
  dokumentierten 422er. Beides braucht ein selbst gebautes Image: Fotos ab 1 GB mit Swap
  (`--build-arg WITH_OCR=1 --build-arg WITH_PDF=0`), PDFs ab ~2 GB (`--build-arg WITH_OCR=1`), siehe
  [Import per Foto/PDF](#import-per-fotopdf-ist-optional). Import per URL und Text funktioniert
  vollständig.
- **Google-/GitHub-Login ist aus.** E-Mail + Passwort ist der selbstgehostete Weg; Registrierung,
  Login, Einladungen, E-Mail-Bestätigung und Passwort-Reset funktionieren ohne OAuth vollständig.
- **Ohne eigene Domain** läuft es auch, dann aber mit `TOON_TLS_ISSUER=internal`,
  `TOON_HSTS_MAX_AGE=0` und dem Wurzelzertifikat auf jedem Gerät — und ohne installiertes
  Wurzelzertifikat gibt es keinen Service-Worker, also keine Offline-Einkaufsliste. Siehe
  [Ohne eigene Domain](#ohne-eigene-domain-im-lan).
