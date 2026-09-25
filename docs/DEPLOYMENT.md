# Wdrożenie na VPS

Instrukcja zakłada Debiana 12 lub Ubuntu 22.04/24.04, dostęp przez SSH z `sudo` i domenę `whiteitlab.pl` (zmiana domeny: [CONTENT.md](CONTENT.md#zmiana-domeny)).

## 0. DNS

| Rekord | Nazwa | Wartość |
|---|---|---|
| A | `whiteitlab.pl` | IPv4 VPS |
| A | `www` | IPv4 VPS |
| AAAA | `@`, `www` | IPv6 VPS (jeśli jest) |

Dla poczty nadawcy (`MAIL_FROM`) ustaw **SPF, DKIM i DMARC** zgodnie z instrukcją dostawcy SMTP — bez tego zgłoszenia będą lądować w spamie.

## 1. Przygotowanie serwera (jednorazowo)

```bash
sudo apt update && sudo apt install -y nginx certbot ufw git
# Docker Engine + compose plugin: https://docs.docker.com/engine/install/
sudo usermod -aG docker "$USER"   # wyloguj się i zaloguj ponownie

sudo ufw allow OpenSSH
sudo ufw allow 'Nginx Full'
sudo ufw enable
```

> Port 8080 **nie** jest otwierany w firewallu. Kontener publikuje go tylko na `127.0.0.1` (ADR-007) — to ważne, bo Docker przy publikacji na `0.0.0.0` omija reguły UFW.

## 2. Kod i konfiguracja

```bash
sudo mkdir -p /opt/whiteitlab && sudo chown "$USER": /opt/whiteitlab
git clone <repo> /opt/whiteitlab && cd /opt/whiteitlab

cp .env.example .env
chmod 600 .env
nano .env                         # SMTP_HOST, SMTP_USER, MAIL_FROM, MAIL_TO …

mkdir -p secrets
read -rsp "Hasło SMTP: " P && printf %s "$P" > secrets/smtp_pass && unset P; echo   # hasło nie trafia do historii powłoki
sudo chown 65532:65532 secrets/smtp_pass            # UID użytkownika w kontenerze
sudo chmod 400 secrets/smtp_pass
```

## 3. Uruchomienie kontenera

```bash
docker compose up -d --build
docker compose ps                  # STATUS powinien przejść w "healthy"
curl -s http://127.0.0.1:8080/healthz   # → ok
docker compose logs web | tail     # "smtp ready" = logowanie do SMTP działa
```

Jeśli w logach jest `smtp verify failed` — popraw `.env` / hasło i `docker compose up -d`.

## 4. nginx + certyfikat

**4a. Konfiguracja startowa** (tylko port 80, pod wyzwanie ACME):

```bash
sudo mkdir -p /var/www/certbot
sudo cp deploy/nginx/whiteitlab-bootstrap.conf /etc/nginx/sites-available/whiteitlab.conf
sudo ln -sf /etc/nginx/sites-available/whiteitlab.conf /etc/nginx/sites-enabled/whiteitlab.conf
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl reload nginx
```

**4b. Certyfikat:**

```bash
sudo certbot certonly --webroot -w /var/www/certbot \
  -d whiteitlab.pl -d www.whiteitlab.pl \
  --email TWOJ@EMAIL --agree-tos --no-eff-email
```

**4c. Docelowa konfiguracja:**

```bash
sudo cp deploy/nginx/whiteitlab-tls.conf /etc/nginx/snippets/whiteitlab-tls.conf
sudo cp deploy/nginx/whiteitlab.conf     /etc/nginx/sites-available/whiteitlab.conf
sudo nginx -t && sudo systemctl reload nginx
```

**4d. Automatyczne odnawianie** — certbot instaluje timer systemd; dodaj przeładowanie nginx po odnowieniu:

```bash
echo -e '#!/bin/sh\nsystemctl reload nginx' | sudo tee /etc/letsencrypt/renewal-hooks/deploy/reload-nginx.sh
sudo chmod +x /etc/letsencrypt/renewal-hooks/deploy/reload-nginx.sh
sudo certbot renew --dry-run
```

## 5. Weryfikacja

```bash
curl -sI https://whiteitlab.pl | grep -iE 'strict-transport|content-security|x-content'
curl -sI http://whiteitlab.pl        # 301 → https
curl -sI https://www.whiteitlab.pl   # 301 → https://whiteitlab.pl
curl -s -o /dev/null -w '%{http_code}\n' https://whiteitlab.pl/healthz   # 403 (zablokowane z zewnątrz)
```

Następnie wyślij testowe zgłoszenie z formularza i sprawdź skrzynkę `MAIL_TO`.
Zewnętrzne testy: [SSL Labs](https://www.ssllabs.com/ssltest/) (cel: A/A+), [securityheaders.com](https://securityheaders.com) (cel: A+).

## Aktualizacja strony

```bash
cd /opt/whiteitlab
git pull
docker compose build --pull          # --pull = świeże obrazy bazowe z poprawkami bezpieczeństwa
docker compose up -d                 # podmiana kontenera (kilka sekund przerwy)
docker image prune -f
```

## Rollback

Przed aktualizacją otaguj działający obraz:

```bash
docker tag whiteitlab/web:latest whiteitlab/web:prev
# … aktualizacja się nie udała:
docker tag whiteitlab/web:prev whiteitlab/web:latest
docker compose up -d --no-build
```

Albo po prostu `git checkout <poprzedni-commit> && docker compose up -d --build`.

## Diagnostyka

| Objaw | Sprawdź |
|---|---|
| 502 Bad Gateway | `docker compose ps` — czy kontener działa i jest `healthy`; `docker compose logs web` |
| Kontener restartuje się w kółko | `docker compose logs web` — zwykle `Missing required env` albo brak/zły plik sekretu (`EACCES` → zły właściciel pliku, patrz krok 2) |
| Formularz: „Coś poszło nie tak” | logi: `mail send failed` + kod błędu SMTP |
| Formularz: 403 | `ALLOWED_ORIGINS` nie zawiera adresu, pod którym otwarta jest strona |
| Formularz: 429 | działa rate-limit (nginx lub aplikacja) — odczekaj 15 min |
| Maile w spamie | SPF/DKIM/DMARC domeny z `MAIL_FROM` |

W kontenerze nie ma powłoki (distroless) — `docker exec … sh` nie zadziała celowo. Do debugowania: `docker compose logs`, `docker inspect`, `docker compose run --rm --entrypoint /nodejs/bin/node web -e "…"`.
