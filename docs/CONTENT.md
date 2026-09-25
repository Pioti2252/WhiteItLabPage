# Edycja treści

Wszystkie teksty są w dwóch plikach:

- `site/content/pl.json` — wersja polska (`/`)
- `site/content/en.json` — wersja angielska (`/en/`)

Oba pliki mają **identyczną strukturę**. Zmieniając coś w jednym, zmień to samo w drugim.
Po edycji: `npm run dev` → sprawdź http://localhost:8080 i http://localhost:8080/en/.

> Pola z sufiksem `_html` (np. `hero.title_html`) są wstawiane jako HTML — możesz użyć `<em>` (podkreślenie akcentem) i `&nbsp;` (twarda spacja, żeby „3 w nocy” się nie łamało). Wszystkie pozostałe pola są zwykłym tekstem (znaki `<`, `&` są bezpieczne).

## Mapa pliku

| Klucz | Gdzie na stronie |
|---|---|
| `meta.title`, `meta.description` | tytuł karty i opis w Google |
| `hero.*` | pierwszy ekran: nagłówek, lead, przyciski, tabela „Model / Lokalizacja / Odpowiedź / Status” |
| `services.items[]` | lista usług (rozwijane wiersze). Każda: `name` (etykieta), `title`, `text`, `tags[]` |
| `protocol.steps[]` | 4 kroki „Jak pracuję” — `[nagłówek, opis]` |
| `protocol.principles[]` | „Zasady laboratorium” |
| `work.projects[]` | case study (patrz niżej) |
| `work.slot` | wolne miejsce na kolejny projekt |
| `contact.*` | sekcja kontaktu i wszystkie etykiety/komunikaty formularza |
| `footer.*`, `status.*` | stopka i strony „wysłano / błąd / 404” |

Ustawienia wspólne dla obu języków: `site/config.json` — domena, link do GitHuba, lista narzędzi w przewijanym pasku.

## Podmiana przykładowego projektu (WL-01) — ważne

Obecny WL-01 jest **wymyślonym przykładem** (ADR-017). Zastąp go prawdziwym projektem:

```jsonc
{
  "id": "WL-01",
  "client": "Branża / typ klienta (bez nazwy, jeśli nie masz zgody)",
  "title": "Jednozdaniowy efekt, nie nazwa technologii",
  "summary": "2–3 zdania: jak było przed.",
  "sections": [
    ["Problem", "…"],
    ["Rozwiązanie", "…"],
    ["Efekt", "…"]
  ],
  "metrics": [                 // tylko prawdziwe, sprawdzalne liczby — albo usuń całą tablicę: []
    ["40 → 6 min", "czas wdrożenia"]
  ],
  "stack": ["Docker", "…"],
  "pipeline": ["push", "test", "build", "scan", "deploy", "verify"]   // etapy animowanego diagramu (4–6 najlepiej)
}
```

Jeśli nie masz twardych liczb, ustaw `"metrics": []` — blok z liczbami po prostu się nie wyświetli. Lepiej brak liczb niż liczby, których nie obronisz w rozmowie z klientem.

## Wypełnienie slotu WL-02

Gdy drugi projekt będzie gotowy: dopisz drugi obiekt do `work.projects[]` (ten sam format co WL-01, `"id": "WL-02"`) w **obu** plikach JSON. Slot „zarezerwowany” możesz wtedy zmienić na `WL-03` albo usunąć z `site/page.mjs` (blok `<article class="slot">`).

## Zmiana linku do GitHuba

`site/config.json` → `github` i `githubHandle`. Dodatkowo etykieta `org.opencontainers.image.source` w `Dockerfile` i ostatnia linia `docs/SECURITY.md`.

## Zmiana domeny

Założono `whiteitlab.pl` (ADR-016). Aby zmienić, podmień we wszystkich miejscach:

```bash
grep -rl "whiteitlab.pl" --exclude-dir=node_modules --exclude-dir=dist .
```

Kluczowe pliki: `site/config.json` (`siteUrl`), `.env` (`ALLOWED_ORIGINS`), `server/config.mjs` (wartość domyślna), `deploy/nginx/*.conf`.

## Dodanie kolejnego języka

1. Skopiuj `site/content/en.json` → np. `de.json`, ustaw `"lang": "de"`, `"path": "/de/"`, przetłumacz.
2. W `site/build.mjs` dodaj go do pętli generującej strony i do `sitemap.xml`.
3. W `site/page.mjs` rozbuduj przełącznik języka i `hreflang` (obecnie zakładają dokładnie dwa języki).
