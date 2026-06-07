# Virtuprose Email Agent Ready-To-Use Checklist

Use this checklist before moving from local dry-run testing to real outreach.

Current VPS deployment:

- Public URL: `https://sales.virtuprose.com`
- App path: `/opt/virtuprose-sales-assistant`
- Credentials note: `/Users/muhammadzaid/.codex/virtuprose-sales-assistant-vps-credentials.txt`
- Detailed runbook: `docs/VPS_DEPLOYMENT.md`

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

## WhatsApp Cloud API

- `META_GRAPH_API_VERSION` is set to the Graph version used by the app.
- `META_WHATSAPP_ACCESS_TOKEN` is present and not expired.
- `META_PHONE_NUMBER_ID` matches the active connected Meta phone number.
- `META_WABA_ID` matches the active WhatsApp Business Account.
- `META_APP_SECRET` and `META_WEBHOOK_VERIFY_TOKEN` are set for webhooks.
- `META_WHATSAPP_DRY_RUN` is `true` until an intentional live test.
- Phone number status is `CONNECTED` in Meta.
- The token debug output shows `whatsapp_business_messaging` targeted to the intended WABA.
- At least one Meta template is `APPROVED` before any real outbound WhatsApp send.
- The dashboard template status has been synced after Meta approval.
- Webhook callback uses public HTTPS, not localhost.

Current status on VPS:

- Meta credentials are set.
- `META_WHATSAPP_DRY_RUN` is currently `false`, so WhatsApp sends are live.
- HTTPS is active; Meta App Dashboard webhook setup is still pending.

## Domain And Compliance

- SPF is configured for the sending provider.
- DKIM is configured and passing.
- DMARC exists at least in monitoring mode before sending volume.
- Unsubscribe links are present in every campaign email.
- Suppression list is checked before every queued send.
- Lead source, country, and legal basis are stored before campaign approval.

## AI Inbox

- OpenAI is configured; test one inbound reply before enabling any hands-off AI replies.
- Paste replies into `/inbox` while inbound routing is not connected.
- If using a provider inbound parser, set `INBOUND_WEBHOOK_SECRET`.
- Connect provider inbound parser to `/api/inbound/replies`.
- Review AI drafts manually before sending.
- Do not send AI replies to unsubscribe, complaint, suppressed, or do-not-contact leads.
- Hot replies should be handled personally from the pipeline.

## Operating Rule

At 100k/month, do not jump straight to full volume. Ramp only after bounce, complaint, unsubscribe, reply quality, and test-inbox delivery are healthy.

For WhatsApp, start even lower. Use small daily caps until template quality, user replies, opt-outs, and Meta quality rating are stable.
