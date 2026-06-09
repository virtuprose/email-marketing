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
- Production SMTP is configured for `info@virtuprose.com`; confirm inbox receipt before relying on it.
- Run a test send and confirm mailbox receipt, not only a successful API response.
- Confirm owner hot-lead alert emails reach `moh@virtuprose.com` before relying on alerts.

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
- HTTPS is active.
- Confirm Meta App Dashboard is subscribed to message and status events at `https://sales.virtuprose.com/api/webhooks/meta/whatsapp`.

## Domain And Compliance

- SPF is configured for the sending provider.
- DKIM is configured and passing.
- DMARC exists at least in monitoring mode before sending volume.
- Unsubscribe links are present in every campaign email.
- Suppression list is checked before every queued send.
- Lead source, country, and legal basis are stored before campaign approval.

## Lead Import

- Open `/leads/import`.
- Test CSV upload with the example file.
- Test **Paste from Excel** with a header row and at least one lead row.
- Click **Check rows** and confirm accepted, flagged, duplicate, invalid, and suppressed counters make sense.
- Click **Import accepted rows** only after the preview looks correct.
- Review the import result page and keep rollback available for bad imports.

## AI Assistant And Replies

- OpenAI is configured; test one inbound reply before trusting hands-off AI replies.
- Open `/ai-assistant` and confirm the mode is correct:
  - **Auto Safe**: AI sends only safe high-confidence replies.
  - **Draft Only**: AI drafts but waits for owner approval.
  - **Test Mode**: AI classifies and drafts but never sends.
  - **Paused**: AI stores replies without drafting or sending.
- Confirm the owner alert email is `moh@virtuprose.com`.
- Confirm **Email me when meeting is booked** is enabled and points to the owner inbox.
- Confirm prompts and the knowledge base contain only approved services, portfolio links, pricing rules, FAQs, and forbidden claims.
- Try one intentionally invalid prompt or email value and confirm `/ai-assistant` shows inline errors without an error page.
- Confirm auto-reply safety rules are visible: confidence threshold, reply delay, daily cap, WhatsApp 24-hour window, and handoff intents.
- Test AI with a safe sample reply and a pricing/meeting sample reply.
- Safe sample should draft or auto-send only if Auto Safe rules pass.
- Pricing/meeting sample should hand off to the owner and not invent prices.
- In `/ai-assistant`, apply the default weekly availability or add manual slots before testing meeting booking.
- Paste replies into `/inbox` while inbound routing is not connected.
- If using a provider inbound parser, set `INBOUND_WEBHOOK_SECRET`.
- Connect provider inbound parser to `/api/inbound/replies`.
- Automatic email reply receiving is configured through IMAP for `info@virtuprose.com`; send one real email to confirm it appears in Replies.
- Review AI drafts manually unless Auto Safe behavior has been tested end to end.
- Do not send AI replies to unsubscribe, complaint, suppressed, or do-not-contact leads.
- Hot replies should be handled personally from the pipeline.
- Use **AI off for this lead** when the owner has taken over a conversation.

## Operating Rule

At 100k/month, do not jump straight to full volume. Ramp only after bounce, complaint, unsubscribe, reply quality, and test-inbox delivery are healthy.

For WhatsApp, start even lower. Use small daily caps until template quality, user replies, opt-outs, and Meta quality rating are stable.
