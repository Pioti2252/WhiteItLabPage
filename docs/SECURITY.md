# Bezpieczeństwo

## Model zagrożeń (w skrócie)

| Zagrożenie | Co może się stać | Zabezpieczenie |
|---|---|---|
| Spam przez formularz | zalana skrzynka | honeypot, pułapka czasowa, rate-limit nginx + app, limit globalny (ADR-010) |
| Nadużycie formularza jako „bramki pocztowej” | wysyłka do dowolnych adresów | odbiorca stały (`MAIL_TO`), adres nadawcy zgłoszenia tylko w `Reply-To`, CR/LF usuwane z pól jednolinijkowych (brak header injection) |
| CSRF / wysyłka z obcych stron | spam z cudzych domen | sprawdzanie nagłówka `Origin` (403) |
| XSS | wykonanie kodu w przeglądarce odwiedzającego | brak danych użytkownika w HTML (strona statyczna), escapowanie treści przy buildzie, ścisły CSP bez `unsafe-inline` |
| Path traversal / wyciek plików | odczyt kodu lub sekretów | serwowane są wyłącznie pliki z `dist/` wczytane do pamięci; brak mapowania URL → system plików |
| DoS dużym body / wolnymi klientami (slowloris) | wyczerpanie zasobów | `client_max_body_size 32k` + limit 16 KB w app, timeouty nginx i Node (`headersTimeout`, `requestTimeout`), limity CPU/RAM/PID kontenera |
| Przejęcie procesu (RCE w zależności) | eskalacja na hosta | distroless (brak shella i narzędzi), UID 65532, `read_only`, `cap_drop: ALL`, `no-new-privileges`, jedna zależność runtime |
| Wyciek hasła SMTP | wysyłka spamu z Twojego konta | Docker secret zamiast zmiennej env, `.dockerignore` jako whitelista, `chmod 400` |
| Clickjacking | podszycie się pod stronę w ramce | `frame-ancestors 'none'` + `X-Frame-Options: DENY` |
| Przechwycenie ruchu | podsłuch / modyfikacja | TLS 1.2/1.3 (profil Mozilla intermediate), HSTS 2 lata, `requireTLS` dla SMTP |
| Wyciek danych osobowych | naruszenie RODO | brak PII w logach aplikacji (ADR-018), zero zewnętrznych skryptów/fontów/ciasteczek |

## Checklista kontenera

- [x] Multi-stage build — narzędzia buildu (npm, kompilatory) nie trafiają do obrazu
- [x] Runtime distroless: brak shella, menedżera pakietów, `curl`
- [x] `USER 65532:65532` w Dockerfile **i** `user:` w compose
- [x] Pliki aplikacji należą do roota — proces nie może ich modyfikować
- [x] `read_only: true` + mały `tmpfs /tmp` z `noexec`
- [x] `cap_drop: [ALL]`, `no-new-privileges:true`
- [x] `mem_limit`, `cpus`, `pids_limit`, `ulimits`
- [x] Port tylko na `127.0.0.1`
- [x] `HEALTHCHECK` bez dodatkowych binarek
- [x] `npm ci --ignore-scripts` — skrypty instalacyjne zależności nie są uruchamiane
- [x] `.dockerignore` jako whitelista (sekrety nie trafią do kontekstu buildu)
- [x] Graceful shutdown (SIGTERM) + `init: true`
- [ ] **Do zrobienia na produkcji:** przypięcie obrazów bazowych po digeście (niżej)
- [ ] **Opcjonalnie:** Docker w trybie rootless albo `userns-remap` na hoście

## Przypięcie obrazów po digeście

Tagi (`node:22-alpine`) są ruchome. Dla powtarzalnych buildów:

```bash
docker buildx imagetools inspect node:22-alpine | grep Digest
docker buildx imagetools inspect gcr.io/distroless/nodejs22-debian12:nonroot | grep Digest
```

i w `Dockerfile`:

```dockerfile
ARG NODE_BUILD_IMAGE=node:22-alpine@sha256:<digest>
ARG RUNTIME_IMAGE=gcr.io/distroless/nodejs22-debian12:nonroot@sha256:<digest>
```

Aktualizację digestów najlepiej zautomatyzować (Dependabot / Renovate w repozytorium na GitHubie).

## Skanowanie

```bash
# podatności w obrazie
docker run --rm -v /var/run/docker.sock:/var/run/docker.sock aquasec/trivy:latest image whiteitlab/web:latest
# zależności npm
npm audit --omit=dev
```

Warto dodać oba kroki do CI (GitHub Actions) — build nie przechodzi przy `CRITICAL`/`HIGH`.

## Nagłówki odpowiedzi

Wysyłane przez aplikację:

```
Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:;
                         font-src 'self'; connect-src 'self'; form-action 'self'; frame-ancestors 'none';
                         base-uri 'none'; object-src 'none'
X-Content-Type-Options: nosniff
Referrer-Policy: strict-origin-when-cross-origin
Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Resource-Policy: same-origin
X-Frame-Options: DENY
```

Dodawany przez nginx: `Strict-Transport-Security: max-age=63072000; includeSubDomains`.

> Jeśli dodasz na stronie zewnętrzny zasób (analityka, wideo, mapa), musisz świadomie rozszerzyć CSP w `server/server.mjs` — i zapisać to jako nowy ADR.

## Utrzymanie

- Co miesiąc (albo automatycznie): `docker compose build --pull && docker compose up -d` — świeże łatki obrazów bazowych.
- System hosta: `unattended-upgrades` na Debianie/Ubuntu.
- SSH: logowanie tylko kluczem, `PermitRootLogin no`, rozważ `fail2ban`.
- Kopia zapasowa: jedyne rzeczy do backupu to repozytorium (jest w Git), `.env`, `secrets/` i `/etc/letsencrypt`.

## Zgłaszanie podatności

Jeśli znajdziesz problem bezpieczeństwa, napisz przez formularz na stronie albo prywatnie przez GitHub (github.com/Pioti2252) — nie przez publiczne issue.
