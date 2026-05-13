# CTS BPO — Cloud Deployment Guide

The app runs as a single Node.js service. The backend builds the React frontend and serves it as static files. Your Supabase database stays exactly as-is — just point `DATABASE_URL` at it.

---

## Option A — Railway (Recommended, free tier available)

1. Go to [railway.app](https://railway.app) and sign in with GitHub
2. Click **New Project → Deploy from GitHub repo** → select `CTS-BPO-`
3. Railway detects the `Dockerfile` and `railway.json` automatically
4. Click **Variables** and add every key from `.env.example`
   - The most critical ones: `DATABASE_URL`, `JWT_SECRET`, `APP_URL`, `BREVO_API_KEY`, `GOOGLE_API_KEY`
5. Click **Deploy** — Railway builds the Docker image and starts the service
6. Copy the generated URL (e.g. `https://cts-bpo.up.railway.app`) and set it as `APP_URL`

**Cost:** Free tier includes 500 hours/month. Upgrade to Starter ($5/mo) for always-on.

---

## Option B — Render (Free tier, sleeps after 15 min inactive)

1. Go to [render.com](https://render.com) and sign in with GitHub
2. Click **New → Web Service** → connect `CTS-BPO-` repo
3. Render reads `render.yaml` automatically and configures the service
4. Add all environment variables in the Render dashboard
5. Click **Create Web Service**

**Note:** Free tier sleeps when inactive. The autonomous agent needs always-on — use the $7/mo plan or Railway instead.

---

## Option C — Any VPS / Docker host (DigitalOcean, Hetzner, Linode)

```bash
# 1. Clone your repo
git clone https://github.com/radiowereldwyd/CTS-BPO-.git
cd CTS-BPO-

# 2. Copy and fill in environment variables
cp .env.example .env
nano .env   # fill in all values

# 3. Build and run with Docker
docker build -t cts-bpo .
docker run -d \
  --name cts-bpo \
  --env-file .env \
  -p 3001:3001 \
  --restart unless-stopped \
  cts-bpo

# 4. Check it's running
docker logs cts-bpo -f
# Visit http://your-server-ip:3001
```

Put Nginx in front for HTTPS:
```nginx
server {
    listen 443 ssl;
    server_name yourdomain.com;
    location / {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
    }
}
```

---

## Required Environment Variables

| Variable | Where to get it |
|---|---|
| `DATABASE_URL` | Supabase → Project Settings → Database → Connection string (URI) |
| `JWT_SECRET` | Any random 32+ char string |
| `APP_URL` | Your deployed URL (e.g. `https://cts-bpo.up.railway.app`) |
| `BREVO_API_KEY` | [app.brevo.com](https://app.brevo.com) → SMTP & API → API Keys |
| `MAILERLITE_API_KEY` | [app.mailerlite.com](https://app.mailerlite.com) → Integrations → API |
| `GMAIL_USER` + `GMAIL_APP_PASSWORD` | Google Account → Security → App Passwords |
| `GOOGLE_API_KEY` | [console.cloud.google.com](https://console.cloud.google.com) → APIs & Services |
| `SERPAPI_KEY` | [serpapi.com](https://serpapi.com) → Dashboard |
| `FREELANCER_TOKEN` | [freelancer.com](https://www.freelancer.com) → Settings → API Access |

---

## Database

Your Supabase database is already set up with all tables. The app runs `CREATE TABLE IF NOT EXISTS` on every startup — safe to run on any clean Supabase project.

**Connection string format:**
```
postgresql://postgres:[PASSWORD]@db.[PROJECT-REF].supabase.co:5432/postgres
```
Get it from: Supabase Dashboard → Project Settings → Database → URI

---

## Admin Login

After deployment, visit `https://your-url/` and log in with:
- Email: `admin@ctsbpo.com`  
- Password: `CTS@Admin2026`

Change the password immediately in production via the Settings page.
