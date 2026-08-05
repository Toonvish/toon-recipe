# Vom frischen Server zur installierten App

Diese Anleitung fängt bei einem **gerade bestellten VPS** an und endet mit der App als Icon auf dem
Handy. Sie ist anbieterunabhängig; als laufendes Beispiel dient ein Ein-Kern-VPS mit 1 GB RAM und
30 GB SSD, also die billigste Klasse (netcup VPS pico, Hetzner CX22, Oracle Free Tier, IONOS VPS S).
Ab [Schritt 6](#6--dns-eintragen) übernimmt [deployment.md](./deployment.md).

| | |
| --- | --- |
| Zeitbedarf | ca. 30 Minuten, davon ~10 Minuten Warten |
| Was danach läuft | API + PWA + TLS, alles in einem Container-Stack auf dem Server |
| Fremde Dienste | eine Domain und (für echte Mails) der SMTP-Zugang eines Mailanbieters. Kein API-Key, keine Cloud-Datenbank. |

---

## 0 — Was du brauchst

- **Ein VPS mit 64-Bit-Linux**, `x86_64` oder `arm64`. **1 GB RAM genügt**, solange der
  Foto-/PDF-Import aus bleibt (Standard) — mit OCR sind es mindestens 2 GB, siehe
  [deployment.md](./deployment.md#import-per-fotopdf-ist-optional). 10 GB Platte reichen für die App;
  der Rest ist Platz für Rezeptbilder.
- **Eine Domain oder Subdomain**, deren DNS du bearbeiten kannst. Ohne sie geht es auch, dann aber
  nur im LAN und mit einer eigenen CA auf jedem Gerät —
  [Ohne eigene Domain](./deployment.md#ohne-eigene-domain-im-lan).
- **Ein SSH-Schlüsselpaar.** Falls keins da ist: `ssh-keygen -t ed25519`.
- Optional, für echte Mails: **SMTP-Zugangsdaten** (Host, Port, Benutzer, Passwort) von einem
  Mailanbieter. Kann später nachgerüstet werden.

---

## 1 — Server bestellen und Betriebssystem wählen

Beim Bestellen:

1. **Betriebssystem:** Debian 13 oder Ubuntu 24.04 LTS, jeweils die minimale Variante. Kein Panel,
   kein vorinstalliertes Webhosting — es läuft nur Docker darauf.
2. **SSH-Schlüssel hinterlegen**, wenn der Anbieter das anbietet. Sonst kommt das Passwort per Mail
   und Schritt 2 tauscht es gegen den Schlüssel.
3. **IPv4 + IPv6** nehmen, wenn beides angeboten wird. Reines IPv6 ist billiger und für Geräte in
   IPv4-Netzen nicht erreichbar.

Erste Anmeldung, dann alles aktualisieren:

```bash
ssh root@<server-ip>
apt update && apt full-upgrade -y
reboot
```

---

## 2 — Grundeinrichtung: Benutzer, SSH, automatische Updates

Nicht als `root` arbeiten:

```bash
adduser toon
usermod -aG sudo toon
install -d -m 700 -o toon -g toon /home/toon/.ssh
# öffentlichen Schlüssel eintragen (vom Laptop: cat ~/.ssh/id_ed25519.pub)
nano /home/toon/.ssh/authorized_keys
chown toon:toon /home/toon/.ssh/authorized_keys && chmod 600 /home/toon/.ssh/authorized_keys
```

In einer **zweiten Sitzung** prüfen, dass `ssh toon@<server-ip>` funktioniert — erst danach den
Weg zurück zumauern, sonst sperrst du dich aus. In `/etc/ssh/sshd_config`:

```
PermitRootLogin no
PasswordAuthentication no
```

```bash
sudo systemctl restart ssh
```

Sicherheitsupdates automatisch einspielen (der Kernel braucht danach gelegentlich einen Reboot,
die Container laufen ohne):

```bash
sudo apt install -y unattended-upgrades
sudo dpkg-reconfigure -plow unattended-upgrades
```

---

## 3 — Firewall

Offen müssen 22 (SSH), 80 und 443 (Caddy) sein. Sonst nichts — die App-Ports liegen im
Docker-Netz, und Mailpit hängt bewusst auf `127.0.0.1`.

```bash
sudo apt install -y ufw
sudo ufw allow 22/tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
```

> **`ufw` schützt keine veröffentlichten Container-Ports.** Docker schreibt seine Regeln in die
> `DOCKER`-Chain, die vor den ufw-Regeln greift: was in der compose-Datei unter `ports:` steht, ist
> erreichbar, auch wenn ufw es verbietet. Deshalb steht dort `127.0.0.1:8025:8025` für Mailpit und
> nur 80/443 ohne Adresse. Wer weitere Ports veröffentlicht, muss die Adresse selbst begrenzen.
>
> Hat der Anbieter eine eigene Firewall vor der VM (netcup, Hetzner Cloud, AWS), ist die der
> bessere Ort für dieselbe Regel — sie greift, bevor das Paket die Kiste erreicht.

---

## 4 — Swap anlegen

Ein 1-GB-Server ohne Swap holt bei jedem Ausreißer sofort den OOM-Killer. 1–2 GB Auslagerung
kosten nur Plattenplatz:

```bash
sudo fallocate -l 2G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
# Swap erst spät benutzen — er ist Reserve, nicht Arbeitsspeicher
echo 'vm.swappiness=10' | sudo tee /etc/sysctl.d/99-swappiness.conf
sudo sysctl -p /etc/sysctl.d/99-swappiness.conf
free -h
```

Manche Anbieter liefern schon Swap oder `zram` mit — dann `swapon --show` prüfen und diesen
Schritt überspringen.

---

## 5 — Docker installieren

```bash
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker "$USER"
# neu einloggen, damit die Gruppe greift
exit
```

Nach dem erneuten Anmelden kontrollieren:

```bash
docker run --rm hello-world
docker compose version
docker info | grep -i -e warning -e "memory limit"
```

Warnungen über fehlende Speicherlimits darf es hier nicht geben — der Stack setzt
`mem_limit` auf den App-Container, und ohne Cgroup-Unterstützung wäre das wirkungslos. Bei einem
normalen VPS-Kernel ist es vorhanden.

---

## 6 — DNS eintragen

Beim DNS-Anbieter der Domain:

```
rezepte   A      <IPv4 des Servers>
rezepte   AAAA   <IPv6 des Servers>     # nur wenn vorhanden
```

Und prüfen, **bevor** der Stack startet — ein falscher Eintrag kostet sonst ein
Let's-Encrypt-Rate-Limit:

```bash
dig +short rezepte.example.org
```

Reverse DNS (PTR) ist nicht nötig: die App verschickt Mails über den Relay eines Anbieters, nicht
selbst.

---

## 7 — App installieren

Ab hier ist [deployment.md](./deployment.md#erstinstallation) die Anleitung, in dieser Reihenfolge:

1. [Image veröffentlichen lassen](./deployment.md#1--image-veröffentlichen-lassen) — oder direkt
   `ghcr.io/toonvish/toon-recipe:latest` benutzen, wenn das Paket public ist.
2. [Verzeichnis und `.env`](./deployment.md#3--verzeichnis-und-env-auf-dem-server) —
   `TOON_HOSTNAME`, `SESSION_SECRET`, `docker-compose.yml` + `docker/Caddyfile` nach
   `/opt/toon-recipe`.
3. [Mailversand](./deployment.md#4--mailversand-einrichten) — ohne Angaben landet alles in Mailpit,
   das nichts zustellt.
4. [Starten und ersten Account anlegen](./deployment.md#5--starten-und-ersten-account-anlegen).
5. Optional: [Auto-Deploy per GitHub Actions](./deployment.md#6--auto-deploy-per-github-actions-optional)
   — dann rollt jeder Push auf `main` sich selbst aus. Ohne das bleibt es beim manuellen
   `docker compose pull && docker compose up -d`.

---

## Abschluss-Checkliste

- [ ] `ssh toon@<server>` funktioniert mit Schlüssel, `root` und Passwort-Login sind aus.
- [ ] `sudo ufw status` zeigt 22, 80, 443 — und sonst nichts.
- [ ] `free -h` zeigt Swap.
- [ ] `dig +short <hostname>` liefert die Server-IP.
- [ ] `docker compose ps` zeigt `app` als `healthy`, `caddy` und `mailpit` als `running`.
- [ ] `https://<hostname>` öffnet die App **ohne** Zertifikatswarnung.
- [ ] Ein Account ist registriert, und die App lässt sich auf dem Handy installieren.
- [ ] Eine Passwort-Reset-Mail an eine externe Adresse kommt an (oder Mailpit ist bewusst der
      Endpunkt).
- [ ] Ein erstes Backup des `toon-data`-Volumes liegt außerhalb des Servers
      ([Backup](./deployment.md#backup)).

---

## Fehlersuche bei der Erstinstallation

| Symptom | Ursache / Behebung |
| --- | --- |
| `Permission denied (publickey)` | Schlüssel nicht in `/home/<user>/.ssh/authorized_keys`, oder die Rechte stimmen nicht (`700` auf `.ssh`, `600` auf der Datei). |
| `docker: permission denied` | Nach `usermod -aG docker` nicht neu eingeloggt. |
| `exec format error` beim Start | 32-Bit-Userland. `uname -m` muss `x86_64` oder `aarch64` sein. |
| `SESSION_SECRET fehlt` beim `up` | Die `.env` liegt nicht **neben** der `docker-compose.yml`, oder `SESSION_SECRET` ist leer. |
| `manifest unknown` / `denied` beim Pull | GHCR-Paket noch privat → `docker login ghcr.io`, oder falscher `TOON_IMAGE`-Wert. |
| Kein Zertifikat, ACME-Fehler im `caddy`-Log | DNS zeigt woanders hin, oder Port 80/443 ist zu (Anbieter-Firewall!). Von außen: `curl -I http://<hostname>`. |
| Container wird beim Import/Build „killed“ | Speicher. Swap prüfen ([Schritt 4](#4--swap-anlegen)); OCR braucht 2 GB und ist auf dieser Klasse nicht vorgesehen. |
| App langsam, `docker stats` unauffällig | Platte. SQLite auf langsamem Speicher ist der häufigste Grund. |
