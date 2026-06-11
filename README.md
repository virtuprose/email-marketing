# Virtuprose AI Email Sales Agent

Internal single-user product for importing leads, managing suppression/compliance data, preparing Virtuprose offers, generating reviewed AI-assisted email campaign drafts, sending compliant email campaigns, running Meta WhatsApp Cloud API template campaigns, and using a bilingual AI sales assistant to qualify enquiries, collect contact details, book meetings from approved slots, safely auto-reply, and hand off hot leads.

## Current Deployment

The app is deployed on the VPS at:

```text
https://sales.virtuprose.com
```

Deployment details:

- VPS: `root@31.97.213.79`
- App path: `/opt/virtuprose-sales-assistant`
- Docker project: `virtuprose-sales-assistant`
- Public route: Nginx on port `80`
- Internal app port: `127.0.0.1:3004`
- Data: Docker volumes for Postgres and Redis
- Credentials note on owner machine: `/Users/muhammadzaid/.codex/virtuprose-sales-assistant-vps-credentials.txt`

Read:

- `docs/VPS_DEPLOYMENT.md` for deployment, backup, and redeploy commands.
- `docs/PROJECT_PROGRESS.md` for current progress and pending production items.
- `docs/CUSTOM_HTML_EMAIL_DESIGNS.md` for preparing, uploading, previewing, testing, and selecting premium HTML email wrappers.

## Local Setup

```bash
npm install
docker compose up -d
cp .env.example .env
npm run db:migrate
npm run db:seed
npm run dev
```

Open `http://localhost:3000`.

When `BASIC_AUTH_USER` and `BASIC_AUTH_PASSWORD` are set, the app uses HTTP Basic auth for the single owner account.

If Docker is not running but Homebrew Postgres is available, create a local database and update `.env`:

```bash
psql -h localhost -p 5432 -d postgres -c "DO \\$\\$ BEGIN IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'email_agent') THEN CREATE ROLE email_agent LOGIN PASSWORD 'email_agent' CREATEDB; END IF; END \\$\\$;"
createdb -h localhost -p 5432 -O email_agent email_agent
psql -h localhost -p 5432 -d postgres -c "ALTER DATABASE email_agent OWNER TO email_agent;"
```

Then use:

```bash
DATABASE_URL="postgresql://email_agent:email_agent@localhost:5432/email_agent?schema=public"
REDIS_URL="redis://localhost:6379"
BASIC_AUTH_USER="owner"
BASIC_AUTH_PASSWORD="local-dev-password"
OPENAI_API_KEY=""
OPENAI_CAMPAIGN_MODEL="gpt-4.1-mini"
OPENAI_REPLY_MODEL="gpt-4.1-mini"
INBOUND_WEBHOOK_SECRET=""
IMAP_HOST=""
IMAP_PORT="993"
IMAP_USER=""
IMAP_PASS=""
IMAP_SECURE="true"
EMAIL_REPLY_POLL_SECONDS="60"
SMTP_PASS=""
META_GRAPH_API_VERSION="v25.0"
META_WHATSAPP_ACCESS_TOKEN=""
META_PHONE_NUMBER_ID=""
META_WABA_ID=""
META_APP_SECRET=""
META_WEBHOOK_VERIFY_TOKEN=""
META_WHATSAPP_DRY_RUN="true"
META_VALIDATE_SIGNATURE="true"
```

## Phase 0 Checks

```bash
npm run typecheck
npm run lint
npm run format:check
npm test
npm run build
npm run worker:test
curl http://localhost:3000/api/health
```

## Implemented Scope

- Lead database
- Lead import from CSV upload or Excel/Google Sheets paste, with mapping, validation preview, duplicate checks, suppression checks, and missing compliance data flags
- Offer/product library
- Suppression list
- Lead activity timeline
- Import result review

Campaign sending, WhatsApp Cloud API, the AI Assistant control center, owner-friendly UI, and VPS deployment are implemented. Production SMTP and IMAP are configured for `info@virtuprose.com`; keep volume low until real inbox delivery, SPF/DKIM/DMARC, and reply capture are verified.

The platform UI now uses a premium shadcn/Tailwind foundation with a Virtuprose Sales Studio shell, grouped navigation, loading/error states, Sonner toasts, reusable UI primitives, and polished campaign, import, inbox, WhatsApp, AI assistant, and hot-lead workflows.

## Campaign Scope

- Campaign list and campaign builder
- Offer-based AI campaign draft generation with local fallback when `OPENAI_API_KEY` is not configured
- Audience selection by lead status, tag, country, and recipient cap
- Campaign steps, variants, recipients, AI generation records, and safety reviews
- Compliance identity settings for sender name, sender email, physical address, and unsubscribe URL
- Review checklist that blocks approval for empty audiences, suppressed leads, missing lead compliance fields, missing unsubscribe, missing sender identity, or disallowed claims
- Campaign approval for Phase 3 scheduling only

Email sending infrastructure exists and production SMTP is configured through Hostinger for `info@virtuprose.com`. Domain authentication and real inbox placement still need to be verified before volume.

## Phase 3 Scope

- SMTP sending account settings with dry-run mode by default
- Conservative daily, per-minute, and per-domain sending caps
- Queue-based campaign scheduling for approved campaigns
- Custom HTML email designs on campaign detail pages: upload up to 3 `.html` wrappers, validate, preview desktop/mobile, select one design, and send a test email
- Worker-side suppression, unsubscribe, campaign-state, account-state, and rate-limit checks
- Email message records, send jobs, email events, provider message IDs, and errors
- Public unsubscribe links that immediately suppress the lead and skip remaining queued campaign emails
- Campaign send monitor plus pause/resume controls
- Global kill switch in Settings
- Basic open/click tracking endpoints for future HTML/tracked-link use

Do not disable dry-run for production until SPF, DKIM, DMARC, mailbox warmup, and test-inbox delivery are verified.

## AI Assistant And Hot Lead Scope

- `/ai-assistant` control center for reply mode, prompts, knowledge base, safety rules, activity, and test classification.
- AI Assistant settings save inline validation errors for prompts, knowledge base, and notification emails instead of sending the owner to a generic error page.
- Reply modes: Auto Safe, Draft Only, Test Mode, and Paused.
- Auto Safe replies only send when confidence, safety, channel, service-window, daily-cap, duplicate, and owner-takeover checks pass.
- Default reply style is short, human, sales-focused, and same-language. English and Arabic are supported; Arabic should read naturally for GCC and international customers.
- Reply classification into hot lead, pricing request, meeting request, proof request, objection, not interested, unsubscribe, complaint, and unclear.
- Conversation memory is stored in `conversations` and `conversation_messages`. WhatsApp memory is keyed by phone number so repeat messages from the same number load prior history.
- Lead sales stages are tracked as new enquiry, interested, qualified lead, meeting requested, meeting booked, not interested, or follow-up required.
- Contact capture tracks missing name, phone, email, company, service/product needed, and preferred meeting time.
- Meeting slots are managed in `/ai-assistant`; the default weekly generator creates 30-minute Asia/Kuwait slots for Sunday-Thursday 10:00 AM-6:00 PM, Saturday 12:30 PM-8:00 PM, and no Friday slots. AI can only suggest available stored slots and must not invent availability.
- Lead-level **AI off for this lead** takeover is available in Replies, WhatsApp Inbox, and Hot Leads.
- Hot-lead, pricing, and meeting intent trigger owner handoff and an owner alert email to `moh@virtuprose.com`.
- Confirmed AI meeting bookings can send a separate owner email alert from the configurable `/ai-assistant` notification setting.
- Reply-safe suppression handling for unsubscribe and complaint language.
- Automatic stopping of queued follow-ups after a lead replies.
- Hot-lead scoring with fit, engagement, and intent scores.
- Lightweight deal pipeline created from replies.
- `ai-reply-sending` worker queue handles delayed AI auto-replies.
- IMAP polling for email replies is configured on production for `info@virtuprose.com`.
- Inbound webhook endpoint remains available as an advanced fallback and is protected by `INBOUND_WEBHOOK_SECRET`.
- Generic inbound conversation endpoint is available for website chat and optional Instagram DM integrations:

```bash
POST /api/inbound/conversations
Header: x-inbound-secret: <INBOUND_WEBHOOK_SECRET>
Body: {
  "channel": "WEBSITE_CHAT",
  "name": "Maya",
  "fromEmail": "maya@example.com",
  "bodyText": "Hi, I need a website for my company."
}
```

## Ready-To-Use Internal Workflow

1. Keep dry-run on while testing.
2. Import leads with source, country, and legal-basis fields by uploading CSV or pasting rows copied from Excel/Google Sheets.
3. Create or select the Virtuprose offer you want to sell.
4. Generate a campaign, review the copy, fix blockers, and approve it.
5. Optional: upload and select a premium HTML design in the campaign **Email design** panel. The selected design must include `{{body_html}}` and an unsubscribe link.
6. Schedule the campaign through the sending account.
7. Start the worker with `npm run worker`.
8. Paste replies into `/inbox`, or connect an inbound parser to:

```bash
POST /api/inbound/replies
Header: x-inbound-secret: <INBOUND_WEBHOOK_SECRET>
Body: {
  "fromEmail": "lead@company.com",
  "toEmail": "hello@virtuprose.com",
  "subject": "Re: quick idea",
  "bodyText": "Can you send pricing?"
}
```

8. Open `/ai-assistant`, keep **Auto Safe** or switch to **Draft Only**, and verify the prompts/knowledge base before live reply testing.
9. Review the AI draft or safe auto-reply decision from Replies. In email dry-run mode, this records the send without contacting SMTP.
10. Work hot leads from `/pipeline` and mark outcomes as won, lost, proposal sent, or follow-up later.

For real email sending and hot-lead alert emails, production now uses `info@virtuprose.com`. Keep the worker running, confirm test delivery reaches the inbox, and keep volume conservative until deliverability is proven.

## WhatsApp Cloud API Scope

- Direct Meta WhatsApp Cloud API integration, not Twilio.
- Approved Meta template storage, submission, status sync, and test sending.
- WhatsApp campaign builder with offer, audience, template, variable mapping, caps, send window, and owner approval.
- `whatsapp-sending` BullMQ queue for template campaigns.
- Meta webhook route at `/api/webhooks/meta/whatsapp`.
- AI classification, drafting, and conservative Auto Safe replies for inbound WhatsApp replies inside the 24-hour service window.
- STOP/unsubscribe/complaint handling blocks future WhatsApp sends.

Current handoff details, Meta setup notes, and operational runbooks are in [`docs/DEVELOPER_HANDOFF.md`](docs/DEVELOPER_HANDOFF.md).
