// HTML templates. Plain template literals on purpose — no template engine,
// no runtime dependency. Every value from content/*.json goes through esc()
// unless the key ends with `_html` (trusted markup written by the site owner).

export const esc = (s) =>
  String(s)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');

const pad = (n) => String(n).padStart(2, '0');

const icon = {
  github: `<svg class="ico" viewBox="0 0 16 16" aria-hidden="true"><path fill="currentColor" d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/></svg>`,
  arrow: `<svg class="ico" viewBox="0 0 16 16" aria-hidden="true"><path d="M3 8h9M8.5 4.5 12 8l-3.5 3.5" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="square"/></svg>`,
  theme: `<svg class="ico" viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M8 2a6 6 0 0 1 0 12z" fill="currentColor"/></svg>`,
  mark: `<svg class="mark" viewBox="0 0 24 24" aria-hidden="true"><rect x="1.5" y="1.5" width="21" height="21" fill="none" stroke="currentColor" stroke-width="2"/><rect x="12" y="12" width="7" height="7" class="mark-dot"/></svg>`,
};

const logo = (t, cfg) => `
  <a class="logo" href="${t.path}" aria-label="${esc(cfg.brand)}">
    ${icon.mark}<span class="logo-word">white<b>it</b>lab</span>
  </a>`;

function layout({ t, alt, cfg, assets, path, title, description, body, noindex = false }) {
  const url = cfg.siteUrl + path;
  const altPath = path.startsWith('/en/') ? path.replace(/^\/en\//, '/') : '/en' + path;
  return `<!doctype html>
<html lang="${t.lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
${noindex ? '<meta name="robots" content="noindex">' : `<link rel="canonical" href="${url}">
<link rel="alternate" hreflang="${t.lang}" href="${url}">
<link rel="alternate" hreflang="${alt.lang}" href="${cfg.siteUrl + altPath}">
<link rel="alternate" hreflang="x-default" href="${cfg.siteUrl}/">`}
<meta property="og:type" content="website">
<meta property="og:site_name" content="${esc(cfg.brand)}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${url}">
<meta property="og:locale" content="${t.locale}">
<meta name="color-scheme" content="light dark">
<meta name="theme-color" content="#f3f1ec" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#0e0f0f" media="(prefers-color-scheme: dark)">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="preload" href="/assets/fonts/archivo-latin-wdth-normal.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="/assets/${assets.css}">
<script src="/assets/${assets.theme}"></script>
<script src="/assets/${assets.js}" defer></script>
</head>
<body>
<a class="skip" href="#main">${esc(t.nav.skip)}</a>
<header class="site-header" data-header>
  <div class="wrap header-row">
    ${logo(t, cfg)}
    <nav class="nav" aria-label="${esc(t.nav.services)}">
      <a href="${t.path}#services">${esc(t.nav.services)}</a>
      <a href="${t.path}#protocol">${esc(t.nav.protocol)}</a>
      <a href="${t.path}#work">${esc(t.nav.work)}</a>
      <a href="${t.path}#contact">${esc(t.nav.contact)}</a>
    </nav>
    <div class="header-tools">
      <div class="lang" role="group" aria-label="${esc(t.nav.langLabel)}">
        <a href="${t.lang === 'pl' ? path : altPath}" hreflang="pl" lang="pl" ${t.lang === 'pl' ? 'aria-current="true"' : ''}>PL</a>
        <a href="${t.lang === 'en' ? path : altPath}" hreflang="en" lang="en" ${t.lang === 'en' ? 'aria-current="true"' : ''}>EN</a>
      </div>
      <button class="icon-btn" type="button" data-theme-toggle aria-label="${esc(t.nav.theme)}" title="${esc(t.nav.theme)}">${icon.theme}</button>
    </div>
  </div>
</header>
<main id="main">
${body}
</main>
<footer class="site-footer">
  <div class="wrap">
    <p class="footer-word" aria-hidden="true">white<b>it</b>lab</p>
    <div class="footer-row">
      <p class="mono muted">© ${new Date().getFullYear()} ${esc(cfg.brand)}</p>
      <p class="footer-note">${esc(t.footer.note)}</p>
      <p class="footer-links">
        <a href="${cfg.github}" rel="me noopener" target="_blank">${icon.github} GitHub</a>
        <a href="#main">${esc(t.footer.top)} ↑</a>
      </p>
    </div>
  </div>
</footer>
</body>
</html>
`;
}

const terminal = (t) => `
  <figure class="term" data-terminal aria-label="${esc(t.hero.terminalTitle)}">
    <figcaption class="term-bar"><span class="term-dots"><i></i><i></i><i></i></span><span>${esc(t.hero.terminalTitle)}</span><span class="term-live">live</span></figcaption>
    <ol class="term-log">
      <li><span class="p">$</span> git push origin main</li>
      <li class="dim">→ pipeline #482 started</li>
      <li><span class="ok">✓</span> lint &amp; test<span class="r">12.4s</span></li>
      <li><span class="ok">✓</span> build image<span class="r">41.0s</span></li>
      <li><span class="ok">✓</span> trivy scan<span class="r">0 critical</span></li>
      <li><span class="ok">✓</span> push ghcr.io<span class="r">sha256:9f2c…</span></li>
      <li><span class="ok">✓</span> deploy (rolling)<span class="r">3/3 healthy</span></li>
      <li><span class="ok">✓</span> smoke tests<span class="r">passed</span></li>
      <li class="final"><span class="acc">●</span> production @ v2.14.0 — 0 downtime</li>
    </ol>
  </figure>`;

function home({ t, alt, cfg, assets }) {
  const f = t.contact.form;
  const opt = (obj) => Object.entries(obj).map(([v, l]) => `<option value="${v}">${esc(l)}</option>`).join('');

  const services = t.services.items.map((s, i) => `
    <details class="svc" data-reveal ${i === 0 ? 'open' : ''}>
      <summary>
        <span class="svc-num mono">${pad(i + 1)}</span>
        <span class="svc-name mono">${esc(s.name)}</span>
        <span class="svc-title">${esc(s.title)}</span>
        <span class="svc-toggle" aria-hidden="true"></span>
      </summary>
      <div class="svc-body">
        <p>${esc(s.text)}</p>
        <ul class="tags">${s.tags.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>
      </div>
    </details>`).join('');

  const steps = t.protocol.steps.map(([h, p], i) => `
    <li class="step" data-reveal>
      <span class="step-num mono">${pad(i + 1)}</span>
      <h3>${esc(h)}</h3>
      <p>${esc(p)}</p>
    </li>`).join('');

  const projects = t.work.projects.map((p) => `
    <article class="case" data-reveal>
      <header class="case-head">
        <span class="mono case-id">${esc(p.id)}</span>
        <span class="mono muted">${esc(p.client)}</span>
        <span class="chip">${esc(t.work.caseLabel)}</span>
      </header>
      <h3 class="case-title">${esc(p.title)}</h3>
      <p class="case-summary">${esc(p.summary)}</p>
      <ol class="pipe" aria-hidden="true">${p.pipeline.map((s) => `<li><span>${esc(s)}</span></li>`).join('')}</ol>
      <div class="case-cols">
        ${p.sections.map(([h, x]) => `<section><h4 class="mono">${esc(h)}</h4><p>${esc(x)}</p></section>`).join('')}
      </div>
      ${p.metrics?.length ? `<dl class="metrics">
        ${p.metrics.map(([v, l]) => `<div><dt>${esc(l)}</dt><dd>${esc(v)}</dd></div>`).join('')}
      </dl>` : ''}
      <ul class="tags">${p.stack.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>
    </article>`).join('');

  const marqueeItems = cfg.stack.map((s) => `<span>${esc(s)}</span><i aria-hidden="true">✳</i>`).join('');

  const body = `
<section class="hero" data-hero>
  <div class="hero-grid" aria-hidden="true"></div>
  <div class="wrap hero-inner">
    <div class="hero-copy">
      <p class="eyebrow mono"><span class="pulse" aria-hidden="true"></span>${esc(t.hero.eyebrow)}</p>
      <h1 class="hero-title" data-split>${t.hero.title_html}</h1>
      <p class="lead" data-reveal>${esc(t.hero.lead)}</p>
      <div class="cta-row" data-reveal>
        <a class="btn btn-solid" href="#contact" data-magnetic>${esc(t.hero.ctaPrimary)} ${icon.arrow}</a>
        <a class="btn btn-line" href="${cfg.github}" rel="me noopener" target="_blank">${icon.github} ${esc(t.hero.ctaSecondary)}</a>
      </div>
    </div>
    ${terminal(t)}
  </div>
  <div class="wrap">
    <dl class="spec" data-reveal>
      ${t.hero.spec.map(([k, v], i) => `<div><dt class="mono">${esc(k)}</dt><dd${i === t.hero.spec.length - 1 ? ' class="status"' : ''}>${esc(v)}</dd></div>`).join('')}
    </dl>
  </div>
</section>

<section class="section" id="services">
  <div class="wrap">
    <div class="section-head">
      <p class="kicker mono" data-reveal>${esc(t.services.kicker)}</p>
      <h2 data-reveal>${esc(t.services.title)}</h2>
      <p class="section-intro" data-reveal>${esc(t.services.intro)}</p>
    </div>
    <div class="svc-list">${services}</div>
  </div>
</section>

<div class="marquee" aria-label="${esc(t.stack.label)}">
  <div class="marquee-track">
    <div class="marquee-group">${marqueeItems}</div>
    <div class="marquee-group" aria-hidden="true">${marqueeItems}</div>
  </div>
</div>

<section class="section" id="protocol">
  <div class="wrap">
    <div class="section-head">
      <p class="kicker mono" data-reveal>${esc(t.protocol.kicker)}</p>
      <h2 data-reveal>${esc(t.protocol.title)}</h2>
    </div>
    <ol class="steps" data-steps>${steps}</ol>
    <div class="principles" data-reveal>
      <h3 class="mono">${esc(t.protocol.principlesTitle)}</h3>
      <ul>${t.protocol.principles.map((x, i) => `<li><span class="mono">R${i + 1}</span>${esc(x)}</li>`).join('')}</ul>
    </div>
  </div>
</section>

<section class="section section-alt" id="work">
  <div class="wrap">
    <div class="section-head">
      <p class="kicker mono" data-reveal>${esc(t.work.kicker)}</p>
      <h2 data-reveal>${esc(t.work.title)}</h2>
    </div>
    ${projects}
    <article class="slot" data-reveal>
      <span class="mono case-id">${esc(t.work.slot.id)}</span>
      <span class="chip chip-ghost">${esc(t.work.slot.label)}</span>
      <h3>${esc(t.work.slot.title)}</h3>
      <p>${esc(t.work.slot.text)}</p>
    </article>
  </div>
</section>

<section class="section" id="contact">
  <div class="wrap contact-grid">
    <div class="contact-copy">
      <p class="kicker mono" data-reveal>${esc(t.contact.kicker)}</p>
      <h2 data-reveal>${esc(t.contact.title)}</h2>
      <p class="section-intro" data-reveal>${esc(t.contact.intro)}</p>
      <a class="gh-card" href="${cfg.github}" rel="me noopener" target="_blank" data-reveal>
        <span class="gh-icon">${icon.github}</span>
        <span>
          <strong>${esc(t.contact.githubTitle)}</strong>
          <span class="muted">${esc(t.contact.githubText)}</span>
          <span class="mono gh-handle">github.com/${esc(cfg.githubHandle)} ${icon.arrow}</span>
        </span>
      </a>
    </div>

    <form class="form" action="/api/contact" method="post" novalidate data-form data-reveal
      data-msg-sending="${esc(f.sending)}" data-msg-ok="${esc(f.ok)}"
      data-msg-validation="${esc(f.errValidation)}" data-msg-rate="${esc(f.errRate)}" data-msg-server="${esc(f.errServer)}">
      <input type="hidden" name="lang" value="${t.lang}">
      <input type="hidden" name="ts" value="" data-ts>
      <div class="field hp" aria-hidden="true">
        <label for="f-website">${esc(f.honeypot)}</label>
        <input id="f-website" name="website" type="text" tabindex="-1" autocomplete="off">
      </div>
      <div class="field-row">
        <div class="field">
          <label for="f-name">${esc(f.name)}</label>
          <input id="f-name" name="name" type="text" required minlength="2" maxlength="100" autocomplete="name">
        </div>
        <div class="field">
          <label for="f-email">${esc(f.email)}</label>
          <input id="f-email" name="email" type="email" required maxlength="254" autocomplete="email">
        </div>
      </div>
      <div class="field-row">
        <div class="field">
          <label for="f-company">${esc(f.company)} <span class="muted">(${esc(f.optional)})</span></label>
          <input id="f-company" name="company" type="text" maxlength="120" autocomplete="organization">
        </div>
        <div class="field">
          <label for="f-budget">${esc(f.budget)} <span class="muted">(${esc(f.optional)})</span></label>
          <select id="f-budget" name="budget">${opt(f.budgets)}</select>
        </div>
      </div>
      <fieldset class="field">
        <legend>${esc(f.topic)}</legend>
        <div class="topics">
          ${Object.entries(f.topics).map(([v, l], i) => `<label class="topic"><input type="radio" name="topic" value="${v}" ${i === 0 ? 'checked' : ''}><span>${esc(l)}</span></label>`).join('')}
        </div>
      </fieldset>
      <div class="field">
        <label for="f-message">${esc(f.message)}</label>
        <textarea id="f-message" name="message" rows="6" required minlength="20" maxlength="5000" placeholder="${esc(f.messagePlaceholder)}"></textarea>
        <span class="counter mono" data-counter>0 / 5000</span>
      </div>
      <label class="consent">
        <input type="checkbox" name="consent" value="1" required>
        <span>${esc(f.consent)}</span>
      </label>
      <p class="privacy">${esc(f.privacy)}</p>
      <div class="form-foot">
        <button class="btn btn-solid" type="submit" data-submit>${esc(f.submit)} ${icon.arrow}</button>
        <p class="form-status" role="status" aria-live="polite" data-status></p>
      </div>
    </form>
  </div>
</section>`;

  return layout({ t, alt, cfg, assets, path: t.path, title: t.meta.title, description: t.meta.description, body });
}

function status({ t, alt, cfg, assets, kind }) {
  const map = {
    thanks: [t.status.sentTitle, t.status.sentText],
    error: [t.status.errorTitle, t.status.errorText],
    404: [t.status.notFoundTitle, t.status.notFoundText],
  };
  const [title, text] = map[kind];
  const path = kind === 404 ? t.path : `${t.path}${kind}/`;
  const body = `
<section class="status-page">
  <div class="wrap">
    <p class="kicker mono">${kind === 404 ? 'ERR 404' : kind === 'thanks' ? 'OK 200' : 'ERR 400'}</p>
    <h1>${esc(title)}</h1>
    <p class="section-intro">${esc(text)}</p>
    <a class="btn btn-solid" href="${t.path}${kind === 'error' ? '#contact' : ''}">${esc(t.status.back)} ${icon.arrow}</a>
  </div>
</section>`;
  return layout({ t, alt, cfg, assets, path, title: `${title} — ${cfg.brand}`, description: text, body, noindex: true });
}

export { home, status };
