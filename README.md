# ATELIER clothing store

Local VS Code project, requiring Node.js 24 or newer. No npm dependencies needed.

## Run

1. Open this folder in VS Code.
2. Copy `.env.example` to `.env`, choose your admin email and a long unique password.
3. Run `npm run dev` in the terminal.
4. Open http://localhost:3000. Admin: http://localhost:3000/admin.

If you skip `.env`, a random temporary admin password is printed in the terminal each time the server starts. Data persists in `data/store.sqlite`; sessions expire after 8 hours and restart clears sessions.

## Included

- Reference-inspired hanging garment rack, click-to-focus, front/back illustrative views, CSS perspective, keyboard accessible controls, reduced-motion support.
- Responsive catalogue, search, category filtering, sizes, saved cart, demo checkout.
- SQLite product, inventory, order and activity records. Server calculates prices and atomically reserves stock.
- Admin product creation/editing, pricing, stock, orders, fulfilment, cancellation with stock restoration, dashboard totals and activity log.
- HttpOnly SameSite cookies, scrypt credential comparison, expiring sessions, CSRF and origin checks, parameterized SQL, validation, request limits, HTML escaping, security headers.

## Important limits before production

This is a working local prototype, not a completed production security audit. Checkout is explicitly DEMO: it never collects card details or charges money. Dashboard amounts are demo order values, not received revenue. Real payments, refunds, invoices, shipping integrations, customer accounts and transactional emails are not implemented.

For live payments, choose a merchant provider such as Razorpay or Stripe; add server-created payment orders, verified signed webhooks, idempotent payment recording, reconciliation and refunds. Never mark an order paid from a browser callback or store card data. Merchant credentials must remain server-side.

Before public deployment: HTTPS reverse proxy, NODE_ENV=production, trusted proxy/origin configuration, durable shared sessions and rate limits, admin MFA and password recovery, monitoring, database backups/restore tests, personal-data retention policies and independent security review. Server currently binds only to 127.0.0.1 intentionally. SQLite is suitable for a single server; larger/multi-server deployments should use a managed database.

Admin supports front and back photo uploads (JPEG, PNG or WebP, maximum 6 MB each). Images are resized in the browser and stored locally with random filenames, protected upload routes and file signature checks. Both photos automatically appear in the interactive rack and the product's rotating two-sided preview. For the best effect use matching garment angles and transparent backgrounds. The preview simulates depth; it does not reconstruct an accurate 360-degree mesh from two photographs. A real reconstruction workflow needs a selected external AI service and credentials, or supplied GLB models. Products without uploads use original SVG illustrations in the rack and illustrative Unsplash catalogue photography. Photo cleanup, storage quotas and production image moderation/re-encoding remain deployment work.

`server.mjs` backend; `public/` frontend. No build step. `npm test` runs integration tests against a temporary isolated database. Do not commit `.env` or `data/`.

## 3D fit studio
Product dialogs now include a real WebGL procedural garment mesh with fabric folds, woven shading, directional lighting, drag rotation, front/back controls, zoom and auto rotation. Uploaded front/back images are mapped onto this generic mesh. The model is a generic tee shape for all products; it does not reconstruct garment-specific geometry, sleeves, hood or fit. Rack illustrations have additional seams, folds and fabric texture.
