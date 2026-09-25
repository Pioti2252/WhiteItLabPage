# Dziennik decyzji (ADR)

Każda decyzja projektowa jest zapisana w formacie: **kontekst → decyzja → odrzucone alternatywy → konsekwencje**.
Nową decyzję dopisuj na końcu z kolejnym numerem; starych nie usuwaj — oznacz jako *Zastąpiona przez ADR-XXX*.

Status: `Przyjęta` · `Zastąpiona` · `Do potwierdzenia` (wymaga decyzji właściciela)

| # | Decyzja | Status |
|---|---|---|
| [001](#adr-001) | Formularz obsługuje własny backend + SMTP | Przyjęta (wybór właściciela) |
| [002](#adr-002) | Node.js bez frameworka, jedyna zależność: nodemailer | Przyjęta |
| [003](#adr-003) | Jeden kontener serwuje stronę i API | Przyjęta |
| [004](#adr-004) | Strona generowana statycznie z plików JSON | Przyjęta |
| [005](#adr-005) | Dwa języki jako osobne adresy `/` i `/en/` | Przyjęta (wybór właściciela) |
| [006](#adr-006) | Obraz runtime: distroless `nodejs22` `:nonroot` | Przyjęta |
| [007](#adr-007) | Hardening kontenera w compose | Przyjęta |
| [008](#adr-008) | nginx na hoście jako TLS terminator i reverse proxy | Przyjęta |
| [009](#adr-009) | Nagłówki bezpieczeństwa: CSP w aplikacji, HSTS w nginx | Przyjęta |
| [010](#adr-010) | Antyspam bez CAPTCHA: honeypot + pułapka czasowa + rate-limit | Przyjęta |
| [011](#adr-011) | Brak OCSP stapling | Przyjęta |
| [012](#adr-012) | Hasło SMTP jako Docker secret, nie zmienna środowiskowa | Przyjęta |
| [013](#adr-013) | Fonty hostowane lokalnie, zero zewnętrznych requestów | Przyjęta |
| [014](#adr-014) | Kierunek wizualny „karta specyfikacji z laboratorium” | Przyjęta |
| [015](#adr-015) | Animacje jako progressive enhancement | Przyjęta |
| [016](#adr-016) | Domena `whiteitlab.pl` | Do potwierdzenia |
| [017](#adr-017) | Projekt WL-01 to przykład do podmiany, WL-02 to pusty slot | Do potwierdzenia |
| [018](#adr-018) | Logi bez danych osobowych | Przyjęta |
| [019](#adr-019) | Dane strukturalne JSON-LD w jednym `@graph` | Przyjęta |
| [020](#adr-020) | Sekcja FAQ jako treść pod długie frazy | Przyjęta |
| [021](#adr-021) | Obrazki OG i ikony generowane skryptem i commitowane | Przyjęta |
| [022](#adr-022) | Kompresja brotli/gzip w aplikacji, bez inline CSS | Przyjęta |
| [023](#adr-023) | Hashowane nazwy fontów, hero bez czekania na fonty | Przyjęta |
| [024](#adr-024) | Bez danych osobowych właściciela i bez analityki (na razie) | Do potwierdzenia |

---

## ADR-001
**Formularz obsługuje własny backend + SMTP** · *Przyjęta (wybór właściciela, 2026-09-25)*

**Kontekst.** Strona potrzebuje formularza zgłoszeniowego. Wiadomość musi trafić do właściciela.
**Decyzja.** Mały endpoint `POST /api/contact` w tym samym kontenerze wysyła e-mail przez SMTP właściciela.
**Odrzucone.**
- *Formspree / Getform itp.*: dane klientów przechodzą przez firmę trzecią (RODO, umowa powierzenia), limity darmowych planów, zależność od zewnętrznej usługi.
- *Zapis do pliku/SQLite*: wymaga zapisywalnego wolumenu (kłóci się z `read_only`) i osobnego sposobu przeglądania zgłoszeń.
- *`mailto:`*: zależy od klienta pocztowego odwiedzającego, brak walidacji, adres wystawiony spamerom.

**Konsekwencje.** Potrzebne konto SMTP i poprawne SPF/DKIM dla domeny nadawcy. Jeśli SMTP nie działa, formularz zwraca błąd 502 i nic nie ginie po cichu (użytkownik widzi komunikat z odesłaniem do GitHuba).

## ADR-002
**Node.js bez frameworka, jedyna zależność: nodemailer** · *Przyjęta*

**Kontekst.** Backend robi trzy rzeczy: serwuje pliki, przyjmuje jeden formularz, wysyła e-mail.
**Decyzja.** Wbudowany `node:http` + `nodemailer` (sam nie ma żadnych zależności).
**Odrzucone.**
- *Express/Fastify*: dziesiątki pakietów w drzewie zależności tylko po to, żeby obsłużyć jedną ścieżkę POST. Każdy pakiet to potencjalna podatność.
- *Go*: mniejszy obraz (~10 MB zamiast ~130 MB) i statyczna binarka, ale nie dało się go przetestować w środowisku, w którym powstał projekt. Dobry kandydat na przepisanie, jeśli rozmiar obrazu zacznie mieć znaczenie.
- *PHP / Python*: brak przewagi przy tej skali, a większy obraz runtime.

**Konsekwencje.** Obsługa HTTP jest napisana ręcznie (limity body, timeouty, nagłówki) — za to jest krótka (~200 linii) i w całości do przeczytania. `npm ls --omit=dev` pokazuje jedną paczkę.

## ADR-003
**Jeden kontener serwuje stronę i API** · *Przyjęta*

**Kontekst.** Strona jest statyczna; API ma jeden endpoint.
**Decyzja.** Proces Node serwuje `dist/` z pamięci i obsługuje `/api/contact`. nginx na hoście ma jeden upstream.
**Odrzucone.** *nginx serwuje statykę z katalogu na hoście + osobny kontener API*: dwa artefakty do wersjonowania i wdrażania, treść strony i kod API mogłyby się rozjechać między wersjami.
**Konsekwencje.** Jeden obraz = jedna wersja całej strony; rollback to zmiana tagu obrazu. Pliki ładowane są do pamięci przy starcie (strona waży <1 MB), więc serwer odpowiada tylko dla ścieżek, które istnieją — *path traversal* jest niemożliwy z definicji, bo nigdy nie składa się ścieżki do systemu plików z danych od użytkownika.

## ADR-004
**Strona generowana statycznie z plików JSON** · *Przyjęta*

**Kontekst.** Treść będzie się zmieniać (projekty, teksty), ale rzadko. Potrzebne dwie wersje językowe.
**Decyzja.** Teksty w `site/content/{pl,en}.json`, szablony w `site/page.mjs` (zwykłe template literals), `build.mjs` generuje `dist/`. CSS/JS dostają hash w nazwie.
**Odrzucone.**
- *Astro/Next/Hugo*: dodatkowy łańcuch narzędzi i zależności dla jednej strony.
- *Renderowanie w przeglądarce (SPA)*: gorsze SEO, strona pusta bez JS, cięższa.
- *Ręcznie pisany HTML ×2 języki*: każda zmiana układu w dwóch miejscach.

**Konsekwencje.** Edycja treści nie wymaga dotykania HTML-a. Wszystkie wartości z JSON są escapowane; pola z sufiksem `_html` są wstawiane bez escapowania — to świadomy wyjątek (np. `<em>` w nagłówku) i dotyczy tylko treści pisanej przez właściciela. Hashowane nazwy pozwalają ustawić `Cache-Control: immutable` na rok.

## ADR-005
**Dwa języki jako osobne adresy `/` i `/en/`** · *Przyjęta (wybór właściciela: PL + EN)*

**Decyzja.** Polski pod `/`, angielski pod `/en/`, znaczniki `hreflang` i `x-default`, przełącznik PL/EN w nagłówku.
**Odrzucone.** *Przełączanie języka w JS na jednej stronie*: Google indeksuje tylko jedną wersję, a bez JS działa tylko jeden język.
**Konsekwencje.** Każdy tekst musi istnieć w obu plikach JSON — brakujący klucz pojawi się na stronie jako „undefined”, więc po edycji zawsze przejrzyj obie wersje (`npm run dev`). Budżety w EN podane w EUR.

## ADR-006
**Obraz runtime: distroless `nodejs22-debian12:nonroot`** · *Przyjęta*

**Kontekst.** Wymóg: bezpieczny kontener, bez roota.
**Decyzja.** Build na `node:22-alpine`, runtime na `gcr.io/distroless/nodejs22-debian12:nonroot` (UID/GID 65532).
**Odrzucone.**
- *`node:22-alpine` z `USER node`*: nadal zawiera shell, `apk`, `npm` — narzędzia, z których atakujący skorzysta po włamaniu.
- *`scratch`*: Node potrzebuje glibc/certyfikatów CA, które distroless już ma.
- *Node 24*: nowszy, ale obraz distroless dla Node 22 LTS ma pewne, długie wsparcie (do 04.2027). Zmiana wersji to jedna linijka (`ARG`).

**Konsekwencje.** W kontenerze nie ma shella — `docker exec -it … sh` nie zadziała (to cecha, nie błąd). Healthcheck jest skryptem Node (`server/healthcheck.mjs`), bo nie ma `curl`. Pliki aplikacji należą do roota z prawami odczytu, więc proces nie może zmodyfikować własnego kodu.

## ADR-007
**Hardening kontenera w compose** · *Przyjęta*

**Decyzja.** `read_only: true`, `cap_drop: [ALL]`, `no-new-privileges`, `user: 65532`, `init: true`, limity pamięci/CPU/PID, port wystawiony tylko na `127.0.0.1`, rotacja logów.
**Uzasadnienie.** Aplikacja nie zapisuje nic na dysk, nie potrzebuje żadnych capabilities (port 8080 > 1024), nie powinna podnosić uprawnień. `127.0.0.1:8080` gwarantuje, że jedyna droga do aplikacji z internetu prowadzi przez nginx — nawet jeśli firewall zostanie źle skonfigurowany (Docker omija reguły UFW przy publikowaniu portów na `0.0.0.0`!).
**Konsekwencje.** `tmpfs /tmp` (8 MB, `noexec`) na wypadek, gdyby jakaś biblioteka chciała plik tymczasowy.

## ADR-008
**nginx na hoście jako TLS terminator i reverse proxy** · *Przyjęta (wymaganie właściciela)*

**Decyzja.** nginx zainstalowany z pakietu systemowego, konfiguracja w `deploy/nginx/`. Certyfikat Let's Encrypt przez `certbot --webroot`. Przekierowania: `http → https`, `www → apex`.
**Szczegóły.**
- Składnia `listen 443 ssl http2` zamiast nowszego `http2 on;`, bo Debian 12 ma nginx 1.22 (nowa dyrektywa od 1.25.1). Na nowszym nginx pojawi się tylko ostrzeżenie o przestarzałej składni.
- `limit_req` na `/api/contact` (6/min, burst 3) i ogólny (20/s) — pierwsza linia obrony, zanim ruch dotrze do Node.
- `client_max_body_size 32k` — formularz nigdy nie potrzebuje więcej.
- `/healthz` zablokowany z zewnątrz.
- Kompresja gzip w nginx, nie w aplikacji (jedno miejsce, bliżej klienta).
- Osobny plik `whiteitlab-bootstrap.conf` na pierwsze uruchomienie — pełny config odwołuje się do certyfikatu, którego jeszcze nie ma, i nginx by nie wystartował.

**Odrzucone.** *Traefik/Caddy w kontenerze*: właściciel ma już nginx na VPS i chce go używać; dodatkowy proxy to dodatkowa warstwa.

## ADR-009
**Nagłówki bezpieczeństwa: CSP w aplikacji, HSTS w nginx** · *Przyjęta*

**Decyzja.** Aplikacja wysyła CSP (`default-src 'self'`, zero `unsafe-inline`), `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`, `COOP/CORP`, `X-Frame-Options`. nginx dodaje tylko HSTS.
**Uzasadnienie.** CSP zależy od tego, co zawiera strona — powinien żyć razem z kodem strony i być wersjonowany razem z nim. HSTS dotyczy TLS, a TLS kończy się na nginx.
**Konsekwencje.** Brak inline `<script>` i atrybutów `style=""` w HTML. Skrypt motywu (`theme.js`) jest osobnym plikiem ładowanym w `<head>`, żeby uniknąć mignięcia jasnego/ciemnego motywu.

## ADR-010
**Antyspam bez CAPTCHA: honeypot + pułapka czasowa + rate-limit** · *Przyjęta*

**Decyzja.**
1. **Honeypot** — ukryte pole `website`; jeśli wypełnione, odpowiadamy „OK” i nic nie wysyłamy (bot nie dowiaduje się, że wpadł).
2. **Pułapka czasowa** — JS zapisuje czas załadowania; wysłanie w < 3 s albo po > 24 h = spam. Bez JS pole jest puste i test jest pomijany (formularz działa bez JS).
3. **Rate-limit** — nginx (6/min/IP) + aplikacja (5 na 15 min/IP) + globalny limit 60 wiadomości/h (ochrona skrzynki przed zalaniem przy ataku z wielu IP).
4. **Sprawdzenie `Origin`** — POST z obcej domeny = 403.

**Odrzucone.** *reCAPTCHA / hCaptcha / Turnstile*: skrypty i ciasteczka firm trzecich (RODO + CSP), gorsze UX. Wrócić do tematu tylko, jeśli spam przebije powyższe zabezpieczenia.
**Konsekwencje.** Rate-limit jest w pamięci — restart kontenera go zeruje. Przy jednej instancji to akceptowalne.

## ADR-011
**Brak OCSP stapling** · *Przyjęta*

**Kontekst.** Let's Encrypt wyłączył OCSP w 2025 r.; nowe certyfikaty nie zawierają adresu OCSP (unieważnianie działa przez CRL).
**Decyzja.** `ssl_stapling` nie jest włączony — dawałby tylko ostrzeżenia w logach nginx.

## ADR-012
**Hasło SMTP jako Docker secret, nie zmienna środowiskowa** · *Przyjęta*

**Decyzja.** Hasło w pliku `secrets/smtp_pass` (właściciel 65532, `chmod 400`), montowane jako `/run/secrets/smtp_pass`; aplikacja czyta `SMTP_PASS_FILE`. Reszta konfiguracji w `.env` (`chmod 600`). Obsługiwane jest też zwykłe `SMTP_PASS` (np. do testów).
**Uzasadnienie.** Zmienne środowiskowe widać w `docker inspect`, w `/proc/*/environ` i łatwo trafiają do logów/zrzutów. Plik sekretu — nie.
**Konsekwencje.** `.dockerignore` działa jak whitelista, więc ani `.env`, ani `secrets/` nie trafią do obrazu nawet przez pomyłkę.

## ADR-013
**Fonty hostowane lokalnie, zero zewnętrznych requestów** · *Przyjęta*

**Decyzja.** Archivo (variable, oś szerokości 62–125%) i JetBrains Mono z paczek `@fontsource-variable`, kopiowane do `dist/` przy buildzie. Tylko podzbiory latin + latin-ext (polskie znaki).
**Odrzucone.** *Google Fonts z CDN*: wysyła IP odwiedzającego do Google (w UE uznane za naruszenie RODO — wyrok LG München, 2022), wymaga luzowania CSP.
**Konsekwencje.** Strona nie wykonuje żadnego requestu poza własną domenę. Łączna waga fontów ≈ 230 KB (przeglądarka pobiera tylko podzbiory, których używa strona), `font-display: swap`.

## ADR-014
**Kierunek wizualny „karta specyfikacji z laboratorium”** · *Przyjęta*

**Kontekst.** Wymaganie: strona ma nie wyglądać jak generyczny szablon „AI slop”. Nazwa *white·it·lab* sugeruje laboratorium.
**Decyzja.** Złamana biel papieru + atrament + jeden kolor sygnałowy (pomarańcz #ff4f1a), cienkie linie jak w dokumentacji technicznej, ostre narożniki, numeracja sekcji, etykiety w mono, szeroki krój (Archivo 108–125%) w nagłówkach. Szczegóły: [DESIGN.md](DESIGN.md).
**Świadomie unikane.** Gradienty fioletowo-niebieskie, glassmorphism, karty z ikonkami/emoji, zaokrąglone „bąble”, zmyślone logotypy klientów i liczniki „500+ zadowolonych klientów”, stockowe zdjęcia.

## ADR-015
**Animacje jako progressive enhancement** · *Przyjęta*

**Decyzja.** Treść jest widoczna bez JS; klasa `.js` na `<html>` włącza stany początkowe animacji. `prefers-reduced-motion` wyłącza animacje całkowicie (terminal pokazuje od razu pełny log). Rozwijanie usług używa natywnego `<details>` — działa bez JS, a animacja wysokości to czysty CSS (`interpolate-size`), z bezpiecznym fallbackiem w starszych przeglądarkach.
**Konsekwencje.** Brak bibliotek animacji (GSAP itp.) — cały JS strony ≈ 9 KB bez kompresji.

## ADR-016
**Domena `whiteitlab.pl`** · *Do potwierdzenia*

Właściciel podał nazwę „whiteitlab” bez TLD. Przyjęto `.pl`. Zmiana: [CONTENT.md → Zmiana domeny](CONTENT.md#zmiana-domeny) (4 pliki).

## ADR-017
**Projekt WL-01 to przykład do podmiany, WL-02 to pusty slot** · *Do potwierdzenia*

Właściciel poprosił o wymyślenie realistycznego przykładu. Case study „Z ręcznych wdrożeń do pipeline'u w sześć tygodni” wraz z liczbami (40 → 6 min itd.) jest **fikcyjny**. Przed publikacją należy go zastąpić prawdziwym projektem albo usunąć metryki — prezentowanie zmyślonych wyników klientom byłoby wprowadzaniem w błąd. Slot WL-02 jest oznaczony jako „zarezerwowany”.

## ADR-018
**Logi bez danych osobowych** · *Przyjęta*

**Decyzja.** Logi JSON na stdout (zbiera je Docker, rotacja 3×10 MB). Z formularza logowane są tylko metadane (temat, język, długość wiadomości) — nigdy imię, e-mail, treść ani IP.
**Uzasadnienie.** Minimalizacja danych (RODO art. 5); treść zgłoszenia i tak jest w skrzynce pocztowej. IP pozostaje w access logu nginx, który administrator kontroluje osobno.

## ADR-019
**Dane strukturalne JSON-LD w jednym `@graph`** · *Przyjęta (2026-09-25)*

**Decyzja.** Każda strona główna (PL, EN) ma jeden blok `application/ld+json` z węzłami `ProfessionalService` (z katalogiem usług), `WebSite`, `WebPage` i `FAQPage`, powiązanymi przez `@id`. Generowany z tych samych plików JSON co treść, więc markup nie rozjedzie się z tym, co widać na stronie.
**Odrzucone.** *Mikrodane w HTML*: zaśmiecają szablon i trudniej je utrzymać. *`LocalBusiness` z adresem*: brak adresu do podania. *`AggregateRating`*: brak prawdziwych opinii — zmyślone to naruszenie wytycznych Google.
**Konsekwencje.** Blok JSON-LD nie wykonuje się jako skrypt, więc CSP (`script-src 'self'`) go nie blokuje. Znak `<` jest escapowany (`<`), żeby treść nie mogła zamknąć znacznika `<script>`.

## ADR-020
**Sekcja FAQ jako treść pod długie frazy** · *Przyjęta*

**Kontekst.** Strona miała mało tekstu odpowiadającego na konkretne pytania klientów („ile kosztuje…”, „czy zdalnie…”).
**Decyzja.** 6 pytań i odpowiedzi w obu językach, sekcja `#faq` przed kontaktem, link w menu, znacznik `FAQPage`. Na razie **bez cen** — odpowiedź o koszcie opisuje proces wyceny.
**Konsekwencje.** Numeracja sekcji: FAQ = 04, Kontakt = 05. Odpowiedzi to propozycja — zweryfikuj, czy zgadzają się z Twoją praktyką (np. praca z zagranicą).

## ADR-021
**Obrazki OG i ikony generowane skryptem i commitowane** · *Przyjęta*

**Decyzja.** `npm run images` renderuje w headless Chrome obrazki 1200×630 (PL/EN) z nagłówkiem hero i ikony PNG (canvas → `--dump-dom`). Wynik trafia do `site/static/` i jest commitowany.
**Odrzucone.** *Generowanie przy każdym buildzie*: build Dockera musiałby mieć Chrome'a (+300 MB, większa powierzchnia ataku). *puppeteer/sharp*: dodatkowe zależności dla operacji wykonywanej raz na kilka miesięcy.
**Konsekwencje.** Po zmianie nagłówka hero, kolorów lub domeny trzeba ręcznie uruchomić `npm run images`.

## ADR-022
**Kompresja brotli/gzip w aplikacji, bez inline CSS** · *Przyjęta*

**Kontekst.** Lighthouse zgłaszał brak kompresji (lokalnie nie ma nginx) i render-blocking CSS.
**Decyzja.** Serwer przy starcie kompresuje pliki tekstowe (brotli q11 + gzip 9), wybiera wariant na podstawie `Accept-Encoding`, osobne ETagi dla każdego kodowania, `Vary: Accept-Encoding`. nginx widzi już skompresowaną odpowiedź i nie kompresuje jej drugi raz; jego `gzip` zostaje jako zabezpieczenie. Krytyczny CSS **nie** jest wstawiany inline.
**Uzasadnienie.** Brotli daje ~15–20% mniej niż gzip, a kompresja z maksymalną jakością nic nie kosztuje, bo robi się raz. Inline CSS wymagałby `style-src 'unsafe-inline'` albo utrzymywania hashy w CSP — przy 6 KB CSS po kompresji zysk (~kilkaset ms tylko w symulacji wolnego 4G) nie jest tego wart.
**Konsekwencje.** Uzupełnia ADR-003 i ADR-008 (tam kompresja była tylko w nginx).

## ADR-023
**Hashowane nazwy fontów, hero bez czekania na fonty** · *Przyjęta*

**Decyzja.** Build nadaje fontom nazwy z hashem (jak CSS/JS) i przepisuje odwołania w CSS → cache `immutable` na rok (wcześniej 30 dni). Animacja nagłówka startuje od razu po załadowaniu skryptu, a nie po `document.fonts.ready`. Lead i przyciski w hero pojawiają się razem z nagłówkiem, bez IntersectionObservera.
**Wynik.** LCP (mobile, symulacja): PL 2.7 → 2.3 s, EN 2.1 → 1.8 s. Pomiar w [SEO.md](SEO.md).

## ADR-024
**Bez danych osobowych właściciela i bez analityki (na razie)** · *Do potwierdzenia*

**Kontekst.** Imię i nazwisko właściciela (np. `Person` w JSON-LD, sekcja „o mnie”) wzmocniłoby sygnały E-E-A-T. Analityka pozwoliłaby mierzyć ruch.
**Decyzja.** Na razie żadne z nich: publikacja danych osobowych to decyzja właściciela, a analityka wymaga zmiany CSP i przemyślenia RODO. Na start wystarcza Google Search Console (bez kodu na stronie).
**Jeśli tak.** Dane osobowe: sekcja „o mnie” + węzeł `Person` (`founder` w `ProfessionalService`, `sameAs`: LinkedIn/GitHub). Analityka: samodzielnie hostowane Umami lub Plausible bez ciasteczek, wpis w `connect-src`/`script-src`, nowy ADR.
