# Paddle Checkout With Instant ResistGate Activation

## Goal

Make a ResistGate Pro purchase feel like one continuous action while keeping payment and entitlement decisions on trusted server infrastructure.

The first release activates the current extension installation only. It does not add accounts, cross-device restoration, license keys, or manual activation codes.

## User flow

1. The user selects Monthly, Yearly, or Lifetime in ResistGate.
2. ResistGate generates and stores a 256-bit random install credential if it does not already have one. The extension posts the selected plan, its extension ID, stable device ID, and install credential to the checkout-session API over HTTPS. The API validates the `chrome-extension://` origin, stores only the credential hash, rate-limits session creation, and creates a 30-minute `approval_pending` session.
3. ResistGate opens the approved `orlandoascanio.com` pricing page with only the opaque checkout ID and selected plan. The page validates the pending session and immediately opens the selected Paddle Checkout overlay.
4. Paddle collects the billing email and payment details.
5. Paddle sends signed webhook events to `/api/webhooks`.
6. The server verifies the raw request body, treats Paddle custom data only as a lookup pointer, loads the server-created checkout session, and validates the purchased product and price against the session and a server-side allowlist.
7. The pricing page polls the checkout-session status. When the webhook marks it active, the page requests a five-minute activation token.
8. The page sends the activation token to the exact extension ID recorded in the checkout session.
9. The extension exchanges the signed token with `/api/entitlement/activate-install`, proving possession of the same locally stored install credential.
10. The server verifies the activation token, install-credential hash, device ID, extension ID, session status, and effective installation grant, then returns `pro: true`.
11. ResistGate records the verified entitlement state, sets Pro locally, refreshes blocking rules, and opens settings with an activation-success state.
12. The website shows that Pro is active. No code copying, login, or manual refresh is required.

## Why checkout stays on the website

Paddle.js is remotely hosted executable code and Paddle Checkout requires an approved web origin. Chrome Manifest V3 extension pages cannot safely use this model without conflicting with extension content-security and Chrome Web Store remote-code requirements. The website is therefore the payment surface; the trusted external-message bridge makes the transition feel native.

## Architecture

### Extension

- The plan comparison offers explicit Monthly, Yearly, and Lifetime actions. Generic upgrade actions default to Yearly. An extension checkout session is bound to that selected plan; the website does not silently switch prices inside the same session. Choosing a different plan requires returning to ResistGate or creating a fresh session.
- `openPricingPage` validates the plan, reads the canonical installation record, creates the server checkout session, and puts only its opaque checkout ID and selected plan in the website URL.
- `activateProFromWebsite` rejects missing activation tokens.
- The external message handler does not grant Pro directly. It calls the server activation endpoint with the signed activation token and locally stored install credential, and only grants Pro when the response returns `pro: true`.
- The installation sanitizer preserves the install credential and entitlement metadata needed for periodic sync.
- Startup and a six-hour Chrome alarm perform best-effort entitlement sync when an install credential exists. A transient network failure preserves the last verified state; a verified inactive grant revokes Pro; an invalid credential clears local billing credentials.

### Website and API

- A Paddle checkout-session route accepts only the production ResistGate extension origin, validates extension metadata and the selected plan, and creates an `approval_pending` session before opening checkout.
- Paddle Checkout receives only public price IDs plus minimal custom data: checkout ID and source. Device ID, extension ID, and secrets never enter Paddle or the browser URL.
- The webhook remains the only payment source of truth.
- `transaction.completed` handles initial activation, including Lifetime purchases.
- Subscription lifecycle events update recurring access: created, activated, updated, canceled, paused, resumed, past due, and trialing. `active`, `trialing`, and `past_due` keep access; `paused` and `canceled` revoke it.
- Each session stores separate last-event IDs and timestamps for transaction activation and subscription lifecycle state. Duplicate events are ignored, older subscription events cannot overwrite newer subscription state, and a valid `transaction.completed` remains independently monotonic even if a subscription event arrived first. Subscription events may record state before `transaction.completed`, but only a completed transaction may perform initial activation.
- Effective Pro for an installation is true when any grant for that device is active. A canceled monthly subscription cannot revoke a separate Lifetime or legacy active grant.

## Data model

Extend the existing tables rather than introduce a parallel billing model.

### `extension_checkout_sessions`

- Keep the current checkout ID, product, billing cycle, extension ID, device ID, status, activation, and install-token fields.
- Make email nullable for Paddle sessions because Paddle collects it after session creation. Email restoration remains out of scope and is not required for current-install activation.
- Add nullable provider, Paddle customer, transaction, subscription, price, raw subscription-status, transaction-event-ID/time, and subscription-event-ID/time fields.
- Keep existing PayPal fields for Amethyst and legacy ResistGate purchases.

### `entitlements`

- Existing email entitlements remain intact for PayPal and future restoration work.
- Paddle current-install access is represented by provider-specific checkout-session grants, avoiding accidental revocation when the same email has a Lifetime or PayPal grant.
- Lifetime transaction grants remain active permanently unless refunds are implemented later.

## Security boundaries

- Only `https://www.orlandoascanio.com` and the apex origin may message the extension.
- Origin trust alone is insufficient: the extension must exchange a short-lived signed activation token and prove possession of its random install credential.
- Activation tokens are bound to checkout ID, product slug, extension ID, and device ID and expire after five minutes.
- Checkout-session and activation requests accept only `chrome-extension://<production ResistGate ID>` and validate that origin against the extension ID stored in the session. Production CORS configuration explicitly allows that origin.
- The extension CSP allows HTTPS connections to `orlandoascanio.com`; Paddle.js itself remains exclusively on the website.
- The webhook reads `request.text()` and calls `paddle.webhooks.unmarshal()` before any event is trusted.
- Client-controlled custom data never determines the purchased plan. The webhook derives the price and product from verified Paddle line items and compares them to the server-side catalog and checkout session.
- API keys, webhook secrets, entitlement secrets, and install credentials never enter pricing-page JavaScript, URLs, logs, or Paddle custom data.
- Checkout and webhook handlers log only non-sensitive identifiers and state.
- Pending checkout sessions expire after 30 minutes. Status and activation endpoints do not return billing email or device identifiers.
- Activation is retry-idempotent: replaying a still-valid activation token with the same install credential can only confirm the same installation grant and never rotates or invalidates the credential.
- Checkout-session creation is limited per device and IP. Status, activation-token, activation, and sync routes are limited per checkout or credential hash and return `429` for bursts. The random checkout ID, signed activation token, and install credential provide authentication; Origin and CORS are defense in depth only.

## Error handling

- If checkout-session creation fails, do not open Paddle; show a retryable error.
- If a pending checkout session is expired, create a new session rather than reopening the old checkout.
- If payment succeeds before the webhook arrives, show a confirming state and keep polling.
- Poll with a bounded interval and a clear manual retry action after timeout.
- If website-to-extension messaging fails, keep the checkout active and offer `Activate ResistGate` without requiring another payment.
- If activation-token exchange fails, keep local tier unchanged and surface the server error.
- If periodic sync reports another active grant for the same device, keep Pro even when the current subscription was canceled.
- Webhook processing failures return non-2xx so Paddle retries.
- Duplicate and out-of-order subscription events converge through event-ID and event-time guarded updates.

## Testing

### Extension tests

- Pricing URL contains the opaque checkout ID but not the extension ID or device ID.
- Monthly, Yearly, and Lifetime actions create sessions for only their validated plan; generic upgrade actions default to Yearly.
- External activation without a token is rejected.
- A failed server exchange cannot grant Pro.
- A verified exchange confirms the stored install credential and grants Pro.
- Startup and periodic sync can revoke recurring Pro when the server returns verified inactive, while transient failures preserve state.
- The activation request has the expected extension origin, and expired or replayed activation tokens cannot silently activate another installation.

### Website tests and checks

- Checkout session validation rejects missing extension metadata.
- Checkout session validation rejects the wrong extension origin, invalid plans, and expired sessions.
- Paddle Checkout receives the checkout ID in custom data and preserves it in the success URL without exposing device metadata.
- Signed `transaction.completed` activates the validated provider grant and checkout session.
- Altered custom data, the wrong product, or the wrong price cannot activate the session.
- Invalid signatures never mutate data.
- Duplicate, reverse-ordered, and subscription-before-transaction events converge without stale state overwrites.
- A canceled subscription does not revoke a separate active Lifetime grant for the same installation.
- Pricing page polling triggers the existing activation card automatically.
- Lost activation responses can be retried idempotently with the same install credential.
- `npm run lint`, `npm run build`, signed webhook smoke tests, and the complete ResistGate Vitest suite pass.

## Out of scope

- Cross-device restore and account management.
- Customer portal and cancellation UI.
- Refund and chargeback automation.
- Migrating Amethyst away from PayPal.
- Processing a real paid transaction during automated verification.
