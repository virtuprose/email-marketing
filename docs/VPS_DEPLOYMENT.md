# Virtuprose Sales Assistant VPS Deployment

Last updated: 2026-06-07

This document records the current VPS deployment for the internal Virtuprose Sales Assistant.

## Current Deployment

- Public test URL: `http://31.97.213.79`
- VPS SSH host: `root@31.97.213.79`
- Server OS: Ubuntu 22.04
- App directory: `/opt/virtuprose-sales-assistant`
- Docker Compose project: `virtuprose-sales-assistant`
- Nginx route: server IP on port `80`
- Internal app port: `127.0.0.1:3004`
- App base URL: `http://31.97.213.79`
- Credential note on owner machine: `/Users/muhammadzaid/.codex/virtuprose-sales-assistant-vps-credentials.txt`

Do not commit the credential note or any `.env` file.

## Services

The VPS runs this app as four Docker services:

- `app`: Next.js dashboard and API routes.
- `worker`: BullMQ worker for email and WhatsApp queues.
- `postgres`: production app database.
- `redis`: queue and worker state.

The app was deployed without changing the existing Orvia dialer containers on the same VPS.

## Data Persistence

Postgres and Redis data are stored in Docker named volumes:

- `virtuprose-sales-assistant_postgres-data`
- `virtuprose-sales-assistant_redis-data`

These volumes contain the deployed app data. Do not delete them unless a full reset is intended.

## Deployment Commands

Run these on the VPS:

```bash
cd /opt/virtuprose-sales-assistant
docker compose --env-file .env.production -p virtuprose-sales-assistant -f docker-compose.production.yml up -d --build
```

Check service status:

```bash
cd /opt/virtuprose-sales-assistant
docker compose --env-file .env.production -p virtuprose-sales-assistant -f docker-compose.production.yml ps
```

View logs:

```bash
cd /opt/virtuprose-sales-assistant
docker compose --env-file .env.production -p virtuprose-sales-assistant -f docker-compose.production.yml logs -f app worker
```

Health check:

```bash
curl http://127.0.0.1:3004/api/health
curl http://31.97.213.79/api/health
```

Expected result:

```json
{ "ok": true, "database": "ok", "redis": "ok" }
```

## Environment Status

Configured on the VPS:

- `DATABASE_URL`
- `REDIS_URL`
- `APP_BASE_URL=http://31.97.213.79`
- `BASIC_AUTH_USER`
- `BASIC_AUTH_PASSWORD`
- `INBOUND_WEBHOOK_SECRET`
- `META_GRAPH_API_VERSION=v25.0`
- `META_WHATSAPP_ACCESS_TOKEN`
- `META_PHONE_NUMBER_ID`
- `META_WABA_ID`
- `META_APP_SECRET`
- `META_WEBHOOK_VERIFY_TOKEN`
- `META_VALIDATE_SIGNATURE=true`
- `META_WHATSAPP_DRY_RUN=false`

Missing or pending:

- `OPENAI_API_KEY`
- `SMTP_PASS`
- `SMTP_PASSWORD`
- Real domain and HTTPS certificate
- Meta webhook callback using public HTTPS

## Current Access

The app uses Basic Auth for the single owner account.

Do not store the username or password in this document. The local private credential file is:

```text
/Users/muhammadzaid/.codex/virtuprose-sales-assistant-vps-credentials.txt
```

## Nginx

Temporary IP-based route:

```text
/etc/nginx/sites-available/virtuprose-sales-assistant-ip
/etc/nginx/sites-enabled/virtuprose-sales-assistant-ip
```

The current route is acceptable for internal testing, but production WhatsApp webhooks need HTTPS.

Recommended next route:

```text
https://sales.virtuprose.com
```

After DNS points to `31.97.213.79`, create a normal Nginx server block and issue a Let's Encrypt certificate.

## Backup Commands

Create a Postgres backup:

```bash
mkdir -p /opt/backups/virtuprose-sales-assistant
docker exec virtuprose-sales-assistant-postgres-1 pg_dump -U email_agent email_agent \
  > /opt/backups/virtuprose-sales-assistant/email_agent_$(date +%F_%H%M%S).sql
```

List backups:

```bash
ls -lh /opt/backups/virtuprose-sales-assistant
```

Redis is used for queue state. The critical long-term data is in Postgres.

## Redeploy From Local Machine

From the local project folder:

```bash
rsync -az --delete \
  --exclude=.git \
  --exclude=node_modules \
  --exclude=.next \
  --exclude=.env \
  --exclude=.env.local \
  --exclude=.env.production \
  --exclude=coverage \
  --exclude=tsconfig.tsbuildinfo \
  /Users/muhammadzaid/Documents/email-marketing/ \
  root@31.97.213.79:/opt/virtuprose-sales-assistant/

ssh root@31.97.213.79 'cd /opt/virtuprose-sales-assistant && docker compose --env-file .env.production -p virtuprose-sales-assistant -f docker-compose.production.yml up -d --build'
```

## Important Production Notes

- `META_WHATSAPP_DRY_RUN=false` means WhatsApp sends are live.
- Do not start bulk sending until a single test lead/template flow is verified.
- Inbound WhatsApp replies and AI auto-replies require a public HTTPS webhook URL.
- AI classification and AI reply drafting require `OPENAI_API_KEY`.
- Email sending requires SMTP credentials and domain deliverability setup.
