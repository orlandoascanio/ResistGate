# ResistGate

**A Chrome extension that makes distracting sites harder to open, without fully blocking them.**

_You don't unblock distractions. You earn access._

ResistGate redirects the sites you choose to a typing challenge. Pasting is disabled and the text has to be
typed with 100% accuracy. You either earn a short window of access or close the tab. The idea is simple:
friction changes behavior. A few seconds of deliberate effort is enough to break an unconscious reflex
and make you decide whether a visit is worth it.

It is free, open source (MIT), and fully local. There is no account and no paid tier, and the extension
makes no network requests.

[Install from the Chrome Web Store](https://chromewebstore.google.com/detail/resistgate/elpiihpfmgipodcddhhpiijmppkmlpnc)

---

## Features

**Blocking**
- Block any domain. Redirects go through `declarativeNetRequest` session rules.
- Schedules: block only on chosen days and hours, including overnight windows.
- Block the current tab from the popup in one click.
- Access conditions per site: allow a site after a time of day, or after N minutes on the built-in work timer.

**Friction**
- Typing challenge in three levels: Easy (short code), Moderate (1–2 sentences), or Hard (5 paragraphs).
- Your own challenge phrase in place of the built-in text: a promise in your own words, typed out every time.
- Intention Page: a pause screen showing your saved reason for blocking the site, with an optional 4-7-8 breathing exercise.
- Extra friction steps: write what you're about to do, wait out a timer, or meet a minimum challenge time before access opens.
- Manual override with a 10–15 second delay, with longer delays and a temporary lockout if you keep using it.
- Temporary access windows that re-block automatically. You can also re-block early from the popup.

**Stronger locks**
- Strict Mode: settings lock during your focus window and manual override is disabled. Turning it off requires a cooldown.
- Commitment Mode: a 1–24 hour total lockout with no override and no challenge, which can't be ended early.
- Presets (Light / Balanced / Strict) to set all of the above at once.

**Progress**
- Daily badge counter and per-site resistance counters.
- 7-day dashboard: blocked attempts, overrides, top distractions.
- Weekly Review with a Focus Score: `clamp(100 − overrides×5 − strict_mode_disables×10, 0, 100)`.

## Privacy

Everything ResistGate knows about you stays in `chrome.storage.local` on your machine. It does not use
`chrome.storage.sync`, has no analytics or crash reporting, and has no server. The extension pages' content
security policy allows no network connections (`script-src 'self'; object-src 'self'`).

ResistGate opens a few web pages as ordinary browser tabs (see [Pages on orlandoascanio.com](#pages-on-orlandoascaniocom)).
These are page visits, not background requests: nothing about your blocklist or habits is sent anywhere.

## Pages on orlandoascanio.com

Install, update, uninstall, and feedback pages live on the website, not inside the extension. The extension
only opens these URLs. To change what people see at those moments, edit the website (`Profesional-Portfolio`),
not this repository.

| Moment | Page | Opened by |
|---|---|---|
| First install | `https://www.orlandoascanio.com/resistgate/installed` | `chrome.runtime.onInstalled` (`install`) |
| Update to a new minor or major version | `https://www.orlandoascanio.com/resistgate/updated?from=X&to=Y` | `chrome.runtime.onInstalled` (`update`). Patch releases, downgrades, and same-version reloads open nothing. |
| Uninstall | `https://www.orlandoascanio.com/resistgate/uninstall` | `chrome.runtime.setUninstallURL` |
| Feedback button (popup, options) | `https://www.orlandoascanio.com/resistgate/feedback?source=…` | `openFeedbackPage` message |
| What's New button (options) | `https://www.orlandoascanio.com/resistgate/updated` | `getWhatsNewUrl()` in `options/options.js` |

The URLs are defined once, in `RESISTGATE_WEBSITE_URLS` at the top of `background.js` (the What's New link is
in `options/options.js`). Always use the `www` host and no `/en/` prefix: both of the other forms answer with a
redirect. A test fails if install, update, or uninstall ever points anywhere else.

Do not add a page bundled in the extension for any of these moments. The only pages the extension ships are
the ones that need extension APIs: the gate pages (friction, Intention, Commitment), the popup, the options page,
and `welcome/welcome.html`.

The install page shows real screenshots of the extension, stored in the website repo at
`client/public/images/resistgate/onboarding/`. The setup form below uses the same captures from `welcome/images/`.
When a gate page, the popup, Weekly Review, or Commitment Mode changes visibly, recapture them in both places.

`welcome/welcome.html` is the setup form, not the welcome page. It never opens on install. The website's install
page has an **Add your first site** button (**Continue setup** once a site is saved) that sends the
`openOnboarding` message, and only then does the extension open this form in a new tab. It has to be an
extension page because the website can read setup status (`getOnboardingState`) but cannot change settings.

## Install from source

1. Clone this repository.
2. Open `chrome://extensions` and turn on **Developer mode**.
3. Click **Load unpacked** and select the repository folder.

There is no build step. The extension is plain HTML, CSS, and JavaScript. After editing a file, click
**Reload** on the extension card.

## Development

```bash
npm install
npm test                 # run the suite once
npm run test:watch       # watch mode
npm run test:coverage    # enforce coverage thresholds
```

Tests run in Node with Vitest. Each extension script is loaded into a `vm` context with a mocked `chrome`
API (`tests/helpers/vm-env.js`) and exposes a `__RESISTGATE_*_TEST_HOOKS__` global for pure-function tests.
See [CLAUDE.md](CLAUDE.md) for the architecture, message actions, storage keys, and coding conventions.

### Project layout

```
manifest.json      MV3 config and permissions
background.js      service worker: settings, blocking rules, alarms, local analytics, messaging
popup/             quick actions
options/           full settings, Progress, Weekly Review, Stronger Locks
friction-page/     typing challenge and manual override
intention-page/    pause screen with goal reminder and short challenge
commitment-page/   Commitment Mode lockout page
welcome/           setup form, opened from the website's install page (not on install)
shared/            design tokens and self-hosted fonts
tests/             Vitest suite
```

### Permissions

| Permission | Why |
|---|---|
| `declarativeNetRequest` | Redirect blocked domains to the challenge page |
| `storage` | Keep settings and state on this device |
| `alarms` | Expire access windows, run schedules, reset daily counters |
| `tabs` | Block the current tab and open extension pages |
| `host_permissions: <all_urls>` | Apply redirect rules to the domains you choose |

## Contributing

Issues and pull requests are welcome. Before opening a PR, run `npm run test:coverage`. For a bug fix,
include a test that fails without your change.

## License

[MIT](LICENSE)
