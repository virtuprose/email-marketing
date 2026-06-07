# Virtuprose Sales Assistant Project Progress

Last updated: 2026-06-08

## Product State

Virtuprose Sales Assistant is an internal single-owner platform for:

- Adding/importing leads.
- Choosing a Virtuprose service/offer.
- Creating email and WhatsApp campaigns.
- Sending approved Meta WhatsApp templates.
- Receiving WhatsApp replies through Meta webhooks and email replies through either the inbound webhook fallback or IMAP polling once inbox credentials are configured.
- Using AI Assistant to classify replies, draft safe responses, auto-reply only when rules allow it, and surface hot leads.
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
- AI Assistant page with reply modes, prompts, knowledge base, safety rules, test tool, and activity log.
- Inbox/replies area with AI classification, draft, safe auto-reply decisioning, and owner handoff.
- `ai-reply-sending` BullMQ queue for delayed safe AI replies.
- Lead-level owner takeover: **AI off for this lead**.
- Conversation memory for the last 5 same-channel messages before drafting.
- Hot lead owner alert logic for `moh@virtuprose.com`.
- IMAP polling worker for email reply ingestion, gated by IMAP env vars.
- Hot Leads view for owner handoff.
- Help/FAQ page with usage and safety rules.
- Docker production setup for app, worker, Postgres, and Redis.
- VPS deployment on `31.97.213.79`.
- Public app route on `https://sales.virtuprose.com` with HTTPS.
- Health endpoint verified from outside the VPS.
- OpenAI configured on production for campaign and reply drafting.

## VPS Deployment Status

- App path: `/opt/virtuprose-sales-assistant`
- Docker project: `virtuprose-sales-assistant`
- App service: running
- Worker service: running
- Postgres service: healthy
- Redis service: healthy
- Public URL: `https://sales.virtuprose.com`
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
- OpenAI API key and `gpt-4.1-mini` reply/campaign models

Missing on VPS:

- SMTP password values
- IMAP inbox credentials for automatic email reply receiving
- Live owner alert email delivery until SMTP is configured and email dry-run is off

## What Works Now

- Owner can open the dashboard at `https://sales.virtuprose.com`.
- App requires Basic Auth.
- Database and Redis are connected.
- Background worker is running.
- Meta WhatsApp credentials are present.
- WhatsApp sending is in live mode.
- AI Assistant is available from the sidebar.
- AI can classify replies, create drafts, and queue Auto Safe replies when all safety rules pass.
- Hot, pricing, and meeting replies hand off to the owner and try to alert `moh@virtuprose.com`.
- Existing UI and workflow pages are available.

## What Is Not Fully Ready Yet

### AI Replies

Implemented:

- AI Assistant settings stored under `ai_assistant_settings`.
- Default mode is **Auto Safe**.
- Safe replies can auto-send only when confidence is high, no handoff/risk flags exist, the lead is not paused/suppressed, duplicate checks pass, caps are available, and the WhatsApp 24-hour service window is open when the channel is WhatsApp.
- Unsafe, hot, pricing, meeting, complaint, unsubscribe, unclear, low-confidence, or owner-taken-over conversations create drafts and owner handoff instead of auto-sending.

Pending:

- Test one live inbound WhatsApp reply and confirm AI classification plus the send/block decision.
- Add SMTP credentials before relying on owner email alerts for hot leads.

### WhatsApp Inbound Replies

Configured route:

```text
https://sales.virtuprose.com/api/webhooks/meta/whatsapp
```

Pending/verify:

- Confirm the Meta App Dashboard callback is still subscribed to message and status events after the app changes.
- Send a test WhatsApp reply to confirm webhook delivery, AI classification, and service-window handling.

### Email Reply Receiving

Implemented:

- IMAP polling worker that reads unread inbox replies and passes them into the existing inbound reply workflow.
- `/api/inbound/replies` webhook remains available as an advanced fallback.

Pending:

- Add `IMAP_HOST`, `IMAP_USER`, `IMAP_PASS`, and related IMAP env values on the VPS.
- Restart the worker and confirm one real email reply appears in Replies.

### Email Sending

Pending:

- Add SMTP credentials.
- Confirm SPF, DKIM, and DMARC for the sending domain.
- Send only small test batches first.
- Keep sender reputation checks active before volume.
- Disable email dry-run only after a real test inbox receives mail.
- Confirm hot-lead owner alert emails reach `moh@virtuprose.com`.

### Production Safety

Pending:

- Domain and HTTPS are active at `https://sales.virtuprose.com`.
- Confirm Meta billing/payment and message limits.
- Confirm WhatsApp number quality rating.
- Keep daily caps low until reply quality and opt-out rate are known.
- Add recurring database backup job.

## Recommended Next Steps

1. Test one inbound WhatsApp reply and confirm it appears in Replies.
2. Confirm AI Assistant classifies it and either drafts or safely auto-replies.
3. Send a pricing/meeting-style reply and confirm it becomes a hot lead.
4. Add SMTP credentials and confirm owner alert emails reach `moh@virtuprose.com`.
5. Add IMAP credentials and confirm one real email reply appears automatically.
6. Add a daily Postgres backup.
7. Keep message caps low while testing.
