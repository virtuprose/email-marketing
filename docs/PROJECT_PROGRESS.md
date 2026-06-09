# Virtuprose Sales Assistant Project Progress

Last updated: 2026-06-09

## Product State

Virtuprose Sales Assistant is an internal single-owner platform for:

- Adding/importing leads.
- Choosing a Virtuprose service/offer.
- Creating email and WhatsApp campaigns.
- Sending approved Meta WhatsApp templates.
- Receiving WhatsApp replies through Meta webhooks and email replies through either the inbound webhook fallback or IMAP polling once inbox credentials are configured.
- Using AI Assistant to classify replies, draft safe responses, auto-reply only when rules allow it, and surface hot leads.
- Using AI Assistant to handle inbound and outbound enquiries with short human-style English/Arabic replies, persistent conversation memory, lead qualification, contact capture, and meeting booking from approved manual slots.
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
- Short sales conversation behavior for inbound and outbound replies, including same-language English/Arabic response handling.
- Persistent conversation memory through `conversations` and `conversation_messages`; WhatsApp history is tied to phone number.
- Sales-stage tracking for new enquiry, interested, qualified lead, meeting requested, meeting booked, not interested, and follow-up required.
- Contact-detail capture and missing-field tracking for name, phone, email, company, service/product needed, and preferred meeting time.
- Manual meeting slot management in `/ai-assistant` and meeting booking from inbox/WhatsApp inbox.
- Generic inbound conversation API for website chat and optional Instagram integration at `/api/inbound/conversations`.
- `ai-reply-sending` BullMQ queue for delayed safe AI replies.
- Lead-level owner takeover: **AI off for this lead**.
- Unified conversation memory for recent inbound and outbound messages before drafting.
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
- Hostinger SMTP for `info@virtuprose.com`
- Hostinger IMAP for `info@virtuprose.com`

Pending/verify on VPS:

- Confirm the test email sent from `info@virtuprose.com` reaches the owner inbox.
- Confirm one real incoming email to `info@virtuprose.com` appears in Replies through IMAP.
- Confirm SPF, DKIM, and DMARC are correct before email volume.

## What Works Now

- Owner can open the dashboard at `https://sales.virtuprose.com`.
- App requires Basic Auth.
- Database and Redis are connected.
- Background worker is running.
- Meta WhatsApp credentials are present.
- WhatsApp sending is in live mode.
- AI Assistant is available from the sidebar.
- AI can classify replies, create short human-style drafts, queue Auto Safe replies when all safety rules pass, and respond in English or Arabic based on customer language.
- AI stores inbound and outbound conversation history for future context.
- AI can identify missing contact details, update sales stage, and create meeting requests.
- Owner can generate the default weekly meeting availability in `/ai-assistant` or add manual meeting slots, then book available slots from inbox pages.
- Hot, pricing, and meeting replies hand off to the owner and send alert emails to `moh@virtuprose.com`.
- Confirmed AI meeting bookings send a configurable owner email alert when the notification option is enabled.
- SMTP and IMAP authentication are verified for `info@virtuprose.com`.
- Existing UI and workflow pages are available.

## What Is Not Fully Ready Yet

### AI Replies

Implemented:

- AI Assistant settings stored under `ai_assistant_settings`.
- Default mode is **Auto Safe**.
- Safe replies can auto-send only when confidence is high, no handoff/risk flags exist, the lead is not paused/suppressed, duplicate checks pass, caps are available, and the WhatsApp 24-hour service window is open when the channel is WhatsApp.
- Complaint, unsubscribe, unclear, low-confidence, risky, or owner-taken-over conversations create drafts or owner review instead of auto-sending.
- Hot, pricing, and meeting conversations notify the owner while still allowing a safe short reply when the draft is eligible.
- AI uses unified conversation history instead of only recent raw channel records.
- AI can offer only stored available meeting slots and otherwise asks for the customer's preferred time.
- Default availability generation creates 30-minute Asia/Kuwait slots for Sunday-Thursday 10:00 AM-6:00 PM, Saturday 12:30 PM-8:00 PM, and Friday off.

Pending:

- Test one live inbound WhatsApp reply and confirm AI classification plus the send/block decision.
- Confirm owner hot-lead alert delivery in the `moh@virtuprose.com` inbox.
- Confirm one meeting-booked alert email reaches the configured owner inbox.

### WhatsApp Inbound Replies

Configured route:

```text
https://sales.virtuprose.com/api/webhooks/meta/whatsapp
```

Pending/verify:

- Confirm the Meta App Dashboard callback is still subscribed to message and status events after the app changes.
- Send a test WhatsApp reply to confirm webhook delivery, AI classification, and service-window handling.
- Confirm a second message from the same WhatsApp number loads the previous conversation history in `/whatsapp/inbox`.

### Email Reply Receiving

Implemented:

- IMAP polling worker that reads unread inbox replies and passes them into the existing inbound reply workflow.
- `/api/inbound/replies` webhook remains available as an advanced fallback.

Pending:

- Send one real email to `info@virtuprose.com` and confirm it appears in Replies.

### Email Sending

Pending:

- Confirm SPF, DKIM, and DMARC for the sending domain.
- Send only small test batches first.
- Keep sender reputation checks active before volume.
- Confirm hot-lead owner alert emails reach `moh@virtuprose.com`.

### Production Safety

Pending:

- Domain and HTTPS are active at `https://sales.virtuprose.com`.
- Confirm Meta billing/payment and message limits.
- Confirm WhatsApp number quality rating.
- Keep daily caps low until reply quality and opt-out rate are known.
- Add recurring database backup job.
- Add manual meeting slots before relying on AI meeting suggestions.

## Recommended Next Steps

1. Test one inbound WhatsApp reply and confirm it appears in Replies.
2. Confirm AI Assistant classifies it and either drafts or safely auto-replies.
3. Send a pricing/meeting-style reply and confirm it becomes a hot lead.
4. Confirm owner alert emails reach `moh@virtuprose.com`.
5. Send one real email to `info@virtuprose.com` and confirm it appears automatically in Replies.
6. Add a daily Postgres backup.
7. Keep message caps low while testing.
