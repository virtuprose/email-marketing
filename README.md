# Virtuprose AI Email Sales Agent

Internal single-user product for importing leads, managing suppression/compliance data, preparing Virtuprose offers, generating reviewed AI-assisted email campaign drafts, sending compliant email campaigns, and running Meta WhatsApp Cloud API template campaigns with AI reply qualification.

## Current Deployment

The app is deployed on the VPS at:

```text
http://31.97.213.79
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
- CSV import with mapping, validation, duplicate checks, suppression checks, and missing compliance data flags
- Offer/product library
- Suppression list
- Lead activity timeline
- Import result review

Campaign sending, WhatsApp Cloud API, AI reply workflow hooks, owner-friendly UI, and deployment are now implemented. Some production operations still need configuration, especially OpenAI, HTTPS webhooks, and SMTP.

## Campaign Scope

- Campaign list and campaign builder
- Offer-based AI campaign draft generation with local fallback when `OPENAI_API_KEY` is not configured
- Audience selection by lead status, tag, country, and recipient cap
- Campaign steps, variants, recipients, AI generation records, and safety reviews
- Compliance identity settings for sender name, sender email, physical address, and unsubscribe URL
- Review checklist that blocks approval for empty audiences, suppressed leads, missing lead compliance fields, missing unsubscribe, missing sender identity, or disallowed claims
- Campaign approval for Phase 3 scheduling only

Email sending infrastructure exists, but production email sending still needs SMTP credentials and domain authentication checks before volume.

## Phase 3 Scope

- SMTP sending account settings with dry-run mode by default
- Conservative daily, per-minute, and per-domain sending caps
- Queue-based campaign scheduling for approved campaigns
- Worker-side suppression, unsubscribe, campaign-state, account-state, and rate-limit checks
- Email message records, send jobs, email events, provider message IDs, and errors
- Public unsubscribe links that immediately suppress the lead and skip remaining queued campaign emails
- Campaign send monitor plus pause/resume controls
- Global kill switch in Settings
- Basic open/click tracking endpoints for future HTML/tracked-link use

Do not disable dry-run for production until SPF, DKIM, DMARC, mailbox warmup, and test-inbox delivery are verified.

## AI Inbox And Hot Lead Scope

- AI inbox for manual reply import and webhook reply ingestion
- Reply classification into hot lead, pricing request, meeting request, proof request, objection, not interested, unsubscribe, complaint, and unclear
- AI reply drafts with local fallback when `OPENAI_API_KEY` is not configured
- Reply-safe suppression handling for unsubscribe and complaint language
- Automatic stopping of queued follow-ups after a lead replies
- Hot-lead scoring with fit, engagement, and intent scores
- Lightweight deal pipeline created from replies
- Reports for sends, replies, hot replies, source quality, and campaign performance
- Inbound webhook endpoint protected by `INBOUND_WEBHOOK_SECRET`

## Ready-To-Use Internal Workflow

1. Keep dry-run on while testing.
2. Import CSV leads with source, country, and legal-basis fields.
3. Create or select the Virtuprose offer you want to sell.
4. Generate a campaign, review the copy, fix blockers, and approve it.
5. Schedule the campaign through the sending account.
6. Start the worker with `npm run worker`.
7. Paste replies into `/inbox`, or connect an inbound parser to:

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

8. Review the AI draft and send it manually from the inbox. In dry-run mode, this records the send without contacting SMTP.
9. Work hot leads from `/pipeline` and mark outcomes as won, lost, proposal sent, or follow-up later.

For real email sending, configure a real reply-to inbox, set `SMTP_PASS`/`SMTP_PASSWORD`, disable dry-run only after test delivery is confirmed, and keep the worker running.

## WhatsApp Cloud API Scope

- Direct Meta WhatsApp Cloud API integration, not Twilio.
- Approved Meta template storage, submission, status sync, and test sending.
- WhatsApp campaign builder with offer, audience, template, variable mapping, caps, send window, and owner approval.
- `whatsapp-sending` BullMQ queue for template campaigns.
- Meta webhook route at `/api/webhooks/meta/whatsapp`.
- AI classification and reply drafting for inbound WhatsApp replies inside the 24-hour service window.
- STOP/unsubscribe/complaint handling blocks future WhatsApp sends.

Current handoff details, Meta setup notes, and operational runbooks are in [`docs/DEVELOPER_HANDOFF.md`](docs/DEVELOPER_HANDOFF.md).
