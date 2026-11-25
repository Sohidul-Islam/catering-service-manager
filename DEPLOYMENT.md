# Deployment Guide (Vercel + Turso SQLite)

This application stays on **SQLite** using **Turso (libSQL)** in production so it works seamlessly on Vercel's serverless platform.

- When `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN` are set, Prisma connects to Turso via `@prisma/adapter-libsql`.
- When `TURSO_DATABASE_URL` is omitted locally, Prisma falls back to local `DATABASE_URL` (`file:./dev.db`).

## 1. Push Schema & Seed Admin to Turso

With `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN` set in `.env`:

```bash
npm run db:push-turso
INITIAL_ADMIN_EMAIL="admin@yourcompany.com" INITIAL_ADMIN_PASSWORD="StrongPassword123!" npm run db:seed
```

> To wipe all guests, meals, invoices, and payments back to 1 clean admin:
> ```bash
> npm run reset-db
> ```

## 2. Configure Environment Variables in Vercel

Import the GitHub repo in Vercel (**Project Settings → Environment Variables**) and add:

- `TURSO_DATABASE_URL` = `libsql://...turso.io`
- `TURSO_AUTH_TOKEN` = your Turso auth token
- `JWT_SECRET` = long random string (`openssl rand -hex 32`)
- `CRON_SECRET` = long random string (`openssl rand -hex 32`)
- `NEXT_PUBLIC_APP_URL` = `https://your-project.vercel.app`
- `RESEND_API_KEY` = your Resend API key
- `RESEND_FROM_EMAIL` = your verified Resend sender email
- `RESEND_FROM_NAME` = `Office Meal Management`
- `INITIAL_ADMIN_EMAIL` / `INITIAL_ADMIN_PASSWORD` *(optional if seeding during build)*

## 3. Vercel Build Command

Keep default `npm run build` (if you already ran `db:push-turso` & `db:seed` above), **or** set the Build Command in Vercel to:

```bash
npm run db:push-turso && npm run db:seed && npm run build
```

Both `db:push-turso` and `db:seed` are idempotent and safe to run on every deploy.
