# Virtuprose Email + WhatsApp Agent Developer Handoff

Last updated: 2026-06-07

This project is an internal, single-owner Virtuprose platform for lead import, compliant outbound email, Meta WhatsApp template campaigns, AI reply drafting/classification, and hot-lead handoff. It is not a public SaaS yet. Build decisions should optimize for reliable owner use, compliance, and sender reputation before scale.

## Current Status

- Next.js App Router dashboard is implemented for leads, offers, email campaigns, inbox, pipeline, reports, settings, FAQ, and WhatsApp.
- Prisma/Postgres stores leads, suppression, campaigns, messages, events, AI generations, deals, WhatsApp templates, WhatsApp campaigns, WhatsApp messages, and WhatsApp events.
- Redis/BullMQ backs outbound email and WhatsApp send jobs.
- Meta WhatsApp Cloud API is the active WhatsApp provider. Twilio WhatsApp was removed as a runtime provider.
- Local `.env` has real Meta credentials on the developer machine. Do not commit `.env`.
- The current Meta WhatsApp Business Account is `Virtuprose Solutions`.
- Current WABA ID: `1230282529223282`.
- Current phone number ID: `1125194370679994`.
- Current sender number: `+1 646-201-3857`.
- Phone number status was registered through Cloud API and confirmed `CONNECTED`.
- A Meta marketing template named `virtuprose_test_intro_1780700375249` was submitted, approved, synced locally, and used for one successful live test send.
- The successful test message went to `+96569984942` with Meta message ID `wamid.HBgLOTY1Njk5ODQ5NDIVAgARGBJBQUI0NUYyMjNGQTRBRUZGRjgA`.
- The app is deployed on the VPS at `http://31.97.213.79`.
- VPS app path is `/opt/virtuprose-sales-assistant`.
- Docker Compose project is `virtuprose-sales-assistant`.
- App, worker, Postgres, and Redis containers are running on the VPS.
- Production credentials are stored in `/opt/virtuprose-sales-assistant/.env.production` on the VPS and must never be committed.
- Owner login details are saved locally in `/Users/muhammadzaid/.codex/virtuprose-sales-assistant-vps-credentials.txt`.
- `OPENAI_API_KEY` is currently missing on the VPS, so full AI reply quality is pending.
- SMTP passwords are currently missing on the VPS, so production email sending is pending.
- HTTPS/domain setup is pending, so Meta inbound webhooks are not production-ready yet.

## Architecture

```mermaid
flowchart LR
  CSV["CSV lead import"] --> Leads["Lead database"]
  Leads --> EmailCampaigns["Email campaigns"]
  Leads --> WhatsAppCampaigns["WhatsApp campaigns"]
  Offers["Offer library"] --> EmailCampaigns
  Offers --> WhatsAppCampaigns
  EmailCampaigns --> EmailQueue["BullMQ email queue"]
  WhatsAppCampaigns --> WAQueue["BullMQ whatsapp-sending queue"]
  EmailQueue --> SMTP["SMTP provider"]
  WAQueue --> Meta["Meta WhatsApp Cloud API"]
  Meta --> Webhooks["/api/webhooks/meta/whatsapp"]
  Webhooks --> Inbox["Inbox + AI classification"]
  Inbox --> Pipeline["Hot lead pipeline"]
```

Important boundaries:

- `src/lib/whatsapp.ts` owns Meta Cloud API payloads, webhook verification, WhatsApp campaign queueing, consent gates, and provider send logic.
- `src/lib/replies.ts` owns inbound reply ingestion, AI reply classification/drafting, suppression detection, and deal creation.
- `src/lib/queue.ts` owns BullMQ queue factories.
- `src/worker/index.ts` processes queued email and WhatsApp sends.
- `src/app/actions.ts` contains dashboard server actions for templates, campaigns, settings, sends, and inbox workflows.
- `src/app/api/webhooks/meta/whatsapp/route.ts` handles Meta webhook verification and inbound/status callbacks.

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

Run the worker in a second terminal when testing queued sends:

```bash
npm run worker
```

Basic auth is controlled by:

```env
BASIC_AUTH_USER="owner"
BASIC_AUTH_PASSWORD="local-dev-password"
```

## Required Environment Variables

Core:

```env
DATABASE_URL="postgresql://email_agent:email_agent@localhost:54329/email_agent?schema=public"
REDIS_URL="redis://localhost:6380"
APP_BASE_URL="http://localhost:3000"
BASIC_AUTH_USER=""
BASIC_AUTH_PASSWORD=""
OPENAI_API_KEY=""
OPENAI_CAMPAIGN_MODEL="gpt-4.1-mini"
OPENAI_REPLY_MODEL="gpt-4.1-mini"
INBOUND_WEBHOOK_SECRET=""
SMTP_PASS=""
SMTP_PASSWORD=""
```

Meta WhatsApp:

```env
META_GRAPH_API_VERSION="v25.0"
META_WHATSAPP_ACCESS_TOKEN=""
META_PHONE_NUMBER_ID=""
META_WABA_ID=""
META_APP_SECRET=""
META_WEBHOOK_VERIFY_TOKEN=""
META_WHATSAPP_DRY_RUN="true"
META_VALIDATE_SIGNATURE="true"
```

Notes:

- `META_WHATSAPP_ACCESS_TOKEN` is secret. Do not log or commit it.
- `META_APP_SECRET` is secret. Do not log or commit it.
- `META_WEBHOOK_VERIFY_TOKEN` is secret enough to keep out of docs and Git.
- `META_PHONE_NUMBER_ID` and `META_WABA_ID` are identifiers, not authentication secrets.
- Use `META_WHATSAPP_DRY_RUN="true"` by default in new environments.
- Use `META_WHATSAPP_DRY_RUN="false"` only for deliberate live sends.

## VPS Deployment Runbook

Current VPS:

```text
root@31.97.213.79
```

Current public app URL:

```text
http://31.97.213.79
```

Current app path:

```text
/opt/virtuprose-sales-assistant
```

Deploy or redeploy:

```bash
cd /opt/virtuprose-sales-assistant
docker compose --env-file .env.production -p virtuprose-sales-assistant -f docker-compose.production.yml up -d --build
```

Check services:

```bash
cd /opt/virtuprose-sales-assistant
docker compose --env-file .env.production -p virtuprose-sales-assistant -f docker-compose.production.yml ps
curl http://127.0.0.1:3004/api/health
```

More deployment details are in `docs/VPS_DEPLOYMENT.md`.

## Meta WhatsApp Setup Runbook

Use this when moving the app to a new WhatsApp Manager/WABA or phone number.

1. In Meta Business/WhatsApp Manager, confirm the phone number appears under the target WABA.
2. If the number is `PENDING`, register it with Meta Cloud API:

```bash
curl -X POST "https://graph.facebook.com/v25.0/$META_PHONE_NUMBER_ID/register" \
  -H "Authorization: Bearer $META_WHATSAPP_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"messaging_product":"whatsapp","pin":"123456"}'
```

3. Confirm the phone status:

```bash
curl "https://graph.facebook.com/v25.0/$META_PHONE_NUMBER_ID?fields=id,display_phone_number,verified_name,status,quality_rating" \
  -H "Authorization: Bearer $META_WHATSAPP_ACCESS_TOKEN"
```

4. In the Meta OAuth/business integration flow, grant the app access to only the intended business and WhatsApp account.
5. Debug the token and confirm `whatsapp_business_messaging` is targeted to the intended WABA:

```bash
curl "https://graph.facebook.com/v25.0/debug_token?input_token=$META_WHATSAPP_ACCESS_TOKEN&access_token=$APP_ID|$META_APP_SECRET"
```

6. Sync templates:

```bash
curl "https://graph.facebook.com/v25.0/$META_WABA_ID/message_templates?fields=id,name,status,category,language,components&limit=50" \
  -H "Authorization: Bearer $META_WHATSAPP_ACCESS_TOKEN"
```

7. Only send with templates that Meta reports as `APPROVED`.

## WhatsApp Product Rules

- Business-initiated outbound WhatsApp messages must use approved Meta templates.
- The app enforces WhatsApp opt-in and consent source before campaign sends.
- `STOP`, unsubscribe-style language, complaints, and do-not-contact states suppress future WhatsApp sends.
- Free-form AI replies are allowed only inside the 24-hour customer service window after an inbound customer message.
- AI should hand off hot, risky, unclear, pricing, proposal, or meeting-intent conversations to the owner.
- Start with low caps, for example 25/day, then increase only after quality and delivery are stable.

## Webhooks

Meta webhook route:

```text
GET  /api/webhooks/meta/whatsapp
POST /api/webhooks/meta/whatsapp
```

GET verifies:

- `hub.mode=subscribe`
- `hub.verify_token`
- `hub.challenge`

POST verifies:

- `X-Hub-Signature-256` using `META_APP_SECRET`, unless `META_VALIDATE_SIGNATURE="false"` for local-only troubleshooting.

Localhost is not enough for Meta webhooks. Use a public HTTPS deployment or a tunnel. Configure the callback URL in Meta as:

```text
https://<public-domain>/api/webhooks/meta/whatsapp
```

Subscribe to message and status events for the WABA.

## Testing And Verification

Run before pushing:

```bash
npx prisma format
npx prisma validate
npm run format:check
npm run typecheck
npm run lint
npm test
npm run build
npm run worker:test
curl http://localhost:3000/api/health
```

Useful live checks:

```bash
node - <<'NODE'
const fs = require("fs");
const env = Object.fromEntries(fs.readFileSync(".env", "utf8").split(/\n/).filter(Boolean).filter(l => !l.startsWith("#")).map(l => {
  const i = l.indexOf("=");
  return [l.slice(0, i), l.slice(i + 1).replace(/^"|"$/g, "")];
}));
for (const key of ["META_GRAPH_API_VERSION", "META_PHONE_NUMBER_ID", "META_WABA_ID", "META_WHATSAPP_DRY_RUN", "META_VALIDATE_SIGNATURE"]) {
  console.log(`${key}: ${env[key] || "missing"}`);
}
console.log(`META_WHATSAPP_ACCESS_TOKEN: ${env.META_WHATSAPP_ACCESS_TOKEN ? "set" : "missing"}`);
NODE
```

## Data Model Highlights

Lead WhatsApp fields:

- `phoneE164`
- `whatsappOptIn`
- `whatsappConsentSource`
- `whatsappStatus`
- `lastWhatsappContactedAt`
- `whatsappStoppedAt`
- `lastWhatsappCustomerMessageAt`
- `whatsappServiceWindowExpiresAt`
- `whatsappBotPaused`
- `whatsappHandoffReason`

WhatsApp tables:

- `whatsapp_templates`
- `whatsapp_campaigns`
- `whatsapp_campaign_recipients`
- `whatsapp_send_jobs`
- `whatsapp_messages`
- `whatsapp_events`

Provider mapping:

- `WhatsappTemplate.metaTemplateName` maps to Meta template `name`.
- `WhatsappTemplate.metaTemplateId` maps to Meta template `id`.
- `WhatsappMessage.providerMessageId` stores Meta `wamid...`.

## Current Known Gaps

- A permanent System User token should replace the dashboard-generated user token before unattended production use.
- Webhooks need a public HTTPS URL before inbound replies and AI WhatsApp auto-replies can work end to end.
- `OPENAI_API_KEY` must be added on the VPS before full AI reply classification and drafting are production-ready.
- SMTP credentials must be added before production email sending.
- A real domain and Let's Encrypt SSL certificate are required before Meta webhooks can be connected reliably.
- Payment method and message limits should be confirmed in WhatsApp Manager before volume.
- Old Twilio-specific secrets should stay removed from `.env.example` and should never be committed.
- The current dashboard is single-user and protected by Basic Auth, not multi-user role-based auth.
- Template approval is controlled by Meta; local status must be synced before sends.

## Git Hygiene

- `.env` is local only and must not be committed.
- Keep migrations immutable after they are applied.
- Use focused commits with docs and code together when they describe the same feature.
- Do not re-enable Twilio WhatsApp fallback unless there is a deliberate provider abstraction decision.
