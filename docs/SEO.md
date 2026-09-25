# SEO

Stan i instrukcja utrzymania. Decyzje: ADR-019 – ADR-024 w [DECISIONS.md](DECISIONS.md).

## Wynik (Lighthouse, mobile, lokalnie)

| | Performance | Accessibility | Best Practices | SEO | LCP | CLS |
|---|---|---|---|---|---|---|
| PL — przed | 94 | 100 | 100 | 100 | 2.7 s | 0 |
| **PL — po** | **97** | 100 | 100 | 100 | **2.3 s** | 0.003 |
| EN — przed | 99 | 100 | 100 | 100 | 2.1 s | 0 |
| **EN — po** | **99** | 100 | 100 | 100 | **1.8 s** | 0 |

Lighthouse „SEO 100” oznacza tylko, że nie ma błędów technicznych. O pozycji w Google decydują treść, linki i zaufanie — patrz [Co dalej](#co-dalej-największy-wpływ-na-pozycje).

## Co jest zaimplementowane

### Na każdej stronie
- `<title>` ≤ 60 znaków i `meta description` 70–160 znaków, z głównymi frazami (DevOps, CI/CD, Docker, backend) — pilnują tego testy.
- `canonical`, `hreflang` pl/en + `x-default`, `<html lang>`.
- `meta robots`: `index, follow, max-image-preview:large, max-snippet:-1` (pozwala Google pokazać duży obrazek i pełny fragment).
- Open Graph + Twitter Card z obrazkiem 1200×630 dla każdego języka (`/og/og-pl.png`, `/og/og-en.png`) — ładny podgląd na LinkedIn, Facebooku, X, Slacku, Messengerze.
- Ikony: SVG (nowoczesne przeglądarki), PNG 192/512 (Google w wynikach wyszukiwania, Android), `apple-touch-icon` 180, `site.webmanifest`.
- Dokładnie jeden `<h1>`, poprawna hierarchia nagłówków, treść w HTML (bez renderowania w JS).

### Dane strukturalne (JSON-LD, schema.org)
Jeden `@graph` na stronę, węzły powiązane przez `@id`:

| Typ | Co opisuje |
|---|---|
| `ProfessionalService` | firma: nazwa, logo, opis, GitHub (`sameAs`), obszar działania (Polska), języki, kompetencje, **katalog usług** (5 × `Service`) |
| `WebSite` | serwis, język, wydawca |
| `WebPage` | konkretna wersja językowa, obrazek główny |
| `FAQPage` | 6 pytań i odpowiedzi — **te same, które widać na stronie** (test to sprawdza) |

Świadomie **nie** oznaczono: przykładowego case study (jest fikcyjny — ADR-017), adresu i telefonu (nie podano), opinii/gwiazdek (brak prawdziwych recenzji — ich zmyślenie grozi karą ręczną od Google), imienia i nazwiska właściciela (patrz niżej).

### Crawling
- `robots.txt`: wszystko dozwolone poza `/api/`; wskazuje sitemapę.
- `sitemap.xml`: obie wersje językowe z `hreflang`, `lastmod` (data buildu) i obrazkiem OG.
- Strony `/thanks/`, `/error/`, 404: `noindex` i poza sitemapą. **Nie** są blokowane w robots.txt — inaczej Google nie zobaczyłby `noindex`.
- 404 zwraca prawdziwy status 404 (nie „soft 404”), `/en` → 301 → `/en/`, `http`/`www` → 301 → `https://whiteitlab.pl` (nginx).

### Szybkość (Core Web Vitals)
- Kompresja brotli/gzip w aplikacji, liczona raz przy starcie (HTML 32 KB → 7 KB, CSS 32 KB → 6 KB).
- Hashowane nazwy CSS/JS/fontów → cache `immutable` na rok; HTML 5 min.
- Font nagłówka jest `preload`-owany; `font-display: swap`.
- Nagłówek hero odsłania się od razu, bez czekania na fonty (LCP −0.4 s).
- Zero zewnętrznych requestów (fonty lokalne, brak skryptów firm trzecich).

## Po uruchomieniu produkcji — checklista

1. **Google Search Console** — https://search.google.com/search-console
   - Dodaj usługę typu **Domena** `whiteitlab.pl`, zweryfikuj rekordem TXT w DNS (obejmuje http/https/www naraz, nie wymaga zmian w kodzie).
   - *Mapy witryn* → dodaj `https://whiteitlab.pl/sitemap.xml`.
   - *Sprawdzanie adresu URL* → `https://whiteitlab.pl/` i `/en/` → „Poproś o zindeksowanie”.
2. **Bing Webmaster Tools** — https://www.bing.com/webmasters → „Import z Google Search Console” (1 klik). Bing zasila też ChatGPT Search i Copilota.
3. **Test wyników z elementami rozszerzonymi** — https://search.google.com/test/rich-results → wklej adres; powinien wykryć FAQ i organizację bez błędów.
4. **Podgląd udostępnień** — https://www.linkedin.com/post-inspector/ (LinkedIn cache'uje obrazki — ten inspektor wymusza odświeżenie).
5. **PageSpeed Insights** — https://pagespeed.web.dev na produkcyjnym adresie (realne wyniki z TLS i nginx).

## Co dalej (największy wpływ na pozycje)

Technicznie strona jest kompletna. Dalszy wzrost zależy od rzeczy, których nie da się „zakodować”:

1. **Prawdziwe case studies.** Każdy opisany projekt to osobna fraza, pod którą można się wyświetlać („migracja na Kubernetes”, „CI/CD dla sklepu”). Najlepiej jako osobne podstrony `/projekty/<nazwa>/` — szablon można rozbudować, gdy będzie pierwszy prawdziwy projekt.
2. **Kim jesteś (E-E-A-T).** Google premiuje strony, za którymi stoi konkretna, weryfikowalna osoba. Rozważ dodanie imienia i nazwiska, zdjęcia i krótkiego bio (+ `Person` w JSON-LD z linkiem do LinkedIn). Nie dodałem tego bez Twojej zgody — to Twoje dane osobowe.
3. **Linki przychodzące.** Najłatwiejsze i wartościowe:
   - profil GitHub → pole *Website* = `https://whiteitlab.pl`; README repozytoriów → link do strony,
   - LinkedIn (profil + ewentualnie strona firmy),
   - katalogi firm IT (np. Clutch, GoodFirms), platformy freelance, lokalne katalogi firm,
   - artykuły gościnne / odpowiedzi na forach technicznych z linkiem w profilu.
4. **Blog / notatki techniczne.** 1–2 konkretne teksty miesięcznie („Jak zabezpieczyć kontener Docker — checklista”, „GitHub Actions: deploy na VPS bez przestojów”). To najskuteczniejszy sposób na ruch z długiego ogona. Wymaga dodania sekcji bloga do generatora.
5. **Google Business Profile** — tylko jeśli masz adres, pod którym obsługujesz klientów albo działasz jako firma usługowa z obszarem obsługi. Wtedy dopisz `address`/`telephone` do JSON-LD (muszą być identyczne jak w profilu).

## Frazy docelowe

Strona jest napisana pod te zapytania (sprawdzaj ich pozycje w Search Console → *Skuteczność*):

| PL | EN |
|---|---|
| DevOps freelancer / usługi DevOps | DevOps consultant Poland |
| wdrożenie CI/CD, GitHub Actions wdrożenie | CI/CD setup, GitHub Actions pipeline |
| konteneryzacja aplikacji, Docker konsultant | containerize application, Docker consultant |
| Kubernetes wdrożenie | Kubernetes setup |
| infrastruktura jako kod, Terraform Ansible | infrastructure as code consultant |
| administracja serwerem VPS, monitoring serwerów | VPS server management, server monitoring |
| programista backend Node.js / Python | backend developer Node.js |

Zmieniając teksty w `site/content/*.json`, zachowaj te frazy w naturalnym brzmieniu — nie upychaj ich na siłę (Google za to karze).

## Świadome ograniczenia

- **FAQ w wynikach Google:** od 2023 r. Google pokazuje rozwijane FAQ głównie dla serwisów rządowych i medycznych. Znacznik `FAQPage` nadal pomaga wyszukiwarkom i asystentom AI zrozumieć treść, ale nie gwarantuje rozszerzonego wyniku.
- **Render-blocking CSS** (Lighthouse: ~0.5–1.2 s w symulacji wolnego 4G): wstawienie krytycznego CSS inline wymagałoby poluzowania CSP (`style-src 'unsafe-inline'` albo hashe). Przy 32 KB CSS (6 KB po kompresji brotli) zysk jest mniejszy niż koszt dla bezpieczeństwa — ADR-022.
- **Analityka:** brak. Search Console wystarczy na start. Jeśli będzie potrzebna, rekomendacja: samodzielnie hostowane Umami/Plausible (bez ciasteczek → bez banera zgody), z wpisem w CSP i nowym ADR.

## Utrzymanie

| Zmiana | Co zrobić |
|---|---|
| Tekst na stronie | edytuj `site/content/*.json` (oba języki), `npm run dev`, sprawdź |
| Nagłówek hero lub kolory | `npm run images` — odtwarza obrazki OG i ikony w `site/static/`, commituj PNG-i |
| Nowe pytanie FAQ | dopisz do `faq.items` w obu plikach — JSON-LD aktualizuje się sam |
| Domena | [CONTENT.md → Zmiana domeny](CONTENT.md#zmiana-domeny), potem `npm run images` (domena jest na obrazku OG) |
| Po każdym wdrożeniu | Search Console sam wykryje nową `lastmod` w sitemapie |
