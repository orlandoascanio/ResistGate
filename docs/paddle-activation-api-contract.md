# Paddle Instant Activation — API Contract

The extension side of `docs/superpowers/specs/2026-07-12-paddle-instant-activation-design.md` is implemented in
`background.js`. This document specifies exactly what `orlandoascanio.com` must implement for the flow to work.

The extension is a dumb client on purpose: it never decides who is Pro. It proves possession of a secret it generated,
and the server tells it the answer.

## Identifiers

| Name | Origin | Lifetime | Notes |
|---|---|---|---|
| `deviceId` | Extension, opaque UUID | Permanent per install | Not a user identifier. Never sent to Paddle or put in a URL. |
| `installCredential` | Extension, 256-bit random hex (64 chars) | Created on first checkout, permanent after | Bearer secret. The server stores **only its hash**. Never in a URL, log, or Paddle custom data. |
| `checkoutId` | Server | 30 minutes while `approval_pending` | The only billing identifier allowed in the pricing-page URL. |
| `activationToken` | Server | 5 minutes | Signed; bound to checkout ID, product slug, extension ID, and device ID. |

## Endpoints

All three accept `POST` with `Content-Type: application/json` from `Origin: chrome-extension://<production ResistGate ID>`.
Production CORS must allow that exact origin. Origin is defense in depth only — the random checkout ID, signed activation
token, and install credential are the actual authentication.

### 1. `POST /api/checkout/session`

Creates the `approval_pending` session **before** Paddle opens.

```jsonc
// request
{ "plan": "monthly" | "yearly" | "lifetime",
  "source": "extension",
  "extensionId": "abcdef…",
  "deviceId": "uuid",
  "installCredential": "<64 hex chars>" }

// 200
{ "checkoutId": "chk_…", "plan": "yearly", "expiresAt": 1752345678901 }
```

Must reject: unknown plans, a mismatch between `extensionId` and the request origin, and missing extension metadata.
Rate-limit per device and per IP. Store only `hash(installCredential)`.

The extension then opens `https://www.orlandoascanio.com/en/pricing?source=extension&plan=<plan>&checkout=<checkoutId>`
and does nothing else. The page validates the pending session and opens the Paddle overlay for that plan immediately.

### 2. `POST /api/entitlement/activate-install`

Called by the extension after the pricing page hands it an activation token.

```jsonc
// request
{ "activationToken": "…", "installCredential": "<64 hex>", "deviceId": "uuid", "extensionId": "abcdef…" }

// 200 — the ONLY response that grants Pro
{ "pro": true, "plan": "yearly", "status": "active", "checkoutId": "chk_…" }
```

Verify, in order: token signature and expiry; `hash(installCredential)` matches the session; `deviceId` and `extensionId`
match the session; session status is active; the installation has an effective grant. Anything else returns non-2xx with
`{ "error": "<safe message>" }` — the extension surfaces that string verbatim, so it must be user-readable and must never
contain identifiers.

Must be retry-idempotent: replaying a still-valid token with the same credential confirms the same grant and never
rotates or invalidates the credential.

### 3. `POST /api/entitlement/install-status`

Periodic reconciliation. Called on startup (throttled to once an hour) and on a six-hour alarm.

```jsonc
// request
{ "installCredential": "<64 hex>", "deviceId": "uuid", "extensionId": "abcdef…" }

// 200
{ "pro": true | false, "plan": "yearly", "status": "active" }
```

`pro` is true when **any** grant for that device is active — a canceled monthly subscription must not revoke a separate
Lifetime or legacy grant.

**Status codes matter here.** The extension treats them as follows:

| Response | Extension behavior |
|---|---|
| `200 { pro: true }` | Ensure Pro locally. |
| `200 { pro: false }` | Revoke Pro locally. |
| `401` / `403` | Credential is invalid: wipe local credential and entitlement, drop to Free. |
| `429`, `5xx`, timeout, network failure | **Preserve** the last verified state. |

Never return `401`/`403` for a transient condition. A `403` during an outage would sign paying users out.

## Webhook

`/api/webhooks` stays the only payment source of truth. It reads `request.text()` and calls
`paddle.webhooks.unmarshal()` before trusting anything. Paddle custom data carries only `{ checkoutId, source }` and is
treated as a lookup pointer, never as the purchased plan — derive price and product from verified line items and compare
them to the server catalog and the stored session.

`transaction.completed` performs initial activation (including Lifetime). Subscription lifecycle events update recurring
access: `active`, `trialing`, `past_due` keep access; `paused`, `canceled` revoke it. Guard updates by event ID and event
time so duplicates and out-of-order deliveries converge. Processing failures must return non-2xx so Paddle retries.

## What the pricing page does

1. Read `checkout` and `plan` from the URL; validate the pending session; open the Paddle overlay.
2. Poll session status. When the webhook marks it active, request a five-minute activation token.
3. `chrome.runtime.sendMessage(<extension id from the session>, { action: 'activateProFromWebsite', activationToken })`.
4. If that message fails, keep the checkout active and show an **Activate ResistGate** button that retries step 3. Never
   ask for a second payment.

The page may also send `{ action: 'getActivationState' }` to check the extension is reachable before promising instant
activation. It returns `{ success: true, installed: true, pro }` and no secrets.

## Non-negotiables

- An external message alone cannot grant Pro. Without a token that the server verifies, the extension stays Free.
- API keys, webhook secrets, entitlement secrets, and install credentials never enter pricing-page JavaScript, URLs,
  logs, or Paddle custom data.
- Status and activation endpoints never return billing email or device identifiers.
