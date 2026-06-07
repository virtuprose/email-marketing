# Virtuprose AI Email Sales Agent PRD

Version: 1.0  
Owner: Virtuprose  
Product type: Internal single-user AI sales engagement platform  
Primary goal: Convert imported cold or warm leads into qualified hot leads for Virtuprose services through compliant email outreach, AI-managed conversations, lead scoring, and human handoff.

## Current Build And Deployment Status

As of 2026-06-07, the internal product has been implemented and deployed for owner testing on the VPS at `http://31.97.213.79`.

Deployment and progress details are tracked in:

- `docs/VPS_DEPLOYMENT.md`
- `docs/PROJECT_PROGRESS.md`
- `docs/DEVELOPER_HANDOFF.md`

Key production gaps remaining:

- Add `OPENAI_API_KEY` for full AI reply classification and drafting.
- Add a real domain and HTTPS for Meta WhatsApp inbound webhooks.
- Add SMTP credentials and domain authentication before production email sending.
- Add scheduled database backups.

## 1. Executive Summary

Virtuprose needs an internal platform that behaves like an AI sales development employee: the user imports leads, selects the service/offering to sell, launches controlled email campaigns, and lets AI personalize outreach, monitor replies, continue conversations, score intent, and surface hot leads when personal involvement is needed.

This is not a public SaaS product and does not need billing, subscriptions, tenant management, or team permissions in the MVP. The system should prioritize sender reputation, compliance, inbox safety, clear handoff moments, and fast operational use.

The core MVP should ship as a single-user command center with:

- CSV lead import with validation, deduplication, consent/legal-basis fields, and suppression checks.
- Offer/product library for Virtuprose services.
- AI-assisted campaign builder with personalization and sequence generation.
- Throttled sending through configured SMTP or a chosen email provider.
- Reply ingestion through connected inboxes.
- AI reply classification, draft replies, and controlled auto-reply policies.
- Lead scoring and hot lead alerts.
- Simple pipeline from lead to conversation to hot lead to closed/lost.
- Compliance gates for unsubscribe, suppression, bounce handling, and domain setup.

## 1.1 Important Things Missing From The Original Idea

These should be included from day one because they protect the business and make the AI agent useful:

- Lead source and legal-basis tracking. The system must know where each lead came from, which region they belong to, and why it is acceptable to contact them.
- Approved Virtuprose claims library. AI should only use approved services, proof points, case studies, prices, and promises.
- Auto-reply guardrails. AI should not get full autonomy immediately; start with drafts and controlled auto-send rules by reply category and confidence.
- Reputation kill switch. The owner needs one action to pause all sending when bounce, complaint, unsubscribe, or provider errors spike.
- Handoff threshold. Define exactly when AI stops and the owner gets involved: pricing request, meeting request, strong buying signal, legal concern, angry reply, or unclear high-value opportunity.
- Lead source quality score. Not all CSV sources are equal; the product should learn which sources produce bounces, complaints, replies, and hot leads.
- Sending provider decision gate. Current SMTP is acceptable for testing, but 100k/month requires provider evaluation, webhooks, authentication, and reputation monitoring before scaling.

## 2. Product Vision

Build a private AI sales agent for Virtuprose that can run outreach safely, protect the sending domain, handle most early conversations, and bring only qualified opportunities to the owner.

The product should answer four questions every day:

1. Who should we email next?
2. Which offer should we send them?
3. Which replies need AI, and which need the owner?
4. Which leads are hot enough to close now?

## 3. Target Users

Primary user:

- Virtuprose owner/operator.
- Wants clients without hiring a full-time SDR or email marketing operator.
- Needs simple controls, clear risk warnings, and AI that can handle repetitive conversation work.

Lead audiences:

- B2B companies needing web design, Shopify/ecommerce work, SaaS/product development, maintenance, marketing, or automation.
- Agencies, founders, local businesses, ecommerce stores, recruiters, real estate businesses, and other professional segments can be supported, but MVP should organize them through segments and offers instead of trying to treat all leads the same.

## 4. Core Use Cases

- Import a CSV of leads from a trusted source.
- Clean, validate, deduplicate, and suppress risky contacts.
- Choose the Virtuprose offer being promoted.
- Generate campaign copy and follow-up sequence with AI.
- Review and approve the campaign before sending.
- Send slowly with daily limits, per-domain throttles, and automatic stop conditions.
- Track opens, clicks, replies, bounces, unsubscribes, complaints, and conversions.
- Let AI classify replies and draft or send safe responses.
- Escalate hot leads, meeting requests, objections, and sensitive replies to the owner.
- Move leads through a simple deal pipeline.

## 5. Compliance And Deliverability Principles

This PRD is product guidance, not legal advice. Legal review is recommended before high-volume global sending.

Required principles:

- Never bypass unsubscribe, suppression, bounce, complaint, or opt-out rules.
- Store lead source, region, consent or legal basis, import date, and proof notes.
- Default to conservative sending when region or consent status is unknown.
- Include accurate sender identity, physical postal address where required, and a clear unsubscribe link in commercial emails.
- Honor unsubscribe requests immediately in the system, even where the legal deadline is longer.
- Support one-click unsubscribe headers for marketing/subscribed mail.
- Authenticate sending domains with SPF, DKIM, and DMARC before production sending.
- Track bounce and complaint rates and pause sending automatically when thresholds are exceeded.
- Use gradual volume ramping, not sudden spikes.
- Avoid deceptive subject lines, misleading sender names, fake reply chains, fake urgency, or scraped-personal-data messaging.
- Keep AI replies honest: no false claims, no invented case studies, no fake relationship context.

Important regulatory/product references:

- FTC CAN-SPAM guidance requires truthful header information, non-deceptive subject lines, a clear opt-out method, a valid postal address, and honoring opt-outs within 10 business days.
- European Commission GDPR consent guidance emphasizes informed consent and easy withdrawal.
- ICO direct marketing guidance notes that identity must not be concealed and opt-out/contact methods must be provided; soft opt-in does not generally apply to prospects from bought or third-party lists.
- CRTC CASL guidance requires consent, identification information, and an unsubscribe mechanism for commercial electronic messages.
- Google and Yahoo sender guidance expects domain authentication, DMARC, low complaint rates, and one-click unsubscribe support for bulk/marketing senders.

## 6. Full User Journey: Imported Lead To Closed Deal

1. User imports a CSV.
2. System maps fields: email, name, company, website, role, country, source, segment, notes, offer fit.
3. System validates emails, removes duplicates, checks suppression lists, and flags missing legal basis.
4. User selects an offer from the Virtuprose offer library.
5. AI proposes segment-specific messaging, subject lines, personalization fields, and sequence steps.
6. User reviews campaign risk: volume, recipients, region mix, unsubscribe setup, domain health, spam-risk language, and daily send limit.
7. System queues emails and sends gradually.
8. Events are captured: sent, delivered if provider supports it, opened, clicked, replied, bounced, unsubscribed, complained.
9. Replies are threaded into the inbox.
10. AI classifies replies and chooses an action: draft response, auto-respond if allowed, ask for owner approval, suppress, or mark as hot.
11. Hot leads appear in the command center with context, summary, suggested next message, and recommended owner action.
12. Owner personally closes through email, phone, WhatsApp, or meeting outside the product.
13. Owner marks outcome: won, lost, not now, follow up later, do not contact.

## 7. Feature Requirements

### Lead Management

- CSV import with mapping, preview, validation, and rollback.
- Email validation and syntax checks before import.
- Deduplication by email, domain, company, and optional custom fields.
- Lead fields: name, email, company, website, role, industry, country, timezone, source, source URL, segment, tags, status, legal basis, consent notes, owner notes, last contacted, next action.
- Lead statuses: new, validated, suppressed, queued, contacted, replied, interested, hot, not interested, unsubscribe, bounced, do not contact, won, lost.
- Tags: hot, warm, cold, offer fit, segment, campaign, region, source.
- Global suppression list for unsubscribes, complaints, hard bounces, manual blocks, competitor domains, and risky domains.
- Activity timeline per lead.

### Offer/Product Library

The product should let the user choose what Virtuprose is selling before creating a campaign.

Offer fields:

- Offer name.
- Target audience.
- Pain points.
- Value proposition.
- Proof points/case studies.
- Services included.
- Pricing note or qualification note.
- CTA preference: reply, audit offer, call request, website review, proposal.
- Disallowed claims.
- AI voice rules.

MVP example offers:

- Website redesign and conversion improvement.
- Shopify/ecommerce store revamp.
- SaaS/MVP product build.
- Website maintenance and support.
- Automation and AI workflow setup.

### Campaign Builder

- Campaign objective: awareness, audit offer, meeting request, reactivation, follow-up, proposal.
- Audience selection from segments/tags/import batches.
- Offer selection from product library.
- AI-generated first email and follow-up steps.
- Personalization variables: first name, company, website, industry, pain point, offer, source note.
- Safety review for spammy language, unsupported claims, missing unsubscribe, missing sender address, and high-risk phrases.
- A/B subject line and body variant support from Phase 2 onward.
- Test email to owner before launch.
- Campaign approval checklist.

### Sending And Scheduling

- Sending through current SMTP initially, with provider abstraction for SES, Mailgun, SendGrid, Postmark, Resend, or Google/Outlook later.
- Per-inbox and per-domain daily limits.
- Time-window scheduling by recipient timezone where available.
- Queue-based sending with retry policies.
- Bounce and complaint webhooks where provider supports them.
- Automatic pause rules:
  - hard bounce spike,
  - complaint spike,
  - unsubscribe spike,
  - provider errors,
  - domain authentication failure,
  - missing unsubscribe link,
  - campaign exceeds approved volume.

### Deliverability

- Domain setup checklist: SPF, DKIM, DMARC, MX, reverse DNS where relevant, tracking domain, bounce domain.
- DMARC status monitoring.
- Provider reputation/error monitoring.
- Spam-risk copy scan.
- Domain and inbox sending limits.
- Gradual volume ramp.
- Inbox placement seed testing can be Phase 2.
- Blacklist monitoring can be Phase 2 or 3.
- Open tracking must be treated as directional because privacy protections can distort it.

### Compliance

- Legal-basis field per lead.
- Region/country field per lead.
- Required unsubscribe link in every marketing or outreach campaign.
- One-click unsubscribe headers where supported.
- Suppression list checked before every send.
- Consent/source audit log.
- Data deletion workflow.
- Export lead data workflow.
- AI policy preventing deceptive claims, fake urgency, hidden identity, and continued outreach after opt-out.

### Tracking And Analytics

- Campaign metrics: sent, failed, bounced, opened, clicked, replied, unsubscribed, complained, positive replies, hot leads, won deals.
- Lead engagement score.
- Lead fit score.
- AI intent score.
- Combined hot-lead score.
- Revenue/deal value field can be manually entered.
- Attribution: campaign, offer, segment, variant, source.
- Dashboard should emphasize reply quality and hot leads over vanity open rate.

### Inbox And Reply Management

- Connect one or more sending inboxes.
- Thread replies by Message-ID, In-Reply-To, References, recipient email, and campaign metadata.
- AI reply categories:
  - interested,
  - meeting requested,
  - asks for pricing,
  - asks for portfolio/proof,
  - objection,
  - not interested,
  - unsubscribe,
  - out of office,
  - wrong person,
  - complaint,
  - unclear,
  - hot lead.
- AI actions:
  - draft response,
  - auto-send safe response,
  - request approval,
  - mark hot,
  - suppress,
  - follow up later,
  - stop sequence.
- Owner inbox view with filters: hot, needs approval, auto-replied, negative, unsubscribed, bounced.

### Pipeline And Deal Management

MVP pipeline should be lightweight:

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

Each deal should include:

- Lead summary.
- Conversation summary.
- Fit score.
- Intent score.
- Last AI action.
- Suggested owner action.
- Manual notes.
- Estimated value.
- Next follow-up date.

### Team Collaboration

Out of MVP because the product is single-user. Add only an audit log and owner notes in MVP. Multi-user permissions can be Phase 5 if the internal operation grows.

### Settings And Admin

- Sending accounts.
- Domain setup.
- SMTP/provider credentials.
- Tracking domain.
- Physical address/sender identity.
- Unsubscribe page.
- AI behavior rules.
- Auto-reply permissions.
- Daily sending limits.
- Suppression lists.
- Import templates.
- Offer library.

## 8. UX Brief And UI Requirements

Primary user type: Virtuprose owner/operator.  
User goal: Launch safe campaigns and only spend time on qualified hot leads.  
Business goal: Generate client opportunities without hiring an SDR.  
Jobs-to-be-done: Import leads, choose offer, launch outreach, let AI handle replies, review hot leads, close deals.  
Main anxiety: Damaging domain reputation, sending illegal/spammy emails, missing interested replies, AI saying the wrong thing.  
Desired action: Daily review of hot leads and AI approvals.  
Success metric: Qualified hot leads per month and won deals from campaigns.  
Key constraints: single user, global compliance, 100k/month ambition, current SMTP, ASAP MVP, AI in MVP.

### Navigation Model

Primary nav:

- Command Center.
- Leads.
- Campaigns.
- Inbox / AI Agent.
- Pipeline.
- Reports.
- Settings.

### Major Screens

Command Center:

- Hot leads requiring owner.
- Replies waiting for approval.
- AI auto-replies sent today.
- Active campaign health.
- Domain/inbox risk warnings.
- Sending volume today and this month.
- Next recommended action.

Leads:

- Table with search, filters, segments, tags, status, score, source, country, last activity.
- Import CSV flow.
- Lead profile drawer with timeline and AI summary.
- Suppression and validation indicators.

Campaigns:

- Campaign list with status, offer, segment, health, reply rate, hot leads.
- Campaign builder stepper:
  1. Select offer.
  2. Select audience.
  3. Generate/edit emails.
  4. Configure sending limits.
  5. Compliance/deliverability review.
  6. Launch.

Inbox / AI Agent:

- Unified threaded inbox.
- AI classification labels.
- Suggested response panel.
- Approve, edit, send, auto-send rule, mark hot, suppress, stop sequence.
- Conversation summary and lead context side panel.

Pipeline:

- Kanban or list view by lead stage.
- Hot-lead lane should be visually dominant.
- Deal detail includes conversation, AI summary, next best action, and manual outcome.

Reports:

- Campaign performance by offer, segment, source, and variant.
- Reply quality metrics.
- Hot lead rate.
- Bounce/complaint/unsubscribe trend.
- Domain health trend.
- Won/lost attribution.

Settings:

- Sending accounts.
- Domain authentication.
- Compliance identity.
- Unsubscribe page.
- Suppression lists.
- AI policy and auto-reply rules.
- API/provider credentials.

### Visual Direction

Visual thesis: calm operator cockpit, not flashy marketing dashboard. Dense but readable, with strong risk/status hierarchy.  
Brand thesis: Virtuprose should feel precise, premium, and service-led.  
Layout thesis: first viewport should show work queue and campaign health, not vanity charts.  
Interaction thesis: fast review actions, clear AI confidence states, and prominent pause/stop controls.  
Content thesis: the user should immediately know what AI handled, what needs approval, and which leads are ready for personal closing.

Recommended UI style:

- Clean SaaS interface with restrained color.
- Neutral surfaces, high contrast text, one primary accent for action.
- Semantic colors only for status: success, warning, danger, info.
- Compact tables with excellent filtering.
- Side drawers for context instead of full-page navigation for every detail.
- Avoid generic AI gradients and decorative widgets.

### Design System Requirements

Even for an internal product, the UI should use reusable semantic tokens and components so dense screens stay consistent.

Required semantic tokens:

- Color: bg-default, bg-subtle, bg-elevated, text-strong, text-default, text-muted, border-subtle, border-strong, action-primary, action-secondary, state-success, state-warning, state-danger, focus-ring.
- Typography: display, title, heading, body, label, caption, numeric.
- Layout: space-1 through space-12, radius-sm, radius-md, radius-lg, shadow-subtle, shadow-raised, container-sm, container-md, container-lg.
- Motion: duration-fast, duration-base, duration-slow, easing-standard, reduced-motion fallback.

Reusable component families:

- Lead table, lead profile drawer, import mapper, campaign stepper, email editor, compliance checklist, sending health banner, AI confidence badge, reply thread, AI draft review, hot-lead alert, pipeline card, metric tile, filter bar, confirmation modal.

Component rules:

- Every status component must support success, warning, danger, neutral, loading, and disabled states.
- Every AI decision must show classification, confidence, reason, and available owner action.
- Tables must keep active filters visible and preserve state when opening lead details.
- Destructive actions require confirmation; reversible actions should prefer undo.

### Interaction States And Microcopy

Required states:

- CSV import: empty, mapping, validating, duplicate warning, suppression warning, success, failed rows, rollback.
- Campaign launch: draft, missing setup, ready, scheduled, sending, paused, completed, failed.
- Sending account: unauthenticated, DNS pending, verified, warming/ramping, restricted, paused.
- Inbox: no replies, needs approval, AI drafted, auto-replied, escalated, suppressed.
- Lead: no activity, contacted, replied, hot, do not contact, won/lost.

Microcopy examples:

- Launch disabled: "Fix compliance checks before sending."
- Suppression warning: "This lead is blocked because they unsubscribed or bounced."
- AI approval: "AI drafted a reply. Review before sending because confidence is below your auto-send threshold."
- Pause reason: "Campaign paused because hard bounces exceeded the safety limit."
- Hot lead alert: "This lead asked for pricing and timeline. Owner follow-up recommended."

### Accessibility And QA Requirements

- WCAG 2.2 AA target.
- Keyboard navigable campaign builder, tables, inbox, modals, and drawers.
- Visible focus states.
- Proper labels for all form inputs.
- Field-level validation tied to inputs.
- Button/link semantics respected.
- Tables support readable sorting and filtering states.
- Color is never the only way to communicate status.
- Responsive support for 375px, 768px, 1024px, and 1440px widths.
- Confirmation only for destructive actions such as deleting import batch, clearing suppression, or launching a large send.

## 9. Technical Architecture

Recommended approach: modular monolith first, worker-based backend, event-driven where it matters.

### Stack Recommendation

- Frontend: Next.js with TypeScript.
- Backend: Node.js with NestJS or Fastify. NestJS is preferred if the codebase will grow into structured modules.
- Database: PostgreSQL.
- ORM: Prisma or Drizzle.
- Queue: Redis + BullMQ.
- File storage: S3-compatible storage for CSV imports and exports.
- Email provider layer: abstraction around SMTP and future providers.
- Inbound mail: IMAP polling initially if SMTP-only, provider webhooks later where possible.
- AI: provider abstraction with prompt/version logging and structured classification outputs.
- Analytics/events: append-only event table in Postgres for MVP; move to ClickHouse/BigQuery later if volume grows.
- Background jobs: import processing, validation, send queue, reply sync, AI classification, score recalculation, domain checks, report rollups.

### Core Data Model

Suggested tables:

- users
- sending_accounts
- sending_domains
- domain_dns_checks
- offers
- leads
- lead_tags
- lead_segments
- import_batches
- suppression_entries
- campaigns
- campaign_steps
- campaign_variants
- campaign_recipients
- email_messages
- email_events
- reply_threads
- ai_classifications
- ai_drafts
- lead_scores
- pipeline_deals
- tasks
- audit_logs
- settings

### Sending Infrastructure

- Never send directly inside HTTP requests.
- Every outbound message becomes a queued send job.
- Each job checks suppression, legal basis, campaign state, account health, and daily limits immediately before send.
- Use per-account, per-domain, and global rate limiters.
- Store provider message ID, Message-ID header, campaign ID, lead ID, and thread metadata.
- Use separate bounce/return-path handling if provider supports it.
- Prefer dedicated tracking domain over shared platform domain.

### AI Architecture

AI modules:

- Lead enrichment from existing fields only in MVP.
- Offer-to-segment campaign generation.
- Personalization generation.
- Spam-risk and claim-risk review.
- Reply classification.
- Reply drafting.
- Conversation summary.
- Hot-lead scoring.
- Suggested next action.

Guardrails:

- AI cannot email suppressed leads.
- AI cannot continue after unsubscribe, complaint, or hard bounce.
- AI cannot invent past relationship, client results, guarantees, pricing, or availability.
- AI should escalate legal threats, complaints, angry replies, sensitive personal data, and unclear high-value replies.
- Auto-send is disabled until user approves a category policy.
- Every AI action is logged with input, output, model/provider, policy version, and confidence.

### Security

- Encrypt SMTP credentials and API keys at rest.
- Use secure secrets management.
- Apply least-privilege database access.
- Keep audit logs for send, import, AI decision, suppression, and settings changes.
- Validate CSV uploads and limit file size.
- Protect unsubscribe endpoints from abuse.
- Rate-limit public tracking/unsubscribe endpoints.
- Avoid storing unnecessary personal data.
- Add data retention and deletion controls.

### Scalability

100k/month is manageable with a monolith plus workers if rate limits and queues are designed correctly.

Scale path:

- Start with one API app, one worker app, Postgres, Redis.
- Split workers by job type when load grows.
- Move event analytics to column storage later.
- Add provider-specific webhook processors.
- Add multiple sending accounts/domains only after compliance and monitoring are stable.

## 10. Third-Party Integrations

MVP:

- Current SMTP account.
- Email validation provider: ZeroBounce, NeverBounce, BriteVerify, or similar.
- AI provider for classification/drafting.
- DNS lookup service or direct DNS checks.

Phase 2:

- Amazon SES, Mailgun, SendGrid, Postmark, or Resend depending on deliverability and webhook needs.
- Google Postmaster Tools where available.
- Yahoo Complaint Feedback Loop where eligible.
- Blacklist monitoring provider.
- Inbox placement/seed testing provider.

Phase 3+:

- CRM export/import if needed later.
- Calendar/WhatsApp not built into product, but owner can manually use them after hot-lead handoff.
- Analytics warehouse only if reporting outgrows Postgres.

No payment tools are needed.

## 11. Phased Roadmap

### Phase 1: MVP AI Sales Agent

Goal: Launch safe internal outreach and convert replies into hot-lead handoffs.

Features:

- Single-user login.
- CSV import with mapping, validation, dedupe, and suppression.
- Offer library.
- Lead table and lead profile.
- AI campaign generator.
- Campaign approval checklist.
- SMTP sending account.
- Queue-based throttled sending.
- Unsubscribe page and suppression list.
- Basic open/click/reply/bounce tracking where technically supported.
- Inbox sync.
- AI reply classification.
- AI reply drafts.
- Controlled auto-reply for explicitly allowed low-risk reply types.
- Hot lead score and command center.
- Simple pipeline.

User stories:

- As the owner, I can import leads and see which are safe to contact.
- As the owner, I can choose a Virtuprose offer and generate a campaign.
- As the owner, I can approve a campaign only after safety checks pass.
- As the owner, I can let AI draft replies and escalate hot leads.
- As the owner, I can see which leads need my personal attention.

Backend requirements:

- Auth, lead import pipeline, email queue, SMTP send service, inbound reply sync, tracking endpoints, suppression service, AI classification service, scoring service.

UI/UX requirements:

- Command Center, Leads, Campaigns, Campaign Builder, Inbox/AI Agent, Pipeline, Settings.
- Make daily next action obvious within five seconds.

Third-party tools:

- SMTP, AI provider, email validation, DNS checks.

Success metrics:

- First campaign launched safely.
- Less than 3 percent hard bounce rate after validation.
- Complaint rate stays below provider safety thresholds.
- 100 percent unsubscribe suppression enforcement.
- AI classifies at least 90 percent of replies into useful buckets.
- Owner receives a daily hot-lead queue.

Risks/challenges:

- Current SMTP may not support reliable webhooks or high volume.
- AI auto-replies can create reputational risk.
- Global cold outreach laws vary by region.
- Bad lead sources can damage deliverability.

### Phase 2: Deliverability And Compliance Hardening

Goal: Make sending safer before scaling volume.

Features:

- Provider integration with webhooks.
- SPF/DKIM/DMARC monitoring.
- One-click unsubscribe headers.
- Bounce classification.
- Complaint feedback handling where available.
- Sending ramp rules.
- Blacklist monitoring.
- Seed/inbox placement tests.
- Campaign copy risk scoring.
- A/B testing.

Backend requirements:

- Provider adapters, webhook ingestion, domain health jobs, complaint processing, blacklist jobs, send-rate policy engine.

UI/UX requirements:

- Domain health screen.
- Sending account risk screen.
- Campaign health warnings.
- Safer launch checklist.

Third-party tools:

- SES/Mailgun/SendGrid/Postmark/Resend, blacklist monitor, seed testing, Google/Yahoo reputation tools where available.

Success metrics:

- Lower bounce and complaint rates.
- No sends from unverified domains.
- Clear reason for every campaign pause.
- Volume can ramp toward 100k/month without sudden spikes.

Risks/challenges:

- Provider restrictions on cold outreach.
- DNS setup mistakes.
- Tracking domains can hurt deliverability if poorly configured.

### Phase 3: Advanced Analytics And Pipeline

Goal: Understand which offers, segments, and messages create real opportunities.

Features:

- Offer-level reporting.
- Segment-level performance.
- Lead source ROI.
- Revenue/deal tracking.
- Conversation quality analytics.
- Advanced pipeline views.
- Follow-up reminders.
- Manual outcome attribution.

Backend requirements:

- Reporting rollups, attribution models, score history, pipeline event tracking.

UI/UX requirements:

- Reports screen focused on replies, hot leads, and deals.
- Pipeline detail views.
- Drilldowns by offer, segment, source, and campaign.

Third-party tools:

- Optional analytics warehouse if needed.

Success metrics:

- Clear best-performing offer and segment.
- Hot lead to won-deal conversion tracked.
- Owner can stop low-performing campaigns quickly.

Risks/challenges:

- Small sample sizes can mislead.
- Open tracking can be inaccurate.
- Manual deal outcomes must be maintained.

### Phase 4: Advanced AI Autopilot

Goal: Let AI handle more conversation work while preserving owner control and brand trust.

Features:

- AI playbooks by offer.
- Objection handling library.
- AI conversation goals.
- Auto-send rules by reply type and confidence.
- AI follow-up timing recommendations.
- AI lead prioritization.
- AI campaign retrospectives.
- AI learns from won/lost outcomes.

Backend requirements:

- Policy engine, prompt/version control, evaluation datasets, auto-reply approval rules, model monitoring, regression tests for AI behavior.

UI/UX requirements:

- AI behavior settings.
- Auto-send policy review.
- Confidence thresholds.
- AI audit trail.
- "Why this is hot" explanations.

Third-party tools:

- AI provider, vector search if knowledge base grows, evaluation tooling.

Success metrics:

- AI handles majority of low-risk replies.
- Owner intervention focuses on qualified leads.
- No policy violations from AI replies.

Risks/challenges:

- AI hallucination.
- Brand tone drift.
- Over-automation can annoy prospects.

### Phase 5: Enterprise-Grade Internal Scale And Integrations

Goal: Make the internal system robust enough for larger campaigns and optional future team use.

Features:

- Multiple domains/accounts.
- Advanced roles if team is added later.
- CRM exports.
- API access.
- Advanced compliance logs.
- Data retention automation.
- Backup/restore.
- Disaster recovery.
- Optional multi-brand support if Virtuprose runs more than one service brand.

Backend requirements:

- Stronger permission model, domain/account routing, backup jobs, data lifecycle jobs, external API layer.

UI/UX requirements:

- Account/domain management.
- Advanced settings.
- Audit log screens.
- Integration settings.

Third-party tools:

- CRM, storage backup, monitoring, error tracking, observability.

Success metrics:

- Reliable operation at or above 100k/month.
- Clear audit trail for every lead and message.
- Fast recovery from provider/domain problems.

Risks/challenges:

- Complexity grows quickly.
- Multiple domains increase compliance and reputation management burden.

## 12. Recommended Extra Features You Should Include

These are important for your use case:

- Offer library: choose what Virtuprose is selling before outreach.
- Legal-basis ledger: source, region, consent/legal basis, proof note.
- AI guardrail policy: what AI can and cannot say.
- Hot-lead handoff summary: why this lead is hot, what they asked, what to do next.
- Reputation kill switch: instant pause across campaign/account/domain.
- Bad-lead quarantine: imports with risky source, missing region, or high invalid rate cannot send until reviewed.
- Source quality score: compare lead sources by bounce, reply, unsubscribe, and hot-lead rate.
- Negative intent handling: AI suppresses people who say no, stop, unsubscribe, remove me, wrong person, or complain.
- Claim library: approved proof points and case studies AI can use.
- AI evaluation set: test replies before enabling auto-send.
- Reply SLA: hot replies should be surfaced immediately.
- Daily digest: what AI did, what needs approval, what is hot, what is risky.

## 13. MVP Scope

In scope:

- Single user.
- Internal Virtuprose use only.
- CSV import.
- Offer library.
- Lead management.
- Campaign builder.
- AI copy and personalization.
- SMTP/provider sending abstraction.
- Queue and throttling.
- Unsubscribe and suppression.
- Basic tracking.
- Reply inbox.
- AI classification and drafts.
- Hot lead scoring.
- Simple pipeline.
- Compliance and domain setup checklist.

Out of MVP:

- Payments/subscriptions.
- Public SaaS tenant management.
- Team roles.
- Native WhatsApp.
- Native calendar booking.
- Lead scraping.
- Full CRM replacement.
- Advanced deliverability testing.
- Complex automation builder.
- Enterprise integrations.

## 14. Risks, Compliance Concerns, And Mitigations

- Risk: Global cold outreach may be restricted in some regions.
  - Mitigation: store region/legal basis, suppress unknown-risk leads, and use conservative defaults.

- Risk: 100k/month from current SMTP can damage deliverability.
  - Mitigation: provider evaluation, gradual ramping, daily limits, health monitoring, pause rules.

- Risk: AI replies with inaccurate claims.
  - Mitigation: approved claim library, no hallucination policy, confidence thresholds, approval queue.

- Risk: Bad CSV sources create high bounces or complaints.
  - Mitigation: validation, source scoring, import quarantine, hard stop thresholds.

- Risk: Owner misses hot replies.
  - Mitigation: command center, hot lead alerts, daily digest, priority inbox.

- Risk: Open tracking is unreliable.
  - Mitigation: prioritize replies, clicks, positive sentiment, and deals.

- Risk: Unsubscribe is mishandled.
  - Mitigation: global suppression check before every send and immediate suppression after opt-out.

## 15. Success Metrics

Operational:

- Import success rate.
- Valid email rate.
- Duplicate/suppressed lead detection rate.
- Sends completed vs failed.
- Queue processing latency.

Deliverability:

- Bounce rate.
- Complaint rate.
- Unsubscribe rate.
- Provider error rate.
- Domain health status.

Sales:

- Reply rate.
- Positive reply rate.
- Hot lead rate.
- Owner handoff count.
- Hot lead to won-deal conversion.
- Revenue attributed to campaigns.

AI:

- Classification accuracy.
- Draft approval rate.
- Auto-reply safe completion rate.
- Escalation accuracy.
- Hallucination/policy violation count.

## 16. Suggested Next Steps

1. Define Virtuprose's first 3 offers and approved proof points.
2. Choose initial sending route: current SMTP for testing, then provider evaluation before scaling.
3. Build database schema and import pipeline first.
4. Build suppression and unsubscribe before campaign sending.
5. Build campaign builder and queue-based sender.
6. Build reply ingestion and AI classification.
7. Run first internal test with 50 to 100 leads.
8. Review bounce/reply quality before increasing volume.
9. Enable AI drafts before AI auto-send.
10. Enable limited auto-send only after reply categories prove safe.

## 17. Phase-By-Phase UI Scope

Phase 1:

- Command Center, Leads, Campaign Builder, Inbox/AI Agent, Pipeline, Settings.

Phase 2:

- Domain Health, Sending Account Health, Deliverability Review, A/B Results.

Phase 3:

- Reports, Offer Analytics, Segment Analytics, Source Quality, Deal Attribution.

Phase 4:

- AI Playbooks, Auto-Reply Rules, AI Audit Trail, AI Retrospectives.

Phase 5:

- Advanced Integrations, Audit Logs, Backup/Restore, Multi-domain Operations.

## 18. Compliance Source Links

- FTC CAN-SPAM Compliance Guide: https://www.ftc.gov/business-guidance/resources/can-spam-act-compliance-guide-business
- European Commission GDPR consent guidance: https://commission.europa.eu/law/law-topic/data-protection/rules-business-and-organisations/legal-grounds-processing-data/grounds-processing/when-consent-valid_en
- ICO electronic mail marketing guidance: https://ico.org.uk/for-organisations/direct-marketing-and-privacy-and-electronic-communications/guide-to-pecr/electronic-and-telephone-marketing/electronic-mail-marketing/
- CRTC CASL guidance: https://crtc.gc.ca/eng/com500/guide.htm
- Google email sender guidelines: https://support.google.com/a/answer/81126
- Google bulk sender FAQ: https://support.google.com/a/answer/14229414
- Yahoo Sender Hub best practices: https://senders.yahooinc.com/best-practices/
- Yahoo Complaint Feedback Loop: https://senders.yahooinc.com/complaint-feedback-loop/
