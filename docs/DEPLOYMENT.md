# Wdrożenie na VPS

Scenariusz: VPS z Linuxem (Debian/Ubuntu), na którym **już działają inne kontenery**, a **nginx jest zainstalowany na hoście** (`/etc/nginx`, nie w Dockerze). Kod ląduje w `/opt/whiteitlab`.

Plan:
- **Etap 1 (teraz):** pierwsze wdrożenie ręcznie — komendy poniżej, do skopiowania po kolei.
- **Etap 2 (później):** CI/CD z GitHub Actions — [szkic na dole](#etap-2-cicd-później), ADR-025.

Wszystkie skrypty są w `scripts/` i są bezpieczne dla innych usług na serwerze:

| Skrypt | Co robi | Zmienia system? |
|---|---|---|
| `vps-preflight.sh` | sprawdza Dockera, wolny port, nginx, konflikty nazw, DNS, uprawnienia plików | **nie** (tylko czyta) |
| `nginx-install.sh bootstrap\|final` | instaluje config nginx, robi kopię, `nginx -t`, przy błędzie **cofa zmiany** | tak, tylko pliki `whiteitlab*` |
| `deploy.sh` | build, start, czeka na health check, przy błędzie **wraca do poprzedniego obrazu** | tylko kontener `whiteitlab-web` |
| `install-release.sh` | (wariant bez gita) instaluje wgraną paczkę `.tar.gz` z możliwością powrotu | tylko `/opt/whiteitlab*` |

---

## Etap 1: pierwsze wdrożenie (ręcznie)

### 0. Zanim zaczniesz

- **DNS:** rekordy `A` dla `whiteitlab.pl` i `www.whiteitlab.pl` → IP VPS (i `AAAA`, jeśli masz IPv6). Muszą już działać przed krokiem 5 (certyfikat).
- **SMTP:** host, port, login i hasło skrzynki, z której strona będzie wysyłać zgłoszenia, + adres, na który mają przychodzić.
- **Poczta:** SPF/DKIM/DMARC dla domeny nadawcy (`MAIL_FROM`) — inaczej zgłoszenia trafią do spamu.

### 1. Kod na serwer

Zaloguj się na VPS (`ssh user@IP`) i:

```bash
sudo mkdir -p /opt/whiteitlab
sudo chown "$USER": /opt/whiteitlab
git clone https://github.com/Pioti2252/WhiteItLabPage.git /opt/whiteitlab
cd /opt/whiteitlab
```

<details>
<summary>Wariant bez gita: wgranie paczki z Windowsa</summary>

Na Windowsie, w folderze projektu (PowerShell):

```powershell
npm run package                                   # tworzy whiteitlab.tar.gz z ostatniego commita
scp whiteitlab.tar.gz user@IP_VPS:/tmp/
```

Na VPS:

```bash
sudo mkdir -p /opt/whiteitlab
sudo tar -xzf /tmp/whiteitlab.tar.gz -C /opt/whiteitlab
sudo chown -R "$USER": /opt/whiteitlab
cd /opt/whiteitlab
```

Kolejne wersje wgrywasz tak samo do `/tmp`, a instalujesz: `sudo bash /opt/whiteitlab/scripts/install-release.sh /tmp/whiteitlab.tar.gz`.
Do CI/CD (etap 2) lepiej jednak przejść na `git clone`.
</details>

### 2. Konfiguracja i sekret

```bash
cd /opt/whiteitlab
cp .env.example .env
chmod 600 .env
nano .env
```

Uzupełnij w `.env`:
- `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `MAIL_FROM`, `MAIL_TO`,
- `WEB_PORT` — **zmień, jeśli 8080 zajmuje inny kontener** (krok 3 to sprawdzi).

Hasło SMTP osobno, jako sekret (nie trafia do historii powłoki ani do `docker inspect`):

```bash
mkdir -p secrets
read -rsp "Hasło SMTP: " P && printf %s "$P" > secrets/smtp_pass && unset P; echo
sudo chown 65532:65532 secrets/smtp_pass     # UID użytkownika w kontenerze
sudo chmod 400 secrets/smtp_pass
```

### 3. Kontrola przed startem

```bash
sudo bash scripts/vps-preflight.sh
```

Wszystko oznaczone ✘ popraw przed dalszymi krokami. Najczęstsze:
- **port zajęty** → w `.env` ustaw np. `WEB_PORT=8090` i uruchom preflight jeszcze raz,
- **brak `docker compose`** → `sudo apt install docker-compose-plugin`,
- **inny config nginx już używa `whiteitlab.pl`** → usuń/wyłącz stary wpis.

### 4. Start kontenera

```bash
bash scripts/deploy.sh          # jeśli Twój user nie jest w grupie docker: sudo bash scripts/deploy.sh
```

Pierwszy build trwa 1–3 min. Na końcu powinno być `OK — whiteitlab-web is healthy`. Sprawdź:

```bash
curl -s http://127.0.0.1:$(grep ^WEB_PORT= .env | cut -d= -f2)/healthz   # → ok
docker compose logs web | grep -E "smtp|listening"                        # "smtp ready" = SMTP działa
```

`smtp verify failed` → popraw `.env` / hasło i uruchom `bash scripts/deploy.sh` ponownie.

### 5. nginx + certyfikat

Konfiguracja startowa (tylko HTTP, żeby Let's Encrypt mógł zweryfikować domenę):

```bash
sudo bash scripts/nginx-install.sh bootstrap
```

Certyfikat (jeśli nie masz certbota: `sudo apt install certbot`):

```bash
sudo certbot certonly --webroot -w /var/www/certbot \
  -d whiteitlab.pl -d www.whiteitlab.pl \
  --email TWOJ@EMAIL --agree-tos --no-eff-email
```

Docelowa konfiguracja z HTTPS:

```bash
sudo bash scripts/nginx-install.sh final
```

Automatyczne odnawianie — certbot ma już timer systemd; brakuje tylko przeładowania nginx po odnowieniu. Sprawdź, czy taki hook już istnieje (mógł go dodać inny projekt):

```bash
ls /etc/letsencrypt/renewal-hooks/deploy/
```

Jeśli nie ma w nim niczego, co robi `reload nginx`:

```bash
printf '#!/bin/sh\nsystemctl reload nginx\n' | sudo tee /etc/letsencrypt/renewal-hooks/deploy/reload-nginx.sh
sudo chmod +x /etc/letsencrypt/renewal-hooks/deploy/reload-nginx.sh
sudo certbot renew --dry-run
```

> Skrypt nginx **nie rusza** innych konfiguracji ani `default` — instaluje tylko `whiteitlab.conf` i `snippets/whiteitlab-tls.conf`. Kopie poprzednich wersji: `/etc/nginx/whiteitlab-backups/`.

### 6. Firewall

Kontener słucha tylko na `127.0.0.1`, więc portu aplikacji **nie** otwierasz. Potrzebne są tylko 80 i 443 dla nginx — najpewniej już otwarte, skoro działają inne strony. Jeśli używasz UFW:

```bash
sudo ufw status | grep -E "80|443|Nginx"
```

### 7. Weryfikacja

```bash
curl -sI https://whiteitlab.pl | grep -iE 'HTTP/|strict-transport|content-security|content-encoding'
curl -sI http://whiteitlab.pl | head -1          # 301 → https
curl -sI https://www.whiteitlab.pl | head -1     # 301 → https://whiteitlab.pl
curl -s -o /dev/null -w '%{http_code}\n' https://whiteitlab.pl/healthz   # 403 (zablokowane z zewnątrz)
```

Potem w przeglądarce: obie wersje językowe, **testowe zgłoszenie z formularza** (sprawdź skrzynkę `MAIL_TO`), przełącznik motywu.
Zewnętrznie: [SSL Labs](https://www.ssllabs.com/ssltest/) (cel A/A+), [securityheaders.com](https://securityheaders.com) (cel A+), a potem checklista SEO: [SEO.md](SEO.md#po-uruchomieniu-produkcji--checklista).

---

## Aktualizacja (ręcznie, do czasu CI/CD)

```bash
cd /opt/whiteitlab
bash scripts/deploy.sh
```

Skrypt robi `git pull`, zapisuje działający obraz jako `whiteitlab/web:prev`, buduje nowy (z aktualnymi łatkami obrazów bazowych), uruchamia i czeka na health check. **Jeśli nowa wersja nie wstanie — sam wraca do poprzedniej.**

Ręczny powrót do poprzedniej wersji:

```bash
bash scripts/deploy.sh --rollback
```

Zmiana tylko w nginx (np. nowa wersja `deploy/nginx/whiteitlab.conf`): `sudo bash scripts/nginx-install.sh final`.

---

## Etap 2: CI/CD (później)

Docelowy przepływ (ADR-025), do zrobienia, gdy ręczne wdrożenie będzie działać stabilnie:

```
push / merge do main
  └─ GitHub Actions
       ├─ test:   npm ci → npm run build → npm test
       ├─ scan:   npm audit, Trivy (obraz) — blokuje przy CRITICAL/HIGH
       ├─ build:  docker build → push do ghcr.io/pioti2252/whiteitlab-web:<sha> (+ :latest)
       └─ deploy: SSH na VPS jako osobny użytkownik "deploy"
                  → docker compose pull && up -d → health check → rollback przy błędzie
```

Co się wtedy zmieni:
- Obraz będzie **budowany w GitHub Actions**, a nie na VPS (mniej obciążenia serwera, ten sam obraz, który przeszedł testy i skan).
- `compose.yaml` dostanie `image: ghcr.io/…:${TAG}` zamiast `build:`; `deploy.sh` zamiast budować zrobi `pull`.
- Na VPS powstanie użytkownik `deploy` (grupa `docker`, logowanie tylko kluczem, klucz ograniczony w `authorized_keys`), a klucz prywatny trafi do *GitHub Secrets*.
- Wdrożenie na produkcję przez *GitHub Environments* — opcjonalnie z ręcznym zatwierdzeniem.

Ten układ katalogów (`/opt/whiteitlab`, `.env`, `secrets/`) i skrypty zostają bez zmian — dlatego pierwsze wdrożenie warto zrobić przez `git clone`.

---

## Diagnostyka

| Objaw | Sprawdź |
|---|---|
| `deploy.sh`: „not healthy” | wypisuje ostatnie logi; zwykle `Missing required env` (uzupełnij `.env`) albo `EACCES` na sekrecie (krok 2: `chown 65532`) |
| 502 Bad Gateway | `docker compose ps` — czy działa i jest `healthy`; czy `WEB_PORT` w `.env` = port w `upstream` (`grep 127.0.0.1 /etc/nginx/*/whiteitlab.conf`) — po zmianie portu uruchom `nginx-install.sh final` |
| `nginx-install.sh`: „nginx -t FAILED” | przywrócił poprzedni stan; przeczytaj komunikat `nginx -t` nad nim. Najczęściej: `cannot load certificate` (tryb `final` przed certbotem), `a duplicate default server` / `duplicate listen options` (inny config ma na :443 opcje typu `default_server`, `reuseport` — nasz ich nie używa, więc zwykle to problem istniejącej konfiguracji) albo `limit_req_zone "wl_…" is already bound` (plik zainstalowany drugi raz pod inną nazwą) |
| certbot: „unauthorized / 404” | DNS jeszcze nie wskazuje na VPS albo nie wykonano `nginx-install.sh bootstrap` |
| Formularz: „Coś poszło nie tak” | `docker compose logs web` → `mail send failed` + kod błędu SMTP |
| Formularz: 403 | `ALLOWED_ORIGINS` w `.env` nie zawiera adresu, pod którym otwierasz stronę |
| Formularz: 429 | działa rate-limit (nginx lub aplikacja) — odczekaj 15 min |
| Maile w spamie | SPF/DKIM/DMARC domeny z `MAIL_FROM` |

W kontenerze nie ma powłoki (distroless) — `docker exec … sh` nie zadziała celowo. Do debugowania: `docker compose logs web`, `docker inspect whiteitlab-web`.
