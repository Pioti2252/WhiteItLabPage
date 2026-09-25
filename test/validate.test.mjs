import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateContact } from '../server/validate.mjs';

const now = 1_700_000_000_000;
const ok = {
  name: 'Jan Kowalski',
  email: 'Jan@Example.com',
  topic: 'cicd',
  budget: 'm',
  message: 'Potrzebuję pipeline’u dla aplikacji Node.js.',
  consent: true,
  lang: 'pl',
  ts: String(now - 10_000),
};

test('accepts a valid submission and normalises e-mail', () => {
  const r = validateContact(ok, now);
  assert.equal(r.spam, undefined);
  assert.deepEqual(r.errors, []);
  assert.equal(r.data.email, 'jan@example.com');
});

test('reports every invalid field', () => {
  const r = validateContact({ name: 'J', email: 'x', topic: 'nope', budget: 'huge', message: 'short' }, now);
  assert.deepEqual(r.errors.sort(), ['budget', 'consent', 'email', 'message', 'name', 'topic']);
});

test('honeypot marks as spam', () => {
  assert.equal(validateContact({ ...ok, website: 'http://spam' }, now).spam, 'honeypot');
});

test('too-fast and stale submissions are spam', () => {
  assert.equal(validateContact({ ...ok, ts: String(now - 500) }, now).spam, 'too_fast');
  assert.equal(validateContact({ ...ok, ts: String(now - 2 * 86_400_000) }, now).spam, 'stale');
});

test('missing ts (no-JS) is allowed', () => {
  const { ts, ...noTs } = ok;
  assert.deepEqual(validateContact(noTs, now).errors, []);
});

test('strips CR/LF from single-line fields (no header injection)', () => {
  const r = validateContact({ ...ok, name: 'Jan\r\nBcc: victim@example.com' }, now);
  assert.ok(!/[\r\n]/.test(r.data.name));
});

test('keeps newlines in the message', () => {
  const r = validateContact({ ...ok, message: 'Linia pierwsza\r\nlinia druga, dość długa' }, now);
  assert.equal(r.data.message, 'Linia pierwsza\nlinia druga, dość długa');
});

test('non-string input does not throw', () => {
  const r = validateContact({ name: { $ne: 1 }, email: ['a'], message: 42 }, now);
  assert.ok(r.errors.includes('name') && r.errors.includes('email') && r.errors.includes('message'));
});
