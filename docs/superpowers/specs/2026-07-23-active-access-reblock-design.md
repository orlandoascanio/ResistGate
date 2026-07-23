# Active Access and Re-block Now

## Goal

Give every ResistGate user a direct way to see which blocked sites are temporarily open and restore a block before the access window expires.

This is a Free-tier improvement to the existing temporary-access flow. It does not add new access rules, history, analytics, or settings.

## User flow

1. The user completes a challenge or manual override and receives temporary access to a blocked domain.
2. The popup shows an **Active access** section above **Currently Blocked**.
3. Each active row shows the domain, a live remaining-time countdown, and a **Re-block now** button.
4. Selecting **Re-block now** removes that domain's temporary-access grant, cancels its expiry alarm, and immediately reapplies blocking rules.
5. The popup removes the row and announces that the domain is blocked again.
6. When the final grant is revoked or expires, the entire section is hidden.

## Architecture

### Background

- `getActiveTemporaryAccess` returns only sanitized, unexpired grants for domains that are still in the blocklist as `{ domain, grantedAt, expiresAt, duration }` records sorted by nearest expiry.
- `revokeTemporaryAccess` normalizes and validates the requested domain, confirms that both an active grant and its blocklist entry exist, removes the grant, and queues a serialized blocking-rule update. The existing rule refresh synchronizes alarms, so a successful update also clears the matching `resistgate-access-expire-*` alarm.
- The shared rule queue gains an opt-in failure-propagation path for request/response handlers. Its default behavior continues logging and recovering the queue for fire-and-forget listeners, while the revoke action can report a failed immediate re-block instead of claiming success.
- If that immediate rule refresh fails, the action restores the original grant and runs a best-effort reconciliation refresh before returning an error. The popup therefore retains an access row unless the stored grant was removed and the blocking rule was successfully reapplied. Retrying the action is safe.
- Both actions use the existing internal message response shape and are available to Free and Pro users.
- Revoking an already expired or missing grant returns a clear failure rather than claiming a block changed.

### Popup

- The Active access section is present in markup but hidden by default.
- Popup startup requests active grants independently from settings so temporary-access state stays behind the background API.
- A one-second interval updates visible countdowns without sending repeated background messages.
- When a countdown reaches zero, the popup refreshes active grants so expired storage is normalized and the section disappears.
- Re-block buttons are labeled with their domain for assistive technology and are disabled while their request is in flight.
- Success and failure messages use the popup's existing announcement system.

## Error handling

- Invalid or missing domains are rejected by the background handler.
- A missing active grant or removed blocklist entry produces an explicit error and causes the popup to refresh its view.
- Storage or rule-update failures use `{ success: false, error }`; rule-update failure restores the grant and reconciles its alarm, while the popup keeps the row visible and shows the error.
- The popup clears its countdown interval when no grants remain and when the document unloads.

## Testing

- Background integration coverage grants access, retrieves it, revokes it, verifies storage removal, verifies alarm removal, and confirms the domain is blocked again.
- Background coverage confirms invalid and missing grants fail without changing unrelated grants.
- Background coverage forces a rule-update failure and verifies that the original grant is restored for a safe retry.
- Popup coverage verifies countdown formatting and accessible copy plus request wiring, in-flight button disabling, success removal, failure retention, expiry refresh, and interval cleanup.
- The complete test suite and coverage thresholds must pass.

## Changelog

The Unreleased section records the feature under **Added (Free)** in user-facing language.

## Out of scope

- Reopening or undoing a revoked grant.
- Revoking every active grant at once.
- Access history or outcome analytics.
- Changing temporary-access duration from the popup.
- Any Pro-only behavior.
