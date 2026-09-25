# Architektura

## Widok z lotu ptaka

```
                 Internet
                    │  :80 / :443
┌───────────────────▼──────────────────────────── VPS ───────────────┐
│  nginx (host)                                                       │
│   • TLS (Let's Encrypt), HSTS, gzip                                 │
│   • http→https, www→apex                                            │
│   • limit_req: /api/contact 6/min/IP, reszta 20/s/IP                │
│   • X-Real-IP → upstream                                            │
│                    │ http://127.0.0.1:8080                          │
│  ┌─────────────────▼──────── kontener whiteitlab-web ────────────┐  │
│  │  distroless nodejs22 · UID 65532 · read-only · cap_drop ALL   │  │
│  │                                                                │  │
│  │  server/server.mjs                                             │  │
│  │   ├─ GET/HEAD *        → dist/ z pamięci (whitelist ścieżek)   │  │
│  │   ├─ GET /healthz      → "ok"                                  │  │
│  │   └─ POST /api/contact → validate → rate-limit → nodemailer ───┼──┼──► SMTP (587 STARTTLS)
│  │                                                                │  │        │
│  │  /run/secrets/smtp_pass (Docker secret, read-only)             │  │        ▼
│  └────────────────────────────────────────────────────────────────┘  │   skrzynka MAIL_TO
└─────────────────────────────────────────────────────────────────────┘
```

## Build

```
site/content/pl.json ─┐
site/content/en.json ─┼─► site/build.mjs ──► dist/
site/config.json ─────┤     (page.mjs)         ├─ index.html, en/index.html
site/assets/* ────────┤                        ├─ thanks/, error/, 404.html (×2 języki)
site/static/* ────────┘                        ├─ og/og-{pl,en}.png, icon-*.png, site.webmanifest
node_modules/@fontsource-variable/* ─────────► ├─ assets/style.<hash>.css, main.<hash>.js, theme.<hash>.js
                                               ├─ assets/fonts/*.<hash>.woff2
                                               └─ favicon.svg, robots.txt, sitemap.xml

scripts/images.mjs (ręcznie, headless Chrome) ──► site/static/og/*.png, site/static/icon-*.png
```

W Dockerfile build odbywa się w osobnym etapie; do obrazu trafia tylko `dist/`, `server/` i produkcyjne `node_modules` (sam nodemailer).

## Przepływ formularza

```
przeglądarka                         nginx                     aplikacja
    │  POST /api/contact (JSON)         │                           │
    ├──────────────────────────────────►│ limit_req, body ≤ 32k     │
    │                                   ├──────────────────────────►│
    │                                   │                           ├─ Content-Type json | urlencoded?  → 415
    │                                   │                           ├─ Origin na liście?                → 403
    │                                   │                           ├─ limit IP (5/15 min), globalny    → 429
    │                                   │                           ├─ body ≤ 16 KB                     → 413
    │                                   │                           ├─ honeypot / za szybko / stary     → 200 (udawany sukces)
    │                                   │                           ├─ walidacja pól                    → 422 + lista pól
    │                                   │                           ├─ SMTP send                        → 502 przy błędzie
    │◄──────────────────────────────────┴───────────────────────────┤ 200 {"ok":true}
```

**Bez JavaScriptu** formularz wysyła się zwykłym POST-em (`application/x-www-form-urlencoded`), a serwer odpowiada `303` na `/thanks/` albo `/error/` (lub `/en/thanks/`, `/en/error/`).

## Serwowanie plików

- Przy starcie serwer wczytuje całe `dist/` do `Map<ścieżka, {body, etag, type, cache}>`.
- Żądanie jest obsługiwane tylko wtedy, gdy ścieżka jest kluczem mapy (albo `ścieżka/index.html`). Wszystko inne → 404. Nie ma żadnego `path.join(root, userInput)`.
- Pliki tekstowe są kompresowane przy starcie (brotli q11 + gzip 9); wariant wybierany wg `Accept-Encoding`, `Vary: Accept-Encoding`, osobny `ETag` na kodowanie (ADR-022).
- `ETag` + `If-None-Match` → 304.
- Cache:
  - `assets/*.<hash>.{css,js,woff2}` → `max-age=31536000, immutable`
  - PNG (ikony, OG) → 7 dni
  - HTML i reszta → 5 min + `must-revalidate`

## Konfiguracja (zmienne środowiskowe)

| Zmienna | Domyślnie | Opis |
|---|---|---|
| `PORT` / `HOST` | `8080` / `0.0.0.0` | nasłuch w kontenerze |
| `TRUST_PROXY` | `0` (w obrazie `1`) | ufaj `X-Real-IP` od nginx |
| `ALLOWED_ORIGINS` | `https://whiteitlab.pl,https://www.whiteitlab.pl` | dozwolone `Origin` dla POST |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_SECURE` | – / `587` / `false` | serwer SMTP; `false` = wymuszony STARTTLS |
| `SMTP_USER` / `SMTP_PASS` / `SMTP_PASS_FILE` | – | dane logowania; `*_FILE` ma pierwszeństwo |
| `MAIL_FROM` / `MAIL_TO` | – | nadawca (Twoja domena) / odbiorca |
| `MAIL_DRY_RUN` | `0` | `1` = nie wysyłaj, tylko loguj metadane |
| `RATE_LIMIT_PER_IP` / `RATE_LIMIT_WINDOW_MIN` | `5` / `15` | limit na IP |
| `RATE_LIMIT_GLOBAL_PER_HOUR` | `60` | limit wszystkich wiadomości |
| `MAX_BODY_BYTES` | `16384` | maks. rozmiar body |

Brak `SMTP_HOST`/`MAIL_FROM`/`MAIL_TO` (przy `MAIL_DRY_RUN=0`) → kontener **nie startuje** (fail fast), zamiast psuć się przy pierwszym zgłoszeniu.

## Logi

JSON, jedna linia na zdarzenie, na stdout:

```json
{"t":"2026-09-25T12:00:00.000Z","level":"info","msg":"contact sent","topic":"cicd","lang":"pl"}
```

Podgląd: `docker compose logs -f web`. Szczegóły o danych osobowych w logach: ADR-018.
