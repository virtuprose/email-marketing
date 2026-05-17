# Virtuprose Email Agent Ready-To-Use Checklist

Use this checklist before moving from local dry-run testing to real outreach.

## Local App

- App runs at `http://localhost:3000`.
- Worker runs in a second terminal with `npm run worker`.
- Database and Redis are reachable from `/api/health`.
- Basic auth is enabled with `BASIC_AUTH_USER` and `BASIC_AUTH_PASSWORD`.

## Sending

- Keep dry-run enabled until live inbox receipt is proven.
- Configure sender name, sender email, physical address, and reply-to in Settings.
- Set conservative caps first: low daily cap, low per-minute cap, and per-domain cap.
- Confirm `SMTP_PASS` is present before disabling dry-run.
- Run a test send and confirm mailbox receipt, not only a successful API response.

## Domain And Compliance

- SPF is configured for the sending provider.
- DKIM is configured and passing.
- DMARC exists at least in monitoring mode before sending volume.
- Unsubscribe links are present in every campaign email.
- Suppression list is checked before every queued send.
- Lead source, country, and legal basis are stored before campaign approval.

## AI Inbox

- Paste replies into `/inbox` while inbound routing is not connected.
- If using a provider inbound parser, set `INBOUND_WEBHOOK_SECRET`.
- Connect provider inbound parser to `/api/inbound/replies`.
- Review AI drafts manually before sending.
- Do not send AI replies to unsubscribe, complaint, suppressed, or do-not-contact leads.
- Hot replies should be handled personally from the pipeline.

## Operating Rule

At 100k/month, do not jump straight to full volume. Ramp only after bounce, complaint, unsubscribe, reply quality, and test-inbox delivery are healthy.
