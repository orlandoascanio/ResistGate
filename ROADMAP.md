# ResistGate Roadmap

## Current Status: v1.0.0 ✅ Live on Chrome Web Store

**Shipped:** April 11, 2026 — Now in production with active users collecting real-world feedback.

### v1 Baseline Metrics
- ✅ All 121 tests passing
- ✅ Free + Pro tiers (simplified — no license keys, no expiration checks)
- ✅ Actively gathering user feedback and behavior data
- ✅ Stable core engine proven in production

---

## Pricing Model

- **Free** = Block distractions + typing challenge + temporary access
- **Pro** = Strict mode + analytics + weekly report + earn-access bonus
- **$50 one-time** (pay once, lifetime access)
- Pro activation is permanent — once activated via website, user stays Pro forever (no license keys, no expiration checks)

---

## v1.0.0 Feature Completion

### Free Tier (Fully Implemented)
- ✅ Domain blocking via `declarativeNetRequest`
- ✅ Schedule-based blocking (days + time windows)
- ✅ Friction challenge (5 paragraphs, 100% accuracy, paste disabled)
- ✅ Temporary access grant + auto-expiry (via alarms)
- ✅ Manual override with configurable 10-15s delay countdown
- ✅ Popup for quick add/remove sites
- ✅ Options page with full blocklist management

### Pro Tier (Fully Implemented)
- ✅ **Strict Mode Lock** — Prevent settings changes during active schedule; require cooldown to disable
- ✅ **Override Cooldown System** — Track overrides; lock manual access after threshold exceeded
- ✅ **Focus Analytics Dashboard** — 7-day view of blocked attempts, overrides, top domains
- ✅ **Focus Score** — Weekly discipline score (0-100 formula based on override count + manual disables)
- ✅ **Weekly Report** — Auto-generated feedback with trend comparison
- ✅ **Earn-Access Bonus** — Extra minutes awarded for completing extended challenge sessions
- ✅ **Event Logging** — Track all blocking, access, override, and challenge events

---

## v2.0 Planned Features

After first 10+ paying users validate the core value, prioritize:

### Near-term (Q2 2026)
- **Visual Analytics** — Trend charts (7-day, 30-day), block frequency heatmaps, override trends
- **Streak Tracking** — Consecutive days without manual overrides; visual streak counter
- **Improved Focus Score** — Adaptive weighting based on domain difficulty + time of day
- **Email Weekly Report** — Optional digest sent to registered email address
- **Export Report** — CSV/PDF export of weekly data and focus score
- **Settings Sync** — Optional `chrome.storage.sync` for cross-device consistency

### Mid-term (Q3 2026)
- **Focus Sessions** — Dedicated "deep work" timer integration (independent session blocks)
- **Distraction Ranking** — Learn which sites are most tempting; surface top offenders
- **Earn-Access Customization** — Let users define their own earn-access challenge (typing length, difficulty, cooldown)
- **Advanced Scheduling** — Per-site block schedules; time-of-day based rules
- **Dark Mode** — Extension UI support for system dark mode preference

### Long-term (Post-v2)
- **Team/Family Mode** — Share accountability partner blocking (limited trusted connections)
- **AI Coach** (Optional) — Behavioral insights based on override patterns (post-MVP, evaluate privacy tradeoffs)
- **Portable Data** — Export lifetime discipline stats for privacy-preserving sharing
- **Platform Expansion** — Firefox, Safari, Edge support

### Subscription Management (Required before scale)
- **Downgrade Path for Cancellations/Refunds** — Currently, once a user activates Pro, they stay Pro forever (no license verification, no expiration). This is intentional for simplicity, but creates a problem if you ever need to handle:
  - Refund requests
  - Subscription cancellations
  - Chargebacks
  - Fraudulent activations
- **Solution needed**: Add a manual or automated downgrade mechanism. Options:
  1. **Manual admin tool** — Secure endpoint to revoke specific users by extension ID
  2. **Periodic entitlement check** — Lightweight ping to verify subscription status (respect privacy)
  3. **Self-serve downgrade** — User can deactivate Pro and revert to Free
- **Priority**: Medium — Not urgent until you have significant paying users, but must exist before handling customer service at scale.

---

## What Remains Out of Scope (v1-v2)

**NOT building:**
- Browser sync across devices (use cases don't justify complexity)
- Machine learning personalization (manual rules > AI surprises)
- Team/group dashboards (focus on individual accountability first)
- Website companion (extension is sufficient for v1-v2)
- Mobile apps (desktop focus is the strategic moat)

**Why:**
- Limits scope creep
- Keeps extension performant
- Preserves privacy (no external data pipelines)
- Lets us ship faster

---

## Post-Launch Strategy (Active Phase)

### Current (Weeks 1-4 Post-Launch)
**Goal:** Collect real user feedback, identify friction points, validate monetization assumptions.

- **Monitor Web Store reviews** — Surface issues and feature requests
- **Track analytics events** — Understand where users abandon vs. complete friction
- **Pro conversion funnel** — Which users upgrade and at what step?
- **Support tickets** — Prioritize by impact and frequency
- **Cohort analysis** — Compare free vs. Pro user behavior patterns

**Key Metrics to Watch:**
- Free → Pro conversion rate (target: 5-10%)
- Friction challenge completion rate (target: 80%+)
- Pro activation success rate (target: 99%)
- Churn rate first 7 days (target: < 30%)
- Support tickets per 1000 users (target: < 10)

### Month 2-3 (Iteration Phase)
Based on real user data, prioritize v1.1 hotfixes:
- **High-impact bugs** (crashes, data loss, activation failures) → deploy immediately
- **UX friction** (unclear copy, confusing flows) → iterate next patch
- **Performance issues** (slow challenges, slow dashboard) → optimize
- **Feature requests** (most requested by paying users) → evaluate for v1.1

### Decision Point: v1.1 vs v2.0
After first 100-500 real users:
- **If conversion < 2%**: Rethink pricing or core value prop (v1.1 pivot)
- **If churn > 20%**: Focus on retention before adding features (v1.1 hardening)
- **If stable (5%+ conv, < 10% churn)**: Lock v1, plan v2.0 (near-term features)

---

## Success Metrics (Live Product)

### v1 Health Indicators (Track Continuously)

| Metric | Target | Why It Matters |
|---|---|---|
| Chrome Web Store Rating | 4.0+ stars | Product quality signal |
| Free Users (Week 1) | 50-200 | Growth trajectory |
| Pro Conversion Rate | 5-10% | Revenue viability |
| Friction Completion Rate | 75%+ | Core mechanic works |
| 7-Day Retention | 40%+ | Free tier stickiness |
| 30-Day Retention (Pro) | 80%+ | Pro value confirmation |
| Churn Rate (Pro) | <5%/month | Paying user stability |
| Support Tickets | <10 per 1000 users | Product clarity |
| Critical Bugs | 0 | Data integrity |

### Decision Thresholds

**Red Flag (Act immediately):**
- Rating drops below 3.5 stars
- Crash rate > 1 per 1000 sessions
- Pro activation failures > 1%
- Pro churn > 20%/month

**Green Light (Plan v2):**
- 100+ free users
- 5%+ Pro conversion
- <10% churn
- 4.0+ star rating
- <5 critical issues

**Iterate (v1.1):**
- Top 3 feature requests from Pro users
- UX friction points from reviews
- Performance bottlenecks from telemetry

---

## Development Priorities (Locked v1 + Active Iteration)

### v1 is LOCKED — No new features to core engine
- Only critical bugfixes (crashes, data loss, security)
- Friction challenge is stable
- Analytics events are immutable

### v1.1 Hotfixes (If Needed)
Monitor user feedback for:
- **Crashes** → Deploy within 24h
- **Pro activation failures** → Deploy immediately
- **Copy/UX confusion** (top issue in reviews) → next patch
- **Performance regressions** (challenge feels slow) → optimize

### v2 Planning (Start after 100 users + stable metrics)
- Code-review all feature requests from real users
- A/B test competing feature hypotheses
- Design spec for #1 priority (likely: visual analytics)
- Maintain test coverage at 85%+
- No shipping until v1 metrics are green

### Code Quality (Non-negotiable)
- All changes require full test suite passing
- Security review for activation flow changes
- No data schema changes without migration plan
- Backwards-compatible storage updates only

---

## Engineering Discipline

### Code Quality
- Maintain 85% coverage on background.js
- All changes require green test suite
- Security review for entitlement changes
- No external dependencies beyond test harness

### Performance
- Extension should load < 500ms
- Storage queries non-blocking
- No memory leaks in long-running sessions
- Alarms accuracy +/- 1 second

### Security
- No license keys or external verification (privacy-first, trust-based model)
- No user data sent externally without explicit consent
- All PII stored only in `chrome.storage.local`
- Periodic security audit (quarterly minimum)

---

## Final Principle

ResistGate is not trying to be everything.

It is trying to be the most **effective** friction between impulse and action.

Every feature should pass this test:
> "Does this make the user feel more accountable to themselves?"

If yes, consider it.
If no, reject it.

This is what separates ResistGate from generic focus apps.
