import nodemailer from 'nodemailer';

const TOPIC_LABEL = {
  cicd: 'CI/CD',
  containers: 'Kontenery / Kubernetes',
  infra: 'Infrastruktura / chmura',
  monitoring: 'Monitoring / bezpieczeństwo',
  dev: 'Programowanie',
  other: 'Inne',
};
const BUDGET_LABEL = { unknown: 'nie podano', s: '< 5k PLN', m: '5–15k PLN', l: '15–40k PLN', xl: '> 40k PLN' };

export function createMailer(cfg, log) {
  if (cfg.mailDryRun) {
    return {
      async send(d) {
        // Dry run: never log the message body or e-mail address (PII) — only metadata.
        log('info', 'MAIL_DRY_RUN: would send', { topic: d.topic, lang: d.lang, len: d.message.length });
      },
    };
  }

  const transport = nodemailer.createTransport({
    host: cfg.smtp.host,
    port: cfg.smtp.port,
    secure: cfg.smtp.secure,
    requireTLS: !cfg.smtp.secure, // never send credentials in plaintext
    auth: cfg.smtp.user ? { user: cfg.smtp.user, pass: cfg.smtp.pass } : undefined,
    tls: { minVersion: 'TLSv1.2' },
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
  });

  transport.verify().then(
    () => log('info', 'smtp ready'),
    (e) => log('error', 'smtp verify failed', { err: e.code || e.message }),
  );

  return {
    async send(d) {
      const text = [
        `Nowe zapytanie ze strony whiteitlab (${d.lang.toUpperCase()})`,
        '',
        `Imię i nazwisko: ${d.name}`,
        `E-mail:          ${d.email}`,
        `Firma:           ${d.company || '—'}`,
        `Temat:           ${TOPIC_LABEL[d.topic]}`,
        `Budżet:          ${BUDGET_LABEL[d.budget]}`,
        '',
        '--- wiadomość ---',
        d.message,
      ].join('\n');

      await transport.sendMail({
        from: cfg.mailFrom,           // must be your own domain (SPF/DKIM)
        to: cfg.mailTo,
        replyTo: { name: d.name, address: d.email }, // "Reply" goes to the sender
        subject: `[whiteitlab] ${TOPIC_LABEL[d.topic]} — ${d.name}`,
        text,                          // plain text only: no HTML injection surface
      });
    },
  };
}
