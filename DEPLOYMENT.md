# WyChat — Vercel + Firebase + Flutterwave deployment

## 1. Firebase Admin credentials
Create a Firebase Admin service account and put its server credentials in Vercel Environment Variables.

## 2. Vercel variables
Add these to Production (and Preview/Development if needed):

- FIREBASE_PROJECT_ID
- FIREBASE_CLIENT_EMAIL
- FIREBASE_PRIVATE_KEY
- FLW_SECRET_KEY
- FLW_SECRET_HASH
- CRON_SECRET

Do NOT prefix these with `NEXT_PUBLIC_` and do not place them in browser JavaScript.

## 3. Flutterwave
Hosted payment links are only destinations. WyChat does not unlock a plan because the browser returns from Flutterwave.

The server verification endpoint checks:
- authenticated Firebase UID
- Flutterwave transaction status
- exact expected amount
- exact expected currency
- plan
- transaction uniqueness

For webhook processing, point Flutterwave's webhook to:

`https://YOUR-DOMAIN/api/flutterwave-webhook`

Set the webhook secret hash to the same value as `FLW_SECRET_HASH`.

## 4. Subscription model
A verified payment grants a 30-day entitlement. The server is authoritative. Frontend/localStorage cannot upgrade an account.

## 5. Cleanup
`vercel.json` schedules `/api/cleanup` once daily (3am UTC) via Vercel Cron, which calls it with `GET` and an automatic `Authorization: Bearer <CRON_SECRET>` header. Just set `CRON_SECRET` in env vars — don't call this endpoint manually with a different header name.

Note: Vercel's free Hobby plan only allows cron jobs to run once per day — hourly schedules are rejected. If you're on Hobby and want more frequent cleanup, either upgrade to Pro, or point a free external scheduler (e.g. cron-job.org, GitHub Actions on a schedule) at this same URL with the same `Authorization: Bearer` header more often; the endpoint itself doesn't care who calls it as long as the secret matches.

## 6. Important limitation of hosted payment links
The supplied hosted links do not inherently know which Firebase account is paying. The strongest account-binding flow is to create a server-generated Flutterwave checkout/session with metadata containing the authenticated UID and plan. If you keep the supplied static hosted links, the webhook/verification flow must require an explicit, authenticated post-payment transaction verification step and must never trust client-provided plan/amount.

Firebase ID tokens sent to the server are verified with Firebase Admin before subscription changes.


## Admin UID

Only your platform administrator UID goes into `ADMIN_UIDS`.

Get it from Firebase Console → Authentication → Users → your administrator account → User UID.

Do not put ordinary receiver UIDs into Vercel.

## Important payment note

The supplied static Flutterwave hosted links are not account-aware. The secure backend therefore:
1. authenticates the currently signed-in receiver using a Firebase ID token;
2. verifies the transaction directly with Flutterwave;
3. checks exact plan/currency/amount;
4. prevents the same transaction from being applied to two accounts;
5. writes the subscription only from the server.

For the strongest possible account-to-payment binding, replace static hosted links with server-created Flutterwave checkout sessions whose metadata includes the authenticated Firebase UID. Never accept a client-supplied UID as proof of ownership.
