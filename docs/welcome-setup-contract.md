# Welcome setup bridge

The installed website opens `welcome/welcome.html` in the extension. Setup writes
stay in the extension; the website never receives domains, reminders, or settings.
This bridge is separate from the Paddle activation contract.

## Trusted external messages

Only the existing HTTPS apex and www portfolio origins are accepted.

- `getOnboardingState`: returns `{ success: true, state: { siteCount,
  activeSiteCount, enabled, level, accessMinutes, intentionEnabled } }`.
  Counts describe saved sites and current installed DNR rules, respectively.
  A saved site need not be blocking now (schedule, temporary access, disabled
  blocking, or an access condition). No completed flag is stored on the website.
- `openOnboarding`: optional `section` is `setup`, `difficulty`, or `preview`.
  Opens the fixed extension welcome URL with that fragment. Rejects other
  sections; accepts no arbitrary URL or settings. Returns `{ success: true }`
  only after Chrome creates the tab.

The website refreshes on focus/visibility and offers retry plus manual toolbar
instructions when the extension is missing, outdated, or unreachable. It never
treats a timeout as an empty blocklist. These actions require an extension release
as well as a website deployment; old extension versions use the manual fallback.

## Internal setup messages

- `getWelcomeState`: returns sanitized settings and the currently enforced domains.
- `saveWelcomeSetup`: accepts an optional domain and required easy/moderate/hard
  level, merging into freshly read settings. Does not enable blocking, change
  schedules, remove sites, clear access grants, or change subscription fields.
- `saveWelcomeReminder`: accepts an existing domain and a reminder up to 200
  characters, reusing `blocklist[].personalGoal`.

Writes are serialized, respect Strict/Commitment locks, and await the existing
rule-update queue. Success is never shown before the rule operation completes.
No default site or difficulty change is applied without an explicit save.
The preview is a local simulation of the first-install intention flow. It never
grants access, navigates to the example site, writes settings, or records visits.

## Verification

Run extension coverage; test bridge origin rejection, privacy, locking, invalid
inputs, duplicate sites, preserved settings, and rule failures. Test website
transport timeouts and old-version fallback. Browser-check the layout and preview.
An installed Chrome round trip remains a separate release check.
