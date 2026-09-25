// whiteitlab — progressive enhancement only. The page is fully readable and
// the form works (plain POST + redirect) with this file disabled.
(() => {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const root = document.documentElement;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const finePointer = matchMedia('(pointer: fine)').matches;

  /* ---------------------------------------------------------- theme --- */
  $('[data-theme-toggle]')?.addEventListener('click', () => {
    const current = root.dataset.theme || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    const next = current === 'dark' ? 'light' : 'dark';
    root.dataset.theme = next;
    try { localStorage.setItem('wl-theme', next); } catch { /* ignore */ }
  });

  /* ------------------------------------------ header + scroll progress --- */
  const header = $('[data-header]');
  const steps = $('[data-steps]');
  let ticking = false;
  const onScroll = () => {
    ticking = false;
    const y = scrollY;
    const max = document.documentElement.scrollHeight - innerHeight;
    header?.toggleAttribute('data-scrolled', y > 8);
    header?.style.setProperty('--scroll', max > 0 ? (y / max).toFixed(4) : 0);
    if (steps) {
      const r = steps.getBoundingClientRect();
      const p = Math.min(1, Math.max(0, (innerHeight * 0.85 - r.top) / (r.height + innerHeight * 0.35)));
      steps.style.setProperty('--p', p.toFixed(3));
    }
  };
  addEventListener('scroll', () => { if (!ticking) { ticking = true; requestAnimationFrame(onScroll); } }, { passive: true });
  onScroll();

  /* ------------------------------------------------------------ hero --- */
  const hero = $('[data-hero]');
  const split = $('[data-split]');
  if (split) {
    // Wrap every word (text nodes only, so <em> and &nbsp; survive) in a mask.
    let i = 0;
    const walk = (node) => {
      for (const child of [...node.childNodes]) {
        if (child.nodeType === Node.TEXT_NODE) {
          const frag = document.createDocumentFragment();
          child.textContent.split(/( +)/).forEach((part) => {
            if (!part) return;
            if (/^ +$/.test(part)) { frag.append(part); return; }
            const w = document.createElement('span');
            const inner = document.createElement('span');
            w.className = 'w';
            inner.textContent = part;
            inner.style.setProperty('--i', i++);
            w.append(inner);
            frag.append(w);
          });
          child.replaceWith(frag);
        } else if (child.nodeType === Node.ELEMENT_NODE) {
          walk(child);
        }
      }
    };
    walk(split);
    // Start right away: waiting for fonts delayed LCP by ~1 s (font-display: swap
    // handles the font change). No rAF: it's paused in background tabs, and the
    // headline must never stay hidden. The reflow commits the hidden state first
    // so the transition actually runs.
    void hero.offsetWidth;
    hero.classList.add('hero-ready');
  }
  if (hero && finePointer && !reduced) {
    hero.addEventListener('pointermove', (e) => {
      const r = hero.getBoundingClientRect();
      hero.style.setProperty('--mx', `${e.clientX - r.left}px`);
      hero.style.setProperty('--my', `${e.clientY - r.top}px`);
    });
  }

  /* ---------------------------------------------------------- reveal --- */
  const io = new IntersectionObserver((entries) => {
    const batch = entries.filter((e) => e.isIntersecting);
    batch.forEach((e, idx) => {
      e.target.style.setProperty('--d', `${Math.min(idx, 6) * 80}ms`);
      e.target.classList.add('is-in');
      io.unobserve(e.target);
    });
  }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
  $$('[data-reveal]').forEach((el) => io.observe(el));

  /* -------------------------------------------------------- terminal --- */
  const term = $('[data-terminal]');
  if (term) {
    const lines = $$('li', term);
    if (reduced) {
      lines.forEach((l) => l.classList.add('on'));
    } else {
      let running = false;
      const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
      const first = lines[0];
      const cmd = first.lastChild.textContent;
      const run = async () => {
        running = true;
        for (;;) {
          lines.forEach((l) => l.classList.remove('on'));
          first.lastChild.textContent = '';
          first.classList.add('on', 'typing');
          await sleep(400);
          for (let c = 0; c < cmd.length; c++) {
            first.lastChild.textContent = cmd.slice(0, c + 1);
            await sleep(35 + Math.random() * 45);
          }
          await sleep(350);
          first.classList.remove('typing');
          for (const l of lines.slice(1)) {
            await sleep(l.classList.contains('final') ? 700 : 280 + Math.random() * 420);
            l.classList.add('on');
          }
          await sleep(5200);
        }
      };
      new IntersectionObserver(([e], obs) => {
        if (e.isIntersecting && !running) { run(); obs.disconnect(); }
      }).observe(term);
    }
  }

  /* -------------------------------------------------------- magnetic --- */
  if (finePointer && !reduced) {
    $$('[data-magnetic]').forEach((btn) => {
      btn.addEventListener('pointermove', (e) => {
        const r = btn.getBoundingClientRect();
        btn.style.setProperty('--bx', `${(e.clientX - r.left - r.width / 2) * 0.18}px`);
        btn.style.setProperty('--by', `${(e.clientY - r.top - r.height / 2) * 0.3}px`);
      });
      btn.addEventListener('pointerleave', () => { btn.style.setProperty('--bx', '0px'); btn.style.setProperty('--by', '0px'); });
    });
  }

  /* ------------------------------------------------------------ form --- */
  const form = $('[data-form]');
  if (!form) return;
  const status = $('[data-status]', form);
  const submit = $('[data-submit]', form);
  const msg = form.dataset;
  const ts = $('[data-ts]', form);
  if (ts) ts.value = String(Date.now());

  const textarea = form.elements.message;
  const counter = $('[data-counter]', form);
  const updateCounter = () => { counter.textContent = `${textarea.value.length} / ${textarea.maxLength}`; };
  textarea.addEventListener('input', updateCounter);
  updateCounter();

  const fieldOf = (name) => form.elements[name]?.closest?.('.field, .consent') ?? form.elements[name]?.[0]?.closest('.field');
  const clearInvalid = () => $$('[data-invalid]', form).forEach((el) => el.removeAttribute('data-invalid'));
  const markInvalid = (names) => names.forEach((n) => fieldOf(n)?.setAttribute('data-invalid', ''));
  const setStatus = (text, state) => { status.textContent = text; status.dataset.state = state || ''; };

  form.addEventListener('input', (e) => e.target.closest('[data-invalid]')?.removeAttribute('data-invalid'));

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearInvalid();

    // Client-side check mirrors the server rules; the server stays the authority.
    const bad = ['name', 'email', 'message'].filter((n) => !form.elements[n].checkValidity());
    if (!form.elements.consent.checked) bad.push('consent');
    if (bad.length) {
      markInvalid(bad);
      setStatus(msg.msgValidation, 'error');
      form.elements[bad[0]]?.focus?.();
      return;
    }

    const data = Object.fromEntries(new FormData(form));
    data.consent = form.elements.consent.checked;
    submit.disabled = true;
    setStatus(msg.msgSending);

    try {
      const res = await fetch(form.action, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(data),
      });
      const body = await res.json().catch(() => ({}));
      if (res.ok && body.ok) {
        setStatus(msg.msgOk, 'ok');
        form.setAttribute('data-done', '');
        return;
      }
      if (res.status === 422 && Array.isArray(body.fields)) {
        markInvalid(body.fields);
        setStatus(msg.msgValidation, 'error');
      } else if (res.status === 429) {
        setStatus(msg.msgRate, 'error');
      } else {
        setStatus(msg.msgServer, 'error');
      }
    } catch {
      setStatus(msg.msgServer, 'error');
    }
    submit.disabled = false;
  });
})();
