# Virtuprose Sales Assistant Project Progress

Last updated: 2026-06-07

## Product State

Virtuprose Sales Assistant is an internal single-owner platform for:

- Adding/importing leads.
- Choosing a Virtuprose service/offer.
- Creating email and WhatsApp campaigns.
- Sending approved Meta WhatsApp templates.
- Receiving replies through webhook routes once HTTPS is connected.
- Using AI to classify replies and surface hot leads after OpenAI is configured.
- Managing safety rules, opt-outs, and do-not-contact records.

## Completed

- Next.js dashboard with simplified owner-friendly UI.
- Lead import, CSV guidance, and downloadable example CSV.
- Lead database with email and WhatsApp fields.
- Offer/service library.
- Email campaign builder and queue foundation.
- Meta WhatsApp Cloud API migration from Twilio.
- WhatsApp template storage, approval submission, status sync, test-send flow, and campaign flow.
- WhatsApp safety gates for consent, opt-out, STOP language, send caps, and owner approval.
- Inbox/replies area with AI classification/draft workflow hooks.
- Hot Leads view for owner handoff.
- Help/FAQ page with usage and safety rules.
- Docker production setup for app, worker, Postgres, and Redis.
- VPS deployment on `31.97.213.79`.
- Public app route on `http://31.97.213.79`.
- Health endpoint verified from outside the VPS.

## VPS Deployment Status

- App path: `/opt/virtuprose-sales-assistant`
- Docker project: `virtuprose-sales-assistant`
- App service: running
- Worker service: running
- Postgres service: healthy
- Redis service: healthy
- Public URL: `http://31.97.213.79`
- Basic Auth: enabled
- Credential note: `/Users/muhammadzaid/.codex/virtuprose-sales-assistant-vps-credentials.txt`

Detailed deployment notes are in `docs/VPS_DEPLOYMENT.md`.

## Current Environment Status

Set on VPS:

- Database connection
- Redis connection
- Basic Auth
- Inbound webhook secret
- Meta WhatsApp Cloud API credentials
- Meta app secret
- Meta webhook verify token
- Meta signature validation
- Meta WhatsApp live mode

Missing on VPS:

- `OPENAI_API_KEY`
- SMTP password values
- Real domain
- HTTPS certificate
- Meta webhook callback configured to an HTTPS URL

## What Works Now

- Owner can open the dashboard at `http://31.97.213.79`.
- App requires Basic Auth.
- Database and Redis are connected.
- Background worker is running.
- Meta WhatsApp credentials are present.
- WhatsApp sending is in live mode.
- Existing UI and workflow pages are available.

## What Is Not Fully Ready Yet

### AI Replies

Pending:

- Add `OPENAI_API_KEY` to `/opt/virtuprose-sales-assistant/.env.production`.
- Recreate the app and worker containers after adding the key.
- Test one inbound reply and confirm AI classification.
- Decide whether AI replies must be manually approved or can auto-send for safe replies.

Without `OPENAI_API_KEY`, the app can still use fallback logic in some places, but full AI reply quality is not active.

### WhatsApp Inbound Replies

Pending:

- Add a real domain, for example `sales.virtuprose.com`.
- Enable HTTPS with Let's Encrypt.
- Set `APP_BASE_URL` to the HTTPS URL.
- Configure Meta webhook callback:

```text
https://sales.virtuprose.com/api/webhooks/meta/whatsapp
```

- Subscribe the WABA webhook to message and status events.
- Send a test WhatsApp reply to confirm webhook delivery.

### Email Sending

Pending:

- Add SMTP credentials.
- Confirm SPF, DKIM, and DMARC for the sending domain.
- Send only small test batches first.
- Keep sender reputation checks active before volume.

### Production Safety

Pending:

- Add a domain and HTTPS.
- Confirm Meta billing/payment and message limits.
- Confirm WhatsApp number quality rating.
- Keep daily caps low until reply quality and opt-out rate are known.
- Add recurring database backup job.

## Recommended Next Steps

1. Add a domain/subdomain to the VPS.
2. Enable HTTPS.
3. Add `OPENAI_API_KEY` on the VPS.
4. Configure Meta webhook callback URL.
5. Test one inbound WhatsApp reply.
6. Test one AI reply draft.
7. Test one approved WhatsApp template send to your own number.
8. Add SMTP only after WhatsApp is stable, unless email testing is urgent.
9. Add a daily Postgres backup.
10. Keep message caps low while testing.
