# Runbook: frischer VPS → installierte App

Eine durchgehende Befehlsfolge für **eine** Installation, von der ersten SSH-Anmeldung bis zum
App-Icon auf dem Handy. Sie fasst [server-setup.md](./server-setup.md) (Grundeinrichtung) und
[deployment.md](./deployment.md) (Erstinstallation) zu einer linearen Liste zusammen — die beiden
Dokumente bleiben die **Referenz für das Warum**, hier steht nur das Was, in der richtigen
Reihenfolge.

Laufendes Beispiel: ein netcup VPS pico (Ein-Kern, kleiner RAM, SSD) mit Debian 13 und einer
eigenen Subdomain. Foto-/PDF-Import bleibt aus — das ist der Standard und der Grund, warum die
App auf diese Klasse passt.

| | |
| --- | --- |
| Zeitbedarf | ca. 30 Minuten, davon ~10 Minuten Warten auf DNS und Zertifikat |
| Voraussetzung | VPS mit 64-Bit-Linux (`x86_64`/`aarch64`), eine Subdomain mit editierbarem DNS, ein SSH-Schlüsselpaar |
| Fremde Dienste | die Domain; für echte Mails der SMTP-Zugang eines Mailanbieters. Kein API-Key, keine Cloud-Datenbank. |

---

## 0 — Werte sammeln

Vor dem ersten Befehl diese vier Dinge bereitlegen — sie kommen in jedem Schritt vor:

| Platzhalter | Woher |
| --- | --- |
| `<server-ip>` | Server Control Panel des Anbieters → *Netzwerk / IP-Adressen*, oder die Liefermail |
| `<hostname>` | die geplante Subdomain, z. B. `rezepte.example.org` |
| `<user>` | der anzulegende Benutzer, im Folgenden `toon` |
| Public Key | auf dem Laptop: `cat ~/.ssh/id_ed25519.pub` (falls keiner da ist: `ssh-keygen -t ed25519`) |

**Alle folgenden Befehle laufen auf dem Server**, außer wo ausdrücklich „vom Laptop“ steht.

---

## 1 — Erstanmeldung und Update

```bash
ssh root@<server-ip>
apt update && apt full-upgrade -y
reboot
```

Kommt hier `Permission denied (publickey)` und das Passwort ist bekannt, erzwingt
`ssh -o PreferredAuthentications=password root@<server-ip>` den Passwort-Weg. Geht gar nichts,
hilft die **VNC-Konsole** im Panel des Anbieters: die ist kein SSH, also greift dort keine
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

Erst wenn Schritt 2 nachweislich funktioniert. In `/etc/ssh/sshd_config`:

```
PermitRootLogin no
PasswordAuthentication no
```

```bash
sudo systemctl restart ssh
sudo apt install -y unattended-upgrades
sudo dpkg-reconfigure -plow unattended-upgrades
```

---

## 4 — Firewall und Swap

Offen müssen nur 22, 80 und 443 sein:

```bash
sudo apt install -y ufw
sudo ufw allow 22/tcp && sudo ufw allow 80/tcp && sudo ufw allow 443/tcp
sudo ufw enable
sudo ufw status
```

> **`ufw` schützt keine veröffentlichten Container-Ports** — Dockers Regeln greifen davor. Deshalb
> steht Mailpit in der compose-Datei auf `127.0.0.1:8025:8025` und nur 80/443 ohne Adresse.
>
> **Hat der Anbieter eine eigene Firewall vor der VM** (netcup, Hetzner Cloud, AWS), muss 80 und 443
> **auch dort** offen sein. Eine geschlossene Anbieter-Firewall ist die häufigste Ursache für „kein
> Zertifikat“ in Schritt 8 — und im App-Log ist davon nichts zu sehen.

Swap, damit ein Ausreißer nicht sofort den OOM-Killer holt (`swapon --show` zuerst — manche Images
bringen schon welchen mit, dann überspringen):

```bash
sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile
sudo mkswap /swapfile && sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
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

Nach der neuen Anmeldung:

```bash
docker run --rm hello-world
docker compose version
docker info | grep -i -e warning -e "memory limit"
```

Warnungen über fehlende Speicherlimits darf es nicht geben — der Stack setzt `mem_limit` auf den
App-Container, und ohne Cgroup-Unterstützung wäre das wirkungslos.

---

## 6 — DNS eintragen und prüfen

Beim DNS-Anbieter der Domain:

```
rezepte   A      <server-ip>
rezepte   AAAA   <IPv6 des Servers>         # nur wenn vorhanden
```

**Vor** dem Start des Stacks kontrollieren — ein falscher Eintrag kostet ein
Let's-Encrypt-Rate-Limit:

```bash
dig +short <hostname>                       # muss die Server-IP liefern
```

Reverse DNS (PTR) ist nicht nötig; Mails gehen über einen Relay, nicht vom Server selbst.

---

## 7 — Verzeichnis, `.env`, compose-Dateien

Das Image liegt öffentlich auf GHCR, der Server braucht also **kein** `docker login`:

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

`TOON_HOSTNAME` und `MAIL_FROM` in der `.env` noch auf die echten Werte setzen. Drei Dinge, die
hier schiefgehen:

- **`SESSION_SECRET` nie wieder ändern.** Er signiert auch die `?sig`-Parameter der
  `/uploads`-URLs — ein neuer Wert macht alle bereits ausgelieferten Bild-URLs ungültig (die Bilder
  selbst bleiben).
- **Die `.env` muss *neben* der `docker-compose.yml` liegen**, sonst bricht der Start mit
  `SESSION_SECRET fehlt` ab.
- **`PUBLIC_API_URL` nicht setzen.** Der leere Wert ist Absicht: das Bundle benutzt relative URLs
  und die API liefert es vom selben Origin aus.

---

## 8 — Starten

```bash
cd /opt/toon-recipe
docker compose up -d
docker compose ps                           # app muss "healthy" werden
docker compose logs -f caddy                # das Zertifikat kommt in den ersten Sekunden
```

Dann `https://<hostname>` öffnen und registrieren. Der erste Account bekommt automatisch eine
eigene Gruppe („Meine Rezepte“); weitere Personen über *Profil → Gruppen → Einladen*.

Installieren: Android ⋮ → *App installieren*, iOS *Teilen* → *Zum Home-Bildschirm*. Die
Einkaufsliste funktioniert danach offline — das hängt am Service-Worker und der am gültigen
Zertifikat.

---

## 9 — Mail (optional, aber vor dem ersten Passwort-Reset)

Ohne weitere Angaben liefert die App an den **Mailpit**-Container: der sammelt Mails und schickt
**nichts** raus. Für echte Zustellung den SMTP-Zugang eines Mailanbieters in die `.env`:

```bash
cat >> .env <<'EOF'
MAIL_HOST=mx.example.net
MAIL_PORT=465
MAIL_SECURITY=tls
MAIL_USER=rezepte@example.org
MAIL_PASSWORD=…
EOF
docker compose up -d
```

- `MAIL_SECURITY`: `tls` = implizites TLS auf 465 (empfohlen), `starttls` = 587. `none` ist nur für
  einen Relay im eigenen Netz — **`none` zusammen mit Zugangsdaten verweigert die API beim Start**.
- `MAIL_FROM` muss eine Adresse sein, die der Relay senden darf.
- **SPF, DKIM und DMARC** beim Anbieter einrichten, sonst landen Reset- und Einladungsmails im Spam.
- Prüfen: Passwort-Reset an eine externe Adresse anfordern, dann `docker compose logs app | grep mail`.

### Variante Resend

Bequem, weil kein Postfach dazugehört: verifizierte Domain plus API-Key, sonst nichts. Beide Wege
unten brauchen dieselbe Vorbereitung im Resend-Dashboard:

1. *Domains → Add Domain* mit der eigenen Domain. Resend zeigt einen `MX`- und zwei
   `TXT`-Records (Return-Path und DKIM) — die in **dieselbe DNS-Zone** wie den A-Record aus
   [Schritt 6](#6--dns-eintragen-und-prüfen) legen, dann *Verify*.
2. DMARC kommt **nicht** von Resend, den Record selbst dazu:
   `_dmarc TXT "v=DMARC1; p=none; rua=mailto:du@example.org"`.
3. *API Keys → Create API Key*, Recht *Sending access*. Der `re_…`-Wert ist nur einmal sichtbar.

Dann entweder **über SMTP** — derselbe Adapter wie oben, `MAIL_USER` ist wörtlich `resend` und der
API-Key das Passwort:

```bash
cat >> .env <<'EOF'
MAIL_HOST=smtp.resend.com
MAIL_PORT=465
MAIL_SECURITY=tls
MAIL_USER=resend
MAIL_PASSWORD=re_…
EOF
docker compose up -d
```

oder **über den HTTP-Adapter**, dann ohne SMTP-Werte:

```bash
cat >> .env <<'EOF'
MAIL_TRANSPORT=resend
MAIL_API_KEY=re_…
EOF
docker compose up -d
```

`MAIL_FROM` muss in beiden Fällen auf der verifizierten Domain liegen. Der SMTP-Weg ist der
unauffälligere: er benutzt genau die Variablen, die auch für jeden anderen Anbieter gelten, und ein
Wechsel des Anbieters ist eine Zeile. `MAIL_TRANSPORT=resend` setzt dagegen `MAIL_API_KEY` voraus —
**fehlt der Wert, startet der Container nicht** (die API verweigert den Start absichtlich, statt
Mails still zu verschlucken). Ist die `docker-compose.yml` auf dem Server älter als diese Zeile im
Repo, muss sie neu geholt werden, sonst erreicht `MAIL_API_KEY` den Container nicht (die
`curl`-Zeilen aus [Schritt 7](#7--verzeichnis-env-compose-dateien)).

Mailpit-UI (zeigt jede Mail inkl. Reset- und Einladungslinks, daher nur über Loopback erreichbar) —
**vom Laptop**:

```bash
ssh -N -L 8025:127.0.0.1:8025 toon@<server-ip>
# dann http://localhost:8025
```

Ausgesperrter Account ohne Mail:

```bash
docker compose exec app bun apps/api/scripts/reset-password.ts <email>
```

---

## 10 — Erstes Backup

Alles Wichtige liegt im Volume `toon-data` (Datenbank + Uploads):

```bash
cd /opt/toon-recipe
docker compose stop app                     # SQLite konsistent sichern
docker run --rm -v toon-recipe_toon-data:/data -v "$PWD:/backup" alpine \
  tar czf "/backup/toon-$(date +%F).tar.gz" -C /data .
docker compose start app
```

Die Datei anschließend **vom Server wegkopieren**. Ein Hoster-Snapshot ersetzt das nicht: eine
laufende SQLite-Datei darin ist nicht garantiert konsistent.

---

## Abschluss-Checkliste

- [ ] `ssh toon@<server-ip>` mit Schlüssel; `id` zeigt `sudo`; `root`- und Passwort-Login sind aus.
- [ ] `sudo ufw status` zeigt 22, 80, 443 — und sonst nichts; die Anbieter-Firewall passt dazu.
- [ ] `free -h` zeigt Swap.
- [ ] `dig +short <hostname>` liefert die Server-IP.
- [ ] `docker compose ps`: `app` = `healthy`, `caddy` + `mailpit` = `running`.
- [ ] `https://<hostname>` öffnet die App **ohne** Zertifikatswarnung.
- [ ] Ein Account ist registriert und die App auf dem Handy installiert.
- [ ] Eine Reset-Mail an eine externe Adresse kommt an (oder Mailpit ist bewusst der Endpunkt).
- [ ] Ein Backup des `toon-data`-Volumes liegt außerhalb des Servers.

---

## Betrieb

**Update** — CI baut immer; ob sie auch ausrollt, hängt daran, ob
[Auto-Deploy](./deployment.md#6--auto-deploy-per-github-actions-optional) eingerichtet ist. Von Hand
geht es immer:

```bash
cd /opt/toon-recipe && docker compose pull && docker compose up -d --remove-orphans
docker compose ps
```

Haben sich `docker-compose.yml` oder `docker/Caddyfile` im Repo geändert, vorher neu holen — der
Server bekommt sie in keinem der beiden Fälle von selbst (die `curl`-Zeilen aus
[Schritt 7](#7--verzeichnis-env-compose-dateien), oder `toon-deploy sync-config`).

**Logs**

```bash
docker compose logs -f app                  # API, Import-/Mail-Fehler
docker compose logs -f caddy                # TLS, Zertifikate
```

---

## Fehlersuche

| Symptom | Ursache / Behebung |
| --- | --- |
| `toon is not in the sudoers file` | Sitzung ist älter als das `usermod -aG sudo toon`, oder es lief nie. Als `root` nachholen, dann **komplett neu anmelden**; `id` prüfen. Kein Root-SSH mehr → `su -`, sonst VNC-Konsole im Panel. Zeigt `id` schon `sudo`, wurde `/etc/sudoers` verändert: `grep -E '^%sudo' /etc/sudoers` muss `%sudo ALL=(ALL:ALL) ALL` liefern, Reparatur nur mit `visudo`. |
| `Permission denied (publickey)` | Schlüssel nicht in `/home/toon/.ssh/authorized_keys`, oder Rechte falsch (`700` auf `.ssh`, `600` auf der Datei). |
| `docker: permission denied` | Nach `usermod -aG docker` nicht neu angemeldet. |
| `exec format error` beim Start | 32-Bit-Userland. `uname -m` muss `x86_64` oder `aarch64` sein. |
| `SESSION_SECRET fehlt` beim `up` | `.env` liegt nicht neben der `docker-compose.yml`, oder der Wert ist leer. |
| `manifest unknown` / `denied` beim Pull | Falscher `TOON_IMAGE`-Wert, oder das Paket ist privat → `docker login ghcr.io`. |
| Kein Zertifikat, ACME-Fehler im `caddy`-Log | DNS zeigt woanders hin, oder Port 80/443 ist zu — **zuerst die Anbieter-Firewall**. Von außen: `dig +short <hostname>` und `curl -I http://<hostname>`. |
| Zertifikatswarnung trotz gültigem Zertifikat | Zugriff über die IP oder einen anderen Namen als `TOON_HOSTNAME`. Immer denselben Namen benutzen. |
| Container wird beim Import „killed“ | Speicher. Swap prüfen; Foto-/PDF-Import braucht 2 GB und ist auf dieser Klasse nicht vorgesehen. |
| App langsam, `docker stats` unauffällig | Platte. SQLite auf langsamem Speicher ist der häufigste Grund. |

---

## Was hier bewusst fehlt

- **Foto-/PDF-Import ist aus.** `IMPORT_OCR_ENABLED` steht auf `0`, und das veröffentlichte Image
  ist die schlanke Variante **ohne** `tesseract`/`pdftoppm` — die Flag dort zu setzen bringt nur die
  dokumentierten 422er. Es braucht ~2 GB RAM und ein selbst gebautes Image
  (`--build-arg WITH_OCR=1`), siehe [deployment.md](./deployment.md#import-per-fotopdf-ist-optional).
  Import per URL und Text funktioniert vollständig.
- **Google-/GitHub-Login ist aus.** E-Mail + Passwort ist der selbstgehostete Weg; Registrierung,
  Login, Einladungen und Passwort-Reset funktionieren ohne OAuth vollständig.
- **Ohne eigene Domain** läuft es auch, dann aber mit `TOON_TLS_ISSUER=internal`,
  `TOON_HSTS_MAX_AGE=0` und dem Wurzelzertifikat auf jedem Gerät — und ohne installiertes
  Wurzelzertifikat gibt es keinen Service-Worker, also keine Offline-Einkaufsliste. Siehe
  [deployment.md](./deployment.md#ohne-eigene-domain-im-lan).
