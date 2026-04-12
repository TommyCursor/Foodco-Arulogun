# Foodco Arulogun — Production Readiness Checklist

---

## WHAT YOU NEED TO PROVIDE

### 1. Supabase Account (FREE)
**You do:** Create a free account and project at https://supabase.com

**Then provide:**
- `NEXT_PUBLIC_SUPABASE_URL` → from Project Settings → API → Project URL
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` → from Project Settings → API → anon / public key
- `SUPABASE_SERVICE_ROLE_KEY` → from Project Settings → API → service_role key *(keep secret)*

**Then run:** Paste the full contents of `schema.sql` into Supabase Dashboard → SQL Editor → Run

---

### 2. Email Account for Sending Reports (FREE with Gmail)
**You do:** Enable a Gmail App Password (not your normal password)
- Go to https://myaccount.google.com/security
- Enable 2-Step Verification
- Then go to App Passwords → create one for "Mail"

**Then provide:**
- `EMAIL_HOST=smtp.gmail.com`
- `EMAIL_PORT=587`
- `EMAIL_USER=your-gmail@gmail.com`
- `EMAIL_PASS=your-16-digit-app-password`
- `EMAIL_FROM="Foodco Arulogun <your-gmail@gmail.com>"`

---

### 3. Africa's Talking (SMS — PAY PER USE, ~₦2–5/SMS)
**You do:** Register at https://account.africastalking.com

**Then provide:**
- `AT_API_KEY=your-api-key`
- `AT_USERNAME=your-username` (use `sandbox` for testing)
- `AT_SENDER_ID=FOODCO` (register sender ID for production)

> **Skip this for now** if SMS is not immediately needed. The system still works fully with Email + In-App alerts.

---

### 4. A Cron Secret (YOU CREATE THIS)
This secures the `/api/cron` endpoint so only your scheduler can call it.

**You create:** any strong random string, e.g. `foodco_cron_2025_xK9mPqR7`

**Then provide:**
- `CRON_SECRET=your-random-secret-string`

---

### 5. Hosting Platform (VERCEL — FREE)
**You do:** Create a free account at https://vercel.com

Steps:
1. Push your project to GitHub (create a private repo)
2. Connect Vercel to your GitHub repo
3. Add all environment variables in Vercel → Project Settings → Environment Variables
4. Deploy — Vercel auto-builds on every push

---

## WHAT YOU NEED TO DO (STEP BY STEP)

### Step 1 — Install Dependencies
```bash
cd "c:/FoodCo Arulogun"
npm install
```

---

### Step 2 — Set Up Supabase

1. Go to https://supabase.com → New Project
2. Choose a region close to Nigeria (e.g. `eu-west-2` London or `us-east-1`)
3. Set a strong database password — **save it somewhere safe**
4. Once created, go to **SQL Editor** → paste the entire `schema.sql` file → click **Run**
5. Go to **Project Settings → API** → copy your keys

---

### Step 3 — Create Your .env.local File
```bash
# In your project folder, create this file:
# c:/FoodCo Arulogun/.env.local
```

Copy `.env.local.example` → `.env.local` and fill in all values.

---

### Step 4 — Configure Supabase Auth

In Supabase Dashboard → **Authentication → Settings:**

| Setting | Value |
|---------|-------|
| Site URL | `http://localhost:3000` (dev) or your Vercel URL (production) |
| Redirect URLs | Add `http://localhost:3000/**` and `https://your-vercel-url.vercel.app/**` |
| Email confirmations | Enable (users confirm via email link) |
| Invite email template | Customize with Foodco branding (optional) |

---

### Step 5 — Create Your First Admin User

1. In Supabase Dashboard → **Authentication → Users** → **Invite User**
2. Enter your email (e.g. `admin@foodco.com`)
3. Accept the invite email → set your password
4. In Supabase SQL Editor, run:
```sql
-- Set your user as admin (replace with your actual user ID from auth.users)
UPDATE profiles
SET role_id = 1  -- 1 = admin
WHERE id = 'your-user-uuid-here';
```

---

### Step 6 — Run Locally and Test
```bash
npm run dev
# Opens at http://localhost:3000
```

Test checklist:
- [ ] Login works with your admin email
- [ ] Dashboard shows (may be empty — that's fine)
- [ ] Can add a product category (Supabase Dashboard → Table Editor → categories)
- [ ] Can add a product (Supabase Dashboard → Table Editor → products)
- [ ] Can add an inventory batch (via the app)
- [ ] Damage log works
- [ ] Discounts work
- [ ] Report generates and downloads as Excel
- [ ] Email sends (check spam folder first)

---

### Step 7 — Deploy to Vercel

1. Create a GitHub repo: https://github.com/new (private)
2. Push your code:
```bash
git init
git add .
git commit -m "Initial Foodco Arulogun build"
git remote add origin https://github.com/YOUR_USERNAME/foodco-arulogun.git
git push -u origin main
```
3. Go to https://vercel.com → New Project → Import from GitHub
4. Add all environment variables (same as your `.env.local`)
5. Deploy

---

### Step 8 — Set Up Automated Reports (Cron)

**Option A: Vercel Cron (Recommended — FREE on Vercel Pro / $20/mo)**

Create `vercel.json` in your project root:
```json
{
  "crons": [
    {
      "path": "/api/cron",
      "schedule": "0 8 * * *"
    }
  ]
}
```

**Option B: Supabase pg_cron (Free — built into Supabase)**

In Supabase SQL Editor:
```sql
-- Enable pg_cron extension (once)
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Schedule daily cron at 8 AM UTC (adjust for WAT = UTC+1)
SELECT cron.schedule(
  'foodco-daily-cron',
  '0 7 * * *',  -- 7 AM UTC = 8 AM WAT
  $$
  SELECT net.http_post(
    url := 'https://your-vercel-url.vercel.app/api/cron',
    headers := '{"x-cron-secret": "your-cron-secret-here"}'::jsonb
  );
  $$
);
```
*(Requires `pg_net` extension — also enable it in Supabase Dashboard → Extensions)*

---

### Step 9 — Set Up Supabase Storage (for Excel file archiving)

1. Supabase Dashboard → Storage → Create bucket
2. Name it: `reports`
3. Set to **Private** (not public)
4. Update `NEXT_PUBLIC_SUPABASE_URL` bucket reference in report logs if you want to store Excel files

---

### Step 10 — Buy a Domain (Optional but professional)
Recommended registrars:
- **Qservers.net** (Nigeria-based, ~₦5,000/yr for .com.ng)
- **GoDaddy** (~$12/yr for .com)

Then add the domain in Vercel → Project → Domains.

---

## PRODUCTION SECURITY CHECKLIST

| Item | Action |
|------|--------|
| `.env.local` in `.gitignore` | ✅ Already done — never commit this |
| `SUPABASE_SERVICE_ROLE_KEY` | Never expose in client-side code |
| `CRON_SECRET` | Use a long random string, keep private |
| Supabase RLS enabled | ✅ Already in `schema.sql` |
| Email password | Use App Password, not your real Gmail password |
| Production Supabase project | Use a separate project from your dev/test project |
| HTTPS | ✅ Vercel provides free SSL automatically |

---

## COST SUMMARY (Monthly)

| Service | Plan | Cost |
|---------|------|------|
| Supabase | Free tier | **₦0** |
| Vercel | Hobby (free) | **₦0** |
| Gmail SMTP | Free | **₦0** |
| Africa's Talking SMS | Pay per SMS | ~₦2–5/SMS |
| Domain (.com) | Annual | ~₦18,000/yr |
| Vercel Pro (for Cron) | Monthly | ~₦15,000/mo |

**Minimum to go live: ₦0/month** (use Option B pg_cron for scheduling)

---

## WHAT TO GENERATE AFTER SUPABASE IS SET UP

Once your Supabase project is running, regenerate the TypeScript types:
```bash
npx supabase gen types typescript --project-id YOUR_PROJECT_ID > types/database.ts
```
Replace `YOUR_PROJECT_ID` with the ref ID from your Supabase project URL.

---

## SUMMARY — THINGS YOU MUST PROVIDE

| # | What | Where to get it | Required? |
|---|------|-----------------|-----------|
| 1 | Supabase URL + Keys | supabase.com → Project Settings | ✅ Yes |
| 2 | Gmail App Password | myaccount.google.com | ✅ Yes |
| 3 | Cron secret string | Create it yourself | ✅ Yes |
| 4 | Africa's Talking keys | africastalking.com | Optional (SMS only) |
| 5 | Domain name | Any registrar | Optional |
| 6 | Vercel account | vercel.com | ✅ Yes (for deployment) |
