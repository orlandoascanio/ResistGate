/**
 * Sentry initialization for ResistGate extension pages.
 * Loaded by all four extension pages (popup, options, welcome, friction-page)
 * before their respective page scripts.
 */
const SENTRY_DSN = 'https://67d84626d147f5f97016486100428d34@o4510075179827200.ingest.us.sentry.io/4511200837304320';
const SENTRY_PAGE_TAGS = [
  { pathPart: '/popup/', page: 'popup' },
  { pathPart: '/options/', page: 'options' },
  { pathPart: '/welcome/', page: 'welcome' },
  { pathPart: '/friction-page/', page: 'friction-page' },
  { pathPart: '/commitment-page/', page: 'commitment-page' },
];

function getSentryPageTag() {
  const pathname = window.location && window.location.pathname ? window.location.pathname : '';
  const match = SENTRY_PAGE_TAGS.find(({ pathPart }) => pathname.includes(pathPart));

  return match ? match.page : 'extension-page';
}

Sentry.init({
  dsn: SENTRY_DSN,
  release: 'resistgate@1.2.0',
  environment: 'production',

  // Capture 100% of errors; adjust tracesSampleRate only if you add tracing later.
  tracesSampleRate: 0,

  // Extension pages share the same process, so tag events with their source page.
  beforeSend(event) {
    return event;
  },
});

Sentry.setTag('page', getSentryPageTag());
