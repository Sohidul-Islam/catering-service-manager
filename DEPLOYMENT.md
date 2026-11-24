# Deployment Guide (Vercel + PostgreSQL)

Local SQLite (`file:./dev.db`) works for local development, **but Vercel serverless functions do not have persistent disk storage**. For Vercel production, use a managed PostgreSQL database (Neon, Supabase, or Vercel Postgres).

## 1. Switch Prisma Datasource to PostgreSQL

1. Open `prisma/schema.prisma` and change:
   ```prisma
   datasource db {
     provider = "postgresql"
     url      = env("DATABASE_URL")
   }
   ```
2. Push the schema to your PostgreSQL database:
   ```bash
   npx prisma db push
   ```
   *(Or generate fresh PostgreSQL migrations after removing the SQLite `prisma/migrations` folder: `npx prisma migrate dev --name init`.)*

## 2. Seed Only 1 Fresh Admin Account (No Demo Guests)

Set your initial admin credentials and run the production-safe seed:

```bash
INITIAL_ADMIN_EMAIL="admin@yourcompany.com" \
INITIAL_ADMIN_PASSWORD="StrongTempPassword123!" \
npm run db:seed
```

> **Note:** To wipe an existing database back to a clean slate with only 1 admin and zero guests/meals/invoices, run:
> ```bash
> npm run db:reset-fresh
> ```

After signing in on `/login`, go to **Settings → Admin Account & Credentials** to change the admin name, email, or password anytime.

## 3. Configure Vercel Project

1. Push the repository to GitHub and import it in **Vercel**.
2. Add **Environment Variables** in Vercel → **Project Settings**:
   - `DATABASE_URL` (PostgreSQL connection string from Neon / Supabase)
   - `JWT_SECRET` (generate with `openssl rand -hex 32`)
   - `CRON_SECRET` (generate with `openssl rand -hex 32` — also used by `vercel.json` cron)
   - `RESEND_API_KEY` (from Resend dashboard)
   - `RESEND_FROM_EMAIL` (your verified sender email)
   - `RESEND_FROM_NAME` (e.g., `Office Meal Management`)
   - `NEXT_PUBLIC_APP_URL` (e.g., `https://your-app.vercel.app`)
   - `INITIAL_ADMIN_EMAIL` / `INITIAL_ADMIN_PASSWORD` (optional, for initial seeding)
3. Set the Vercel **Build Command** (or keep `npm run build` since `postinstall` already runs `prisma generate`):
   ```bash
   npx prisma db push && npm run build
   ```
4. Deploy! `vercel.json` automatically configures a monthly cron job on the 1st of every month to call `/api/cron/generate-monthly-schedule`.
