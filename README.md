# WyChat

WyChat is a mobile-first anonymous conversation PWA.

## Important production setup

This package contains the actual client architecture, Firebase wiring, IndexedDB storage, realtime Firestore listeners, magic-link authentication, PWA shell, room routing, quotes, editing/deleting, reporting, and the supplied Flutterwave payment destinations.

Before calling a deployment production-ready, complete the server-side payment verification and harden Firestore rules for your exact threat model. The included rules are a starting point, not a substitute for a security review.

### Firebase

1. Enable Authentication → Email/Password → Email link.
2. Enable Firestore.
3. Deploy `firestore.rules`.
4. Add your authorized platform admin UIDs to server environment variables.
5. Do not put Firebase Admin credentials in browser code.

### Magic-link email

Firebase's client email-link flow uses Firebase's email action handler. The visible app never shows the raw authentication URL. For fully branded transactional email templates, configure the Firebase/Identity Platform email template or a supported custom email action handler in your Firebase project.

### Flutterwave

Starter: https://flutterwave.com/pay/7zg1w2li2vrk
Pro: https://flutterwave.com/pay/lqxanvm51vdb

Do not upgrade a plan based on a return URL. Verify transactions server-side with your Flutterwave secret key and write the verified subscription to a protected user record.

### Deployment

Deploy the directory to Vercel. `vercel.json` handles SPA and `/q/:slug` routing.

### Privacy

Anonymous room IDs are room-specific and are stored locally for continuity on a device. They are not a claim of technical untraceability. Messages are designed to expire after 30 days; local data can be lost when app data is cleared/uninstalled.

## Entitlement loop (end-to-end)

The client now completes the full loop, not just the payment destination:
1. `/pricing` requires sign-in before sending someone to a Flutterwave link (a plan can't be verified for an anonymous session).
2. On return, `app.js` reads the `transaction_id`/`status` query params, calls `/api/verify-payment`, and refreshes the plan from `/api/subscription`.
3. `document` state reflects the verified plan: ads are hidden, the free 10-room cap and custom-link lock are lifted, and message retention extends from 30 to 90 days.
No entitlement is ever granted client-side from the redirect alone — only a verified server response unlocks anything.

## Icons

All app icons are standalone files inside `public/` (`icon.svg`, `icon-192.png`, `icon-512.png`, `icon-512-maskable.png`, `apple-touch-icon.png`, `favicon.ico`) — not inside a further subfolder — so `index.html`, `manifest.json`, and `sw.js` all reference `/icon-*.png` directly (Vercel serves everything in `public/` at the site root).

## Production wiring
Firebase Admin auth, server-side Flutterwave verification, webhook handling, admin authorization, server subscription reads, duplicate transaction protection, cleanup cron, and Vercel security headers are included. See `DEPLOYMENT.md`. `vercel.json` also includes the SPA rewrite so deep links like `/q/:id` and `/pricing` don't 404 on refresh.
