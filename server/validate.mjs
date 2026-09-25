// Server-side validation of the contact form. The server is the authority;
// client-side checks in main.js are only for UX.

export const TOPICS = ['cicd', 'containers', 'infra', 'monitoring', 'dev', 'other'];
export const BUDGETS = ['unknown', 's', 'm', 'l', 'xl'];
const LANGS = ['pl', 'en'];

// Pragmatic e-mail check: one @, no spaces, a dot in the domain. RFC 5322 in
// full is neither needed nor desirable here.
const EMAIL = /^[^\s@<>()[\]\\,;:"]+@[^\s@<>()[\]\\,;:"]+\.[^\s@<>()[\]\\,;:"]{2,}$/;

// Strip control chars (incl. CR/LF — no header injection) and trim.
const clean = (v, keepNewlines = false) => {
  if (typeof v !== 'string') return '';
  const re = keepNewlines ? /[\u0000-\u0009\u000B\u000C\u000E-\u001F\u007F]/g : /[\u0000-\u001F\u007F]/g;
  return v.replace(re, '').normalize('NFC').trim();
};

const MIN_FILL_MS = 3000; // humans don't fill this form in < 3 s
const MAX_AGE_MS = 24 * 60 * 60 * 1000;

export function validateContact(input, now) {
  // Honeypot: invisible field that only bots fill in.
  if (clean(input.website)) return { spam: 'honeypot', errors: [] };

  // Time trap. `ts` is set by JS on page load; without JS it's empty and the check is skipped.
  const ts = Number(input.ts);
  if (input.ts && Number.isFinite(ts)) {
    const age = now - ts;
    if (age < MIN_FILL_MS) return { spam: 'too_fast', errors: [] };
    if (age > MAX_AGE_MS || age < 0) return { spam: 'stale', errors: [] };
  }

  const data = {
    name: clean(input.name),
    email: clean(input.email).toLowerCase(),
    company: clean(input.company),
    topic: clean(input.topic),
    budget: clean(input.budget) || 'unknown',
    message: clean(input.message, true).replace(/\r\n?/g, '\n'),
    consent: input.consent === true || input.consent === '1' || input.consent === 'on' || input.consent === 'true',
    lang: LANGS.includes(input.lang) ? input.lang : 'pl',
  };

  const errors = [];
  if (data.name.length < 2 || data.name.length > 100) errors.push('name');
  if (data.email.length > 254 || !EMAIL.test(data.email)) errors.push('email');
  if (data.company.length > 120) errors.push('company');
  if (!TOPICS.includes(data.topic)) errors.push('topic');
  if (!BUDGETS.includes(data.budget)) errors.push('budget');
  if (data.message.length < 20 || data.message.length > 5000) errors.push('message');
  if (!data.consent) errors.push('consent');

  return { data, errors };
}
