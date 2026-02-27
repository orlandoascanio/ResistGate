# ResistGate Pro v1 Architecture

## 1. Overall Architecture (Mental Model)
Think in 4 layers:
- Background worker (service worker)
  Source of truth for blocking, Pro status, analytics.
- Storage layer
  `chrome.storage.local` + sync with typed schemas.
- UI surfaces
  Options page, popup, friction/blocked page, dashboard.
- Backend (your site/Stripe)
  Only for Pro entitlement + billing (already discussed).

Everything important (rules, analytics, Pro flags) lives in background + storage.

## 2. Background Worker Responsibilities
Background script is the “brain”:
- Evaluates requests -> should this be blocked?
- Manages temporary access & strict mode
- Logs analytics events
- Triggers weekly aggregation/report
- Periodically refreshes Pro entitlement
- Exposes a small message API for UIs

### 2.1 Main Responsibilities
#### a) Blocking Orchestration
- Listens to URL classification (via `declarativeNetRequest` rules already configured).
- When a blocked domain is hit:
  - Redirect -> friction page (challenge URL).
  - Pass context via query params or `chrome.storage` (original URL, reason, timestamp).

#### b) Friction Flow
- Challenge page -> talks to background via `chrome.runtime.sendMessage`.
- Background validates challenge result.
- On success:
  - Create temporary allow rule (for X minutes) or "earn-access" logic.
  - Schedule expiry via `chrome.alarms`.
  - Log `access_granted` event.

#### c) Strict Mode / Override Control
- If `strictModeEnabled && strictModeActiveWindow`:
  - Prevent editing blocklist/schedule (UI reads this state).
  - Enforce extra friction for overrides.
- Cooldown:
  - Track override attempts.
  - If beyond threshold -> set a cooldown alarm or flag.

#### d) Analytics Logging & Aggregation
Single function: `logEvent(event: FocusEvent)`

Called from:
- Block events
- Overrides
- Challenge success/fail
- Strict session start/stop

Stores raw events -> local storage.
Periodically aggregates into weekly metrics (scheduled by `chrome.alarms`).

#### e) Entitlement Refresh (Pro)
On startup and every N hours:
- Read email from sync storage.
- Call your `/entitlement` endpoint.
- Store `isPro`, `status`, `expiresAt` in storage.

Expose this to UIs via:
- `chrome.storage` (observed by components)
- or message `getProStatus`.

## 3. Storage Model (What Lives Where)
Use typed schemas in TS so you don’t drown later.

### 3.1 Storage Areas
#### `chrome.storage.sync`
Light user settings that should sync between devices:
- email
- basic options
- blocklist
- schedules
- isPro flag (optional, but still verify from backend periodically)

#### `chrome.storage.local`
Heavier / device-specific:
- analytics raw events
- weekly aggregates
- `lastReportGeneratedAt`
- temp access state
- strict mode runtime state (if device-specific)

### 3.2 Type Interfaces (Example)
```ts
// sync storage
export interface SyncSettings {
  email?: string;
  blocklist: string[]; // domains
  schedules: FocusSchedule[];
  strictModeEnabled: boolean;
  basicFrictionEnabled: boolean;
}

export interface FocusSchedule {
  id: string;
  daysOfWeek: number[]; // 0-6
  startTime: string; // "09:00"
  endTime: string;   // "13:00"
}

// entitlement (could be sync or local)
export interface ProEntitlement {
  isPro: boolean;
  status?: 'active' | 'past_due' | 'canceled' | 'none';
  currentPeriodEnd?: string; // ISO
  lastCheckedAt?: string;
}

// local storage
export interface LocalRuntimeState {
  tempAllowRules: TempAllowRule[];
  strictModeRuntime: StrictModeRuntimeState;
  analyticsEvents: FocusEvent[];
  weeklyMetrics: WeeklyMetrics[];
  lastWeeklyReportAt?: string;
}

export interface TempAllowRule {
  id: string;
  domain: string;
  expiresAt: string; // ISO
}

export interface StrictModeRuntimeState {
  isActive: boolean;
  activeSince?: string;
  overrideAttemptsWindow: OverrideWindow;
}

export interface OverrideWindow {
  attempts: number;
  windowStart: string; // ISO
}
```

## 4. Analytics Structure (Events -> Aggregates -> Report)
### 4.1 Event Schema
Keep it simple and append-only.

```ts
export type FocusEventType =
  | 'blocked_visit'
  | 'access_granted'
  | 'override_attempt'
  | 'override_success'
  | 'challenge_failed'
  | 'challenge_completed'
  | 'strict_session_start'
  | 'strict_session_end';

export interface FocusEvent {
  id: string;
  type: FocusEventType;
  timestamp: string; // ISO
  domain?: string;
  metadata?: Record<string, unknown>;
}
```

Logging entry point:

```ts
async function logEvent(event: Omit<FocusEvent, 'id' | 'timestamp'>) {
  const full: FocusEvent = {
    id: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    ...event,
  };

  const { analyticsEvents = [] } = await chrome.storage.local.get('analyticsEvents');
  analyticsEvents.push(full);

  await chrome.storage.local.set({ analyticsEvents });
}
```

Call `logEvent({ type: 'blocked_visit', domain })` etc.

### 4.2 Aggregation Model (Weekly)
Run via `chrome.alarms` e.g. every few hours; if week boundary passed -> aggregate.

```ts
export interface WeeklyMetrics {
  weekStart: string; // Monday ISO date
  weekEnd: string;
  focusScore: number;
  totalBlocked: number;
  totalOverrides: number;
  strictSessionMinutes: number;
  topDistractors: { domain: string; count: number }[];
}
```

Aggregation steps:
- Determine current week range (Mon-Sun).
- Filter `analyticsEvents` to that week.
- Compute:
  - `totalBlocked = count of blocked_visit`
  - `totalOverrides = count of override_success`
  - `strictSessionMinutes` from start/end pairs
  - `topDistractors` from `blocked_visit.domain`
- Compute `focusScore`.

Example v1 formula:

```ts
focusScore = clamp(
  100
    - totalOverrides * 5
    - manualDisableCount * 10, // tracked via events
  0,
  100,
);
```

- Store or update `WeeklyMetrics` entry for that week.
- Optionally prune old raw events (e.g. > 90 days).

### 4.3 Weekly Report Generation
Weekly report = view over `WeeklyMetrics`.

For v1:
- Stored only locally
- Rendered in “Weekly report” section in options/dashboard

UI reads:
- Latest `WeeklyMetrics`
- Previous week to compare

You can generate a small derived object:

```ts
export interface WeeklyReport {
  weekStart: string;
  weekEnd: string;
  focusScore: number;
  deltaFocusScore?: number;
  totalBlocked: number;
  totalOverrides: number;
  topDistractors: { domain: string; count: number }[];
  summaryText: string; // simple interpretation
}
```

`summaryText` can be produced by a simple rules engine:
- If `deltaFocusScore > 5`: “Better discipline than last week.”
- If `< -5`: “More overrides than last week.”
- Else: “Discipline was about the same as last week.”

No AI. Deterministic and cheap.

## 5. How Pro Fits Technically
### 5.1 Pro Gating
Every Pro-only feature checks `ProEntitlement.isPro`.

In background:

```ts
async function isProUser(): Promise<boolean> {
  const { proEntitlement } = await chrome.storage.local.get('proEntitlement');
  return proEntitlement?.isPro === true;
}
```

Gated features:
- Strict mode lock actually enforcing lock -> Pro only
- Override cooldown -> Pro only
- Analytics dashboard -> visible only if Pro
- Weekly report -> Pro only

UI pattern:
- UI checks `isPro` from storage.
- If user clicks Pro feature while free -> show paywall modal.

### 5.2 Storage Separation
You can still log events for free users, but:
- Only Pro sees full analytics
- Or Pro gets more granularity/history

V1 simple rule:
- Only show analytics if `isPro`, but you log anyway so if they upgrade, they see immediate history.

## 6. Background Worker: Message API
You want a tight set of messages for Popup/Options/Friction page.

Example:

```ts
type MessageRequest =
  | { type: 'GET_STATE' }
  | { type: 'COMPLETE_CHALLENGE'; payload: { challengeId: string; originalUrl: string } }
  | { type: 'GET_ANALYTICS_SUMMARY' }
  | { type: 'GET_PRO_STATUS' }
  | { type: 'REFRESH_ENTITLEMENT' };

type MessageResponse =
  | { type: 'STATE'; payload: /* relevant state object */ }
  | { type: 'CHALLENGE_RESULT'; payload: { success: boolean; tempAccessGranted?: boolean } }
  | { type: 'ANALYTICS_SUMMARY'; payload: WeeklyReport }
  | { type: 'PRO_STATUS'; payload: ProEntitlement };
```

In background:

```ts
chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
  (async () => {
    switch (request.type) {
      case 'GET_PRO_STATUS': {
        const { proEntitlement } = await chrome.storage.local.get('proEntitlement');
        sendResponse({ type: 'PRO_STATUS', payload: proEntitlement });
        break;
      }
      // etc...
    }
  })();

  // indicate async
  return true;
});
```

Your React UIs (options, popup, friction page) use this to read state and render.

## 7. Implementation Order (To Avoid Chaos)
Given your roadmap and Pro v1 goals, implement in this order:
1. Define types: `SyncSettings`, `LocalRuntimeState`, `FocusEvent`, `WeeklyMetrics`, `ProEntitlement`.
2. Refactor background around:
   - `logEvent`
   - `refreshEntitlement`
   - `applyTempAllowRule`
   - `runWeeklyAggregation`
3. Wire blocking + friction + temp access cleanly (you already have most).
4. Add Strict Mode runtime rules and override cooldown logic.
5. Implement analytics logging (calls in all relevant paths).
6. Implement weekly aggregation via `chrome.alarms`.
7. Build simple analytics dashboard UI (reads from `WeeklyMetrics`).
8. Gate dashboard + strict mode + cooldown behind Pro.
9. Only then: finish Stripe & entitlement endpoints and connect.

You already have a lot coded - this gives structure so you don’t bolt on Pro in a messy way.
