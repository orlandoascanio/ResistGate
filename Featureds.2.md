# ResistGate SEO Feature Brief

Last audited: 2026-07-07
Version: 1.3.3

For the complete code-derived feature matrix, use `Features.md`. This file keeps the shorter marketing/SEO brief in sync with the shipped extension.

## Core Value Proposition

ResistGate is a website blocker and digital discipline tool that interrupts mindless browsing. Instead of making distraction one click away, it adds a pause, a typing challenge, and measurable resistance loops before temporary access is granted.

## Free Feature Highlights

- Block distracting domains with a Manifest V3 Chrome extension.
- Add/remove sites from the popup or full settings page.
- Block the current tab's domain in one click.
- Use scheduled blocking by day and time window.
- Complete a graduated typing challenge:
  - Easy: short random code.
  - Moderate: 1-2 focus sentences.
  - Hard: five focused paragraphs.
- Earn temporary access, then auto re-block when the timer expires.
- Use a delayed manual override when access is genuinely needed.
- See a daily toolbar badge and per-site resistance counters.
- Set per-site reminders shown before access.
- Use the Intention Page with optional breathing pause.
- Track focus minutes with the popup work timer.
- Set per-site access conditions that unlock after a specific time or after enough focus minutes.

## Pro Feature Highlights

- Strict Mode settings lock with disable cooldown.
- Commitment Mode for 1-24 hour no-escape lockouts.
- Override cooldown and temporary lockouts after repeated manual overrides.
- Behavioral friction precheck with task intent, timed wait, custom challenge prompt, and earn-access challenge timing.
- Bonus access minutes for longer challenge effort.
- Accountability presets: Light, Balanced, Strict.
- 7-day analytics dashboard.
- Weekly report with Focus Score, trends, top domains, highlights, and risk notes.
- Trusted-origin Pro activation after website checkout.

## Trust And Technical Notes

- User blocking decisions are local.
- Settings, counters, timers, temporary access, and local analytics use `chrome.storage.local`.
- Pro activation is accepted only from trusted `orlandoascanio.com` origins.
- Extension pages load bundled Sentry diagnostics.
- The background service worker sends allowlisted PostHog lifecycle/funnel events with sanitized properties and an opaque device ID.
- No build step is required.
- Current automated gate: 152 Vitest tests, `npm run test:coverage` passing.

## SEO Keywords

Primary:

- website blocker
- site blocker chrome extension
- distraction blocker
- focus extension
- productivity extension
- block youtube chrome
- block reddit
- social media blocker

Long-tail:

- website blocker with timer
- block distracting sites with challenge
- typing challenge website blocker
- discipline building chrome extension
- intentional browsing tool
- strict website blocker no override
- focus mode extension for students
- digital wellbeing chrome extension
- temptation bundling extension

Differentiators:

- Friction, not just walls.
- A blocker that makes access intentional.
- Free tier includes reminders, access conditions, and focus timer.
- Pro adds hard locks, analytics, and weekly discipline reports.
