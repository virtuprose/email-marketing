# Virtuprose AI Email Sales Agent Execution Plan

Source PRD: `docs/EMAIL_MARKETING_AI_AGENT_PRD.md`  
Product type: Internal single-user AI sales agent  
Primary outcome: Import leads, send safe AI-assisted outreach, let AI manage early replies, and surface hot leads for owner closing.

## Current Implementation Status

As of 2026-06-07, the core internal product has been implemented and deployed on the VPS at `http://31.97.213.79`.

Completed implementation areas:

- Lead import and lead database.
- Campaign builder.
- Meta WhatsApp Cloud API template sends.
- Reply/inbox and hot-lead workflow.
- Owner-friendly UI simplification.
- Dockerized app, worker, Postgres, and Redis deployment.

Remaining production readiness items:

- Add `OPENAI_API_KEY` for full AI reply quality.
- Add a real domain and HTTPS for Meta webhooks.
- Add SMTP credentials and email domain authentication before production email sending.
- Add scheduled database backups.

## 1. Execution Strategy

Build the smallest complete loop first:

`CSV lead import -> offer selection -> AI campaign draft -> compliance check -> throttled send -> reply ingestion -> AI classification/draft -> hot lead handoff`

Do not start with advanced analytics, public SaaS billing, team permissions, WhatsApp, calendar booking, scraping, or a complex CRM. Those create delay without improving the first business outcome.

The MVP should be treated as a controlled internal tool. AI can assist from day one, but full auto-reply should be gated behind confidence, reply category, and owner-approved policies.

## 2. Recommended Build Stack

Recommended default:

- App: Next.js with TypeScript.
- Backend pattern: Next.js API routes for early MVP or NestJS/Fastify if splitting backend immediately.
- Database: PostgreSQL.
- ORM: Prisma.
- Queue: Redis + BullMQ.
- Email: SMTP adapter first, provider abstraction from day one.
- AI: model provider abstraction with structured JSON outputs.
- File processing: CSV parser with import batch storage.
- Email validation: external validation API, plus local syntax checks.
- Auth: single-user password or magic-link login for MVP.
- Deployment: one web app, one worker process, Postgres, Redis.

If speed is the priority, start as a Next.js app with separate worker entrypoint. Keep code modular so it can split into services later.

## 3. Build Rules

- Suppression and unsubscribe must exist before any campaign can send.
- Every send job must re-check lead status, suppression, campaign state, and rate limits immediately before sending.
- AI cannot send to suppressed leads or continue after unsubscribe, complaint, or hard bounce.
- All AI replies must be logged with input, output, model, confidence, and policy version.
- Auto-send is disabled by default.
- Every campaign launch must pass compliance and deliverability checks.
- Scaling volume is blocked until bounce, complaint, unsubscribe, and provider errors are measurable.

## 4. Phase 0: Project Foundation

Goal: Create the technical base needed for fast MVP development.

Target duration: 1-3 days.

### Deliverables

- Initialize app repository.
- Set up TypeScript, linting, formatting, and test framework.
- Add Docker/local services for Postgres and Redis.
- Add environment variable structure.
- Add database migration workflow.
- Add background worker process.
- Add basic auth for single owner.
- Add base UI shell and navigation.
- Add audit logging utility.

### Backend Work

- Create modules:
  - auth
  - users/settings
  - audit logs
  - files/imports
  - workers
  - email provider adapter
  - AI provider adapter

### UI Work

- Build app shell:
  - Command Center
  - Leads
  - Campaigns
  - Inbox / AI Agent
  - Pipeline
  - Reports
  - Settings

Only placeholders are needed in this phase.

### Acceptance Criteria

- App runs locally.
- User can log in.
- Database migrations run cleanly.
- Worker can process a test job.
- Redis queue is connected.
- Basic navigation works.
- Audit log can record a test event.

## 5. Phase 1: Data Core, Offers, Compliance Foundation

Goal: Build the lead database and safety foundation before sending any email.

Target duration: 4-7 days.

### Epics

- Lead model.
- CSV import.
- Offer/product library.
- Suppression list.
- Legal-basis and source tracking.
- Lead activity timeline.

### Database Tables

Minimum tables:

- users
- settings
- offers
- leads
- lead_tags
- import_batches
- import_rows
- suppression_entries
- lead_events
- audit_logs

### Lead Fields

Required:

- email
- first_name
- last_name
- company
- website
- role
- industry
- country
- timezone
- source
- source_url
- legal_basis
- consent_notes
- status
- score_fit
- score_engagement
- score_intent
- created_at
- updated_at

### Import Flow

1. Upload CSV.
2. Preview first rows.
3. Map columns.
4. Validate emails locally.
5. Deduplicate against existing leads.
6. Check suppression list.
7. Flag missing country, source, or legal basis.
8. Save import batch.
9. Show import summary.

### Offer Library

Create CRUD for Virtuprose offers:

- Website redesign.
- Shopify/ecommerce revamp.
- SaaS/MVP build.
- Maintenance/support.
- Automation and AI workflows.

Each offer must include:

- Target audience.
- Pain points.
- Value proposition.
- Approved proof points.
- Services included.
- CTA style.
- Disallowed claims.
- AI voice rules.

### UI Screens

- Leads table with filters.
- Lead profile drawer.
- CSV import wizard.
- Import result screen.
- Suppression list screen.
- Offer library screen.

### Acceptance Criteria

- User can import CSV leads.
- Duplicates are detected.
- Suppressed emails cannot be imported as sendable.
- Leads without legal/source data are flagged.
- User can create and edit offers.
- Lead activity timeline records import and status changes.
- Suppression entries block future sends.

### Verification

- Unit tests for CSV mapping, validation, dedupe, and suppression.
- Manual test with a sample CSV containing valid, invalid, duplicate, and suppressed emails.

## 6. Phase 2: AI Campaign Builder

Goal: Let the owner select an offer and generate safe, personalized campaign drafts.

Target duration: 5-8 days.

### Epics

- Campaign model.
- Audience selection.
- AI copy generation.
- Personalization variables.
- Compliance/safety review.
- Test email preview.

### Database Tables

- campaigns
- campaign_steps
- campaign_variants
- campaign_recipients
- ai_generations
- campaign_reviews

### Campaign Builder Steps

1. Select offer.
2. Select audience.
3. Choose objective.
4. Generate email sequence with AI.
5. Edit subject/body/follow-ups.
6. Review personalization variables.
7. Run safety checks.
8. Send test email.
9. Approve for scheduling.

### AI Generation Requirements

AI should output structured JSON:

- subject
- body
- follow_up_steps
- personalization_fields_used
- risk_flags
- claims_used
- confidence
- explanation

AI must follow:

- No fake relationship.
- No invented proof.
- No guaranteed outcomes.
- No deceptive urgency.
- No continuing after unsubscribe.
- Use only approved offer claims.

### Safety Checks

Block launch when:

- sender identity is missing
- unsubscribe link is missing
- physical address is missing if required by campaign settings
- audience contains suppressed leads
- lead source/legal-basis fields are missing beyond allowed threshold
- campaign uses unapproved claims
- sending account is not configured

Warn when:

- too many leads have unknown country
- sequence is too long
- copy is too aggressive
- volume exceeds ramp policy

### UI Screens

- Campaign list.
- Campaign builder stepper.
- Email editor.
- AI generation panel.
- Compliance checklist.
- Test email preview.

### Acceptance Criteria

- User can create a campaign from an offer.
- AI generates a first email and follow-ups.
- User can edit AI output.
- Safety checklist blocks unsafe launch.
- Campaign can be approved but not yet sent until Phase 3.

### Verification

- Test AI prompts with all 5 Virtuprose offers.
- Test that unapproved claims are flagged.
- Test campaign cannot launch without unsubscribe/sender identity.

## 7. Phase 3: Sending Engine MVP

Goal: Send approved campaigns safely with throttling, unsubscribe, event tracking, and pause controls.

Target duration: 6-10 days.

### Epics

- SMTP sending account.
- Provider adapter abstraction.
- Queue-based sender.
- Rate limits.
- Unsubscribe endpoint.
- Tracking endpoints.
- Send status and campaign health.
- Global kill switch.

### Database Tables

- sending_accounts
- sending_domains
- email_messages
- email_events
- unsubscribe_tokens
- sending_limits
- send_jobs

### Sending Flow

1. Owner schedules campaign.
2. System creates campaign recipient records.
3. Worker picks eligible recipients.
4. Worker checks suppression, campaign state, sending limits, and account health.
5. Worker sends through provider adapter.
6. System stores provider message ID and headers.
7. System records sent/failed event.
8. System pauses campaign if thresholds are crossed.

### Rate Limits

MVP defaults:

- Start with conservative daily cap.
- Per-minute cap.
- Per-domain cap.
- No sudden 100k/month ramp.
- Manual owner override only after warning.

### Required Stop Conditions

- Hard bounce spike.
- Complaint event, if provider supports it.
- Unsubscribe spike.
- SMTP/provider authentication failure.
- High send failure rate.
- Domain setup failure.
- Manual kill switch.

### UI Screens

- Sending account settings.
- Domain setup checklist.
- Campaign send monitor.
- Campaign pause/resume controls.
- Unsubscribe confirmation page.

### Acceptance Criteria

- User can configure SMTP.
- Test email sends successfully.
- Campaign sends through queue, not HTTP request.
- Suppressed/unsubscribed leads are skipped.
- Unsubscribe link works and immediately suppresses the lead.
- Kill switch pauses all queued sending.
- Sending limits are enforced.

### Verification

- Use test SMTP sandbox first.
- Send to internal test inboxes.
- Confirm unsubscribe prevents follow-up sends.
- Confirm paused campaign stops worker processing.
- Confirm failed SMTP credentials pause sending account.

## 8. Phase 4: Reply Inbox And AI Agent

Goal: Bring replies into the platform, let AI classify/draft responses, and surface hot leads.

Target duration: 7-12 days.

### Epics

- Inbound reply sync.
- Thread matching.
- AI classification.
- AI draft response.
- Hot lead scoring.
- Owner approval queue.
- Controlled auto-reply rules.

### Database Tables

- reply_threads
- inbound_messages
- ai_classifications
- ai_drafts
- ai_policies
- lead_scores
- owner_tasks

### Reply Sync

MVP options:

- IMAP polling if current SMTP/inbox does not support webhooks.
- Provider webhooks if using a modern email provider.

Thread matching should use:

- Message-ID
- In-Reply-To
- References
- campaign recipient ID
- email address

### AI Classification Categories

- interested
- meeting requested
- asks for pricing
- asks for portfolio/proof
- objection
- not interested
- unsubscribe
- out of office
- wrong person
- complaint
- unclear
- hot lead

### AI Draft Rules

AI can draft:

- answer to common objections
- portfolio/proof response
- pricing discovery response
- polite no-pressure follow-up
- wrong-person routing question

AI must escalate:

- pricing negotiation
- meeting request
- strong buying signal
- angry/complaint reply
- legal/privacy concern
- unclear but potentially valuable reply
- anything below confidence threshold

### Scoring

Use a combined score:

- Fit score: company/industry/offer match.
- Engagement score: reply/click/open activity, with open tracking weighted low.
- Intent score: AI classification and message content.

Hot lead triggers:

- asks for price
- asks for meeting
- asks for timeline
- asks for proposal
- shares project need
- requests examples/case studies
- replies positively twice

### UI Screens

- Inbox / AI Agent.
- Reply thread detail.
- AI draft review.
- Hot lead queue.
- AI policy settings.
- Daily digest screen.

### Acceptance Criteria

- Replies appear in the platform.
- Replies are matched to leads/campaigns.
- AI classifies replies with confidence and reason.
- AI drafts a response for review.
- Owner can approve, edit, send, suppress, or mark hot.
- Hot leads appear in Command Center.
- Unsubscribe/stop replies suppress the lead automatically.

### Verification

- Send test replies for each classification category.
- Confirm unsubscribe language triggers suppression.
- Confirm hot lead language triggers handoff.
- Confirm AI cannot draft with unapproved claims.
- Confirm every AI action is logged.

## 9. Phase 5: Pipeline And Closing Workflow

Goal: Give the owner a simple closing board for hot leads and deal outcomes.

Target duration: 4-7 days.

### Epics

- Pipeline stages.
- Deal record.
- Conversation summary.
- Next action.
- Won/lost tracking.
- Follow-up later reminders.

### Database Tables

- pipeline_deals
- deal_events
- tasks
- reminders

### Pipeline Stages

- New lead.
- Contacted.
- Replied.
- Engaged.
- Hot lead.
- Owner handling.
- Proposal sent.
- Won.
- Lost.
- Follow up later.

### UI Screens

- Pipeline board.
- Deal detail drawer.
- Hot lead handoff summary.
- Next action list.

### Acceptance Criteria

- Hot leads can become pipeline deals.
- Owner can move deals between stages.
- Deal keeps conversation summary and AI recommendation.
- Owner can record won/lost outcome.
- Reports can attribute outcome to offer, campaign, and source.

### Verification

- Move test hot lead through full pipeline.
- Confirm won/lost updates reporting fields.
- Confirm follow-up later creates task/reminder.

## 10. Phase 6: Reporting And Operational Metrics

Goal: Show what is working and what is damaging deliverability.

Target duration: 4-8 days.

### Epics

- Campaign reports.
- Offer performance.
- Source quality.
- Deliverability health.
- AI performance.
- Daily owner digest.

### Metrics

Campaign:

- sent
- failed
- bounced
- opened
- clicked
- replied
- positive replies
- hot leads
- unsubscribes
- complaints

Sales:

- hot lead rate
- proposal rate
- won/lost
- estimated value
- revenue attributed

Deliverability:

- hard bounce rate
- soft bounce rate
- unsubscribe rate
- complaint rate
- provider errors
- sending volume by account/domain

AI:

- classification count by category
- draft approval rate
- edit-before-send rate
- auto-send count
- escalation count
- policy violation count

### UI Screens

- Reports overview.
- Campaign report.
- Offer report.
- Source quality report.
- Deliverability report.
- AI agent report.

### Acceptance Criteria

- Owner can identify best offer, segment, and lead source.
- Owner can see if sending should continue, pause, or reduce.
- Owner can see AI quality and intervention rate.

## 11. Phase 7: Deliverability Hardening Before Scale

Goal: Prepare for safe growth toward 100k/month.

Target duration: 1-3 weeks, depending on provider and domain readiness.

### Epics

- Provider selection beyond basic SMTP.
- SPF/DKIM/DMARC checks.
- One-click unsubscribe headers.
- Bounce/complaint webhooks.
- Blacklist monitoring.
- Sending ramp policy.
- Account/domain health dashboard.
- Seed testing or inbox placement checks.

### Provider Decision

Evaluate:

- Amazon SES
- Mailgun
- SendGrid
- Postmark
- Resend
- Google/Outlook sending for smaller inbox-based outreach

Selection criteria:

- deliverability
- webhook quality
- bounce/complaint handling
- terms compatibility with the intended outreach
- API stability
- cost at 100k/month
- suppression/event support

### Acceptance Criteria

- No production campaign can send from unauthenticated domain.
- Bounce and complaint events are captured automatically.
- One-click unsubscribe headers are available for marketing-style sends.
- Ramp schedule is enforced.
- Campaign health has clear pause reasons.

## 12. Phase 8: Advanced AI Autopilot

Goal: Increase AI autonomy after real reply data proves safe.

Target duration: after MVP has real campaign data.

### Epics

- AI playbooks by offer.
- Objection handling library.
- Auto-send policy engine.
- AI evaluation tests.
- Reply simulation dataset.
- Learning from won/lost outcomes.
- Campaign retrospectives.

### Auto-Send Policy

Enable only per category:

- out of office: safe follow-up adjustment
- wrong person: ask for correct contact
- simple portfolio request: send approved proof
- simple pricing discovery: ask qualifying question

Do not auto-send:

- angry replies
- legal/privacy concerns
- high-value hot leads
- negotiation
- custom project scoping
- unclear intent

### Acceptance Criteria

- Auto-send rules are explicit and visible.
- Owner can disable auto-send instantly.
- AI behavior can be reviewed from audit logs.
- Evaluation set passes before new policy is enabled.

## 13. API Surface

Initial internal APIs:

- `POST /api/imports`
- `GET /api/imports/:id`
- `POST /api/leads`
- `GET /api/leads`
- `GET /api/leads/:id`
- `PATCH /api/leads/:id`
- `POST /api/suppression`
- `GET /api/suppression`
- `POST /api/offers`
- `GET /api/offers`
- `POST /api/campaigns`
- `GET /api/campaigns`
- `PATCH /api/campaigns/:id`
- `POST /api/campaigns/:id/generate`
- `POST /api/campaigns/:id/review`
- `POST /api/campaigns/:id/schedule`
- `POST /api/campaigns/:id/pause`
- `POST /api/campaigns/:id/resume`
- `POST /api/unsubscribe/:token`
- `GET /api/inbox`
- `GET /api/inbox/threads/:id`
- `POST /api/inbox/threads/:id/classify`
- `POST /api/inbox/threads/:id/draft`
- `POST /api/inbox/threads/:id/send`
- `POST /api/pipeline/deals`
- `PATCH /api/pipeline/deals/:id`
- `GET /api/reports/overview`

## 14. Worker Jobs

Required jobs:

- `import.process`
- `lead.validate`
- `campaign.prepare_recipients`
- `email.send`
- `email.retry`
- `email.sync_replies`
- `email.process_bounce`
- `email.process_unsubscribe`
- `ai.generate_campaign`
- `ai.classify_reply`
- `ai.draft_reply`
- `score.recalculate_lead`
- `report.rollup`
- `domain.check_dns`
- `safety.pause_campaign_if_needed`

## 15. Development Order

Recommended order:

1. Scaffold app, database, Redis, worker.
2. Build data schema and migrations.
3. Build auth and settings.
4. Build offer library.
5. Build lead import and suppression.
6. Build lead table/profile.
7. Build campaign model and builder.
8. Build AI campaign generation.
9. Build safety checklist.
10. Build SMTP account setup and test send.
11. Build queue sender and rate limits.
12. Build unsubscribe endpoint.
13. Build send monitor and kill switch.
14. Build reply sync.
15. Build AI reply classification.
16. Build AI draft review.
17. Build hot lead scoring.
18. Build pipeline.
19. Build reports.
20. Harden deliverability and provider webhooks.

## 16. Suggested MVP Timeline

Aggressive MVP:

- Week 1: foundation, auth, database, offers, leads, CSV import, suppression.
- Week 2: campaign builder, AI copy generation, compliance checks, SMTP setup.
- Week 3: queue sender, throttling, unsubscribe, tracking, campaign monitor.
- Week 4: reply inbox, AI classification/drafts, hot lead scoring, simple pipeline.
- Week 5: reports, polish, deliverability hardening, real test campaign.

If working solo, expect 5-8 weeks for a dependable MVP. A rushed version can send emails sooner, but it should not scale volume until safety systems are complete.

## 17. MVP Launch Gate

Do not run real campaigns until all are true:

- Sending domain configured.
- SPF/DKIM/DMARC checklist completed or explicitly risk-accepted.
- Suppression list works.
- Unsubscribe works.
- Test send works.
- Queue throttling works.
- Campaign pause/kill switch works.
- Bounce/failure tracking exists.
- AI cannot use unapproved claims.
- AI cannot continue after unsubscribe.
- Import source/legal-basis fields are captured.
- Owner can inspect every outgoing email before first launch.

## 18. First Real Campaign Plan

Use a small controlled batch:

- 50-100 leads.
- One segment.
- One Virtuprose offer.
- One sending inbox/domain.
- One short sequence.
- AI drafts enabled.
- AI auto-send disabled.
- Manual owner approval for replies.

Review after 48-72 hours:

- invalid/bounce rate
- reply quality
- unsubscribe rate
- complaint/provider errors
- AI classification quality
- hot lead count

Only increase volume if quality is acceptable.

## 19. Definition Of Done

An MVP feature is done only when:

- database migration exists
- API is implemented
- UI flow exists
- worker behavior exists where needed
- audit log is recorded for important actions
- tests cover critical logic
- failure states are handled
- owner can recover from mistakes
- accessibility basics are met
- manual end-to-end test passes

## 20. Immediate Next Build Tasks

Start here:

1. Scaffold the app.
2. Add Postgres, Redis, Prisma, and worker.
3. Create the first database schema.
4. Build offer library.
5. Build lead import.
6. Build suppression list.
7. Build campaign model.
8. Add AI provider abstraction.
9. Add SMTP provider abstraction.
10. Build the first internal test flow.
