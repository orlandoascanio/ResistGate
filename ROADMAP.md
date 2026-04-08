# ResistGate Pro v1 (Revenue Version)

## Goal
Ship a monetizable Pro version of ResistGate within 2-3 weeks.

Primary objective:
- Convert frustration + ambition into paid accountability.

Not to build the "ultimate focus system."
Just enough value to justify $7.99/month.

## Pricing Model
- $7.99/month
- $65/year (optional, after v1 stable)
- No free trial
- 7-day refund policy

## Core Positioning
- Free = Block distractions
- Pro = Measure and improve your discipline

## Feature Split
### Free (Always Available)
- Domain blocking
- Schedule-based blocking
- Basic friction challenge
- Temporary access
- Manual override

Free is functional.
Pro is transformational.

## Pro v1 Feature Set (Strict Scope)
### 1) Strict Mode Lock
When enabled:
- Prevent settings changes during active schedule
- Prevent blocklist edits
- Require cooldown to disable
- Optional delay before disabling

Goal:
- Increase commitment friction.

Implementation:
- Boolean flag `strictModeEnabled`
- Lock UI controls conditionally
- Store lock state in extension storage
- Enforce via background worker

### 2) Override Cooldown System
If user manually overrides more than X times in Y hours:
- Increase friction
- Force longer wait
- Temporarily disable override

Track:
- `overrideCount`
- `overrideTimestamps`

Goal:
- Stop repeated impulse bypass.

### 3) Focus Analytics (Basic Dashboard)
This is the core Pro hook.

Track events:
- `blocked_visit`
- `access_granted`
- `override_triggered`
- `challenge_failed`
- `challenge_completed`

Store locally (initially).

Dashboard shows:
- Total blocked attempts (this week)
- Total overrides
- Time spent in strict sessions
- Top 5 blocked domains
- Override frequency trend (7-day view)

No AI.
No complex stats.
Just visible numbers.

### 4) Focus Score (Simple Formula)
You don't need behavioral science.
Start simple.

Example:
```text
Focus Score =
100
 - (overrideCount × 5)
 - (manualDisableCount × 10)
```

Clamp between 0-100.
Displayed weekly.

Goal:
- Create visible accountability.

### 5) Weekly Report
Generated every 7 days.
Display inside extension (v1).

Optional later:
- Email report (v2).

Content:
- Focus score
- Overrides this week
- Top distraction domains
- Trend vs last week (+/-)

Short feedback line:
- "Improved discipline."
- "Overrides increased."
- "Strong consistency."

Keep it simple.

### 6) Earn-Access System (Optional but Powerful)
Instead of manual override, user must:
- Complete focus session
- Complete harder challenge
- Wait extended delay

This increases perceived seriousness.

But keep v1 simple:
- Just one earn-access rule.

## Billing System
Start simple.

Recommendation:
- Stripe
- Not Paddle
- Not PayPal

Why:
- Clean API
- Easy subscriptions
- Works globally
- Dev-friendly

Architecture:
- User purchases on web.
- Stripe webhook confirms payment.
- Backend issues Pro entitlement token.
- Extension verifies entitlement periodically.

For v1:
- You can even manually issue license keys.
- Do not overengineer.

## Entitlement System (v1 Simple Version)
### Option A (Simplest)
- User enters email after purchase.
- Extension checks your API endpoint: `/api/check-pro?email=`
- Return true/false.

### Option B (Better)
- Signed JWT entitlement.
- Expiry check.
- Renewal verification.

v1: Keep it minimal but secure enough.

## What NOT To Build In v1
- Adaptive friction
- Cross-device sync
- Team mode
- Focus coach AI
- Smart schedule suggestions
- PDF export
- Advanced charts

If it doesn't directly help someone say:
"Yes, I want accountability."
It waits.

## Emotional Trigger Strategy
Users upgrade when they feel:
- Frustrated at themselves
- Ambitious about improvement
- Protective of identity

Your Pro messaging should target:
"I want proof that I'm improving."

Not:
"More features."

## Definition of Done (Pro v1)
You are done when:
- User can pay $5
- Pro unlocks correctly
- Strict mode works
- Overrides tracked
- Dashboard shows numbers
- Weekly report generates
- No major bypass bugs

That's it.
Not perfection.
Revenue.

## After First 10 Paying Users
Then you build:
- Trend charts
- Streak tracking
- Improved scoring model
- Heatmap visuals
- Export reports

Not before.

## Final Rule
If a feature does not:
- Increase commitment
- Increase accountability
- Increase visibility of discipline

It is not Pro v1.
