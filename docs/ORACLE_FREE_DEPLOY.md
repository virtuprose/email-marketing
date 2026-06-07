# Oracle Free VM Deployment

Status: historical fallback only.

The active deployment is now the VPS deployment documented in `docs/VPS_DEPLOYMENT.md`.

Oracle Free was tested, but the free VM was not stable enough for this app because it needs a web app, worker, Postgres, Redis, and reliable remote access. Keep this document only as a fallback reference.

This project should run on one Oracle Always Free VM because it needs a web app, Postgres, Redis, and a persistent worker.

## Services

- `app`: Next.js dashboard and API routes.
- `worker`: BullMQ email and WhatsApp queue processor.
- `postgres`: local database volume.
- `redis`: local queue volume.

## First deploy

On the Oracle VM:

```bash
sudo apt-get update
sudo apt-get install -y ca-certificates curl git ufw
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker ubuntu
newgrp docker
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw --force enable
```

Upload or clone the project into `/opt/virtuprose-sales-assistant`, then create `.env.production` from `.env.production.example`.

Start:

```bash
docker compose -f docker-compose.production.yml --env-file .env.production up -d --build
```

Check:

```bash
docker compose -f docker-compose.production.yml --env-file .env.production ps
docker compose -f docker-compose.production.yml --env-file .env.production logs -f app worker
curl http://localhost/api/health
```

## Important

- Keep `META_WHATSAPP_DRY_RUN="true"` until the live WhatsApp test is approved.
- Set `APP_BASE_URL` to the public URL before using Meta webhooks.
- Meta webhooks require HTTPS, so add a real domain before production WhatsApp receiving.
- Do not commit `.env.production`.
