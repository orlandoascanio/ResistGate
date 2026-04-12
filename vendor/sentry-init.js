/**
 * Sentry initialization for ResistGate extension pages.
 * Loaded by all four extension pages (popup, options, welcome, friction-page)
 * before their respective page scripts.
 */
const SENTRY_DSN = 'https://67d84626d147f5f97016486100428d34@o4510075179827200.ingest.us.sentry.io/4511200837304320';

Sentry.init({
  dsn: SENTRY_DSN,
  release: 'resistgate@1.0.0',
  environment: 'production',

  // Capture 100% of errors; adjust tracesSampleRate only if you add tracing later.
  tracesSampleRate: 0,

  // Extension pages share the same process — tag events with which page they came from
  // so alerts are actionable. Each page overrides this via Sentry.setTag() if needed.
  beforeSend(event) {
    return event;
  },
});
