# DocuLens Deployment Guide

DocuLens is engineered to deploy seamlessly on Google Cloud Run, Docker containers, or any standard Node.js runtime environment.

---

## 1. Environment Variables

| Variable | Required | Default | Description |
| :--- | :--- | :--- | :--- |
| `GEMINI_API_KEY` | Recommended | *(none)* | Google Gemini API key for server-side AI inquiry answering (`gemini-3.5-flash`). If absent, on-device deterministic synthesis is used. |
| `GEMINI_MODEL` | Optional | `gemini-3.5-flash` | The Gemini model used for editorial synthesis. |
| `PORT` | Optional | `3000` | Port for the Express server. Cloud Run automatically injects `8080`. |
| `DEFAULT_APP_PORT`| Optional | `3000` | Fallback port if `PORT` is not specified. |
| `NODE_ENV` | Optional | `development` | Environment mode (`production` enables security headers, asset caching, and minified bundles). |
| `APP_URL` | Optional | `http://localhost:3000` | Canonical origin URL for self-referential links and CORS/CSP verification. |
| `DISABLE_HMR` | Optional | `false` | Disables Vite file watcher and HMR in development to prevent CPU spikes. |

---

## 2. Local Production Build & Run

Ensure you have **Node.js >= 20** and npm installed:

```bash
# 1. Install dependencies
npm ci

# 2. Build production client bundle
npm run build

# 3. Start production server
npm start
```

Open `http://localhost:3000` in your web browser.

---

## 3. Docker Deployment (Multi-Stage Build)

DocuLens includes a hardened, multi-stage `Dockerfile` based on `node:22-slim` that runs under a non-root user and includes an automated healthcheck:

### Build Container Image
```bash
docker build -t doculens:latest .
```

### Run Container Image
```bash
docker run -d \
  --name doculens \
  -p 8080:8080 \
  -e NODE_ENV=production \
  -e GEMINI_API_KEY="YOUR_GEMINI_API_KEY" \
  doculens:latest
```

### Check Container Health
```bash
curl -i http://localhost:8080/api/health
```

---

## 4. Google Cloud Run Deployment

Google Cloud Run is the recommended platform for production hosting due to instant container scaling, scale-to-zero cost efficiency, and native Secret Manager integration.

### One-Line Deployment Command
```bash
gcloud run deploy doculens \
  --source . \
  --region us-central1 \
  --platform managed \
  --allow-unauthenticated \
  --set-secrets GEMINI_API_KEY=GEMINI_API_KEY:latest \
  --memory 512Mi \
  --cpu 1 \
  --min-instances 0 \
  --max-instances 10
```

### Continuous Deployment via Cloud Build
Use the included `cloudbuild.yaml` file to automate builds upon pushing commits to your main branch:
```bash
gcloud builds submit --config cloudbuild.yaml .
```

---

## 5. Generic Node.js Host (VPS, VM, or PaaS)

1. Provision an Ubuntu / Debian server with Node.js >= 20:
   ```bash
   curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
   sudo apt-get install -y nodejs
   ```
2. Clone the repository and configure `.env`:
   ```bash
   git clone https://github.com/Devputta/DocuLens.git /opt/doculens
   cd /opt/doculens
   cp .env.example .env
   # Edit .env and supply GEMINI_API_KEY
   ```
3. Run verification and build:
   ```bash
   npm ci
   npm run verify
   ```
4. Configure a process manager such as `systemd` or `pm2`:
   ```bash
   pm2 start "NODE_ENV=production npx tsx server.ts" --name doculens
   pm2 save
   ```
5. Terminate TLS with Nginx or Caddy reverse proxy forwarding to `http://localhost:3000`.

---

## 6. HTTPS & PWA Service Worker Requirements

- **HTTPS Requirement**: Modern browsers enforce that Service Workers (`/sw.js`) and PWA installation prompts are only activated over secure origins (`https://` or `http://localhost`).
- **Reverse Proxy Headers**: Ensure your proxy (Cloud Run load balancer, Nginx, or Caddy) forwards client IP headers (`X-Forwarded-For`). DocuLens includes `app.set('trust proxy', 1);` to correctly calculate rate limit windows for client IPs behind ingress.

---

## 7. Pre-Deploy Checklist

Before releasing to production or cutting a release tag, verify each item:

- [ ] **Verification**: `npm run verify` runs cleanly without TypeScript errors, test failures, or build warnings.
- [ ] **HTTPS Configured**: Production domain serves valid SSL/TLS certificates.
- [ ] **Secret Management**: `GEMINI_API_KEY` is injected via Secret Manager or runtime environment variables (never committed to git).
- [ ] **Health Endpoint**: `curl -sS https://your-domain.com/api/health` returns `200 OK` with `"status": "ok"` and non-negative `uptime`.
- [ ] **First-Load Offline Test**: Open the application, disconnect network (DevTools > Offline), and refresh. The application shell and loaded documents must remain interactive.
- [ ] **PWA Install Test**: Open the application in Chrome/Edge/Safari, click **Install**, and confirm that the standalone desktop/mobile launcher works.
- [ ] **CSP Validation**: Confirm that OCR and PDF rendering function without Content-Security-Policy console violations.
- [ ] **Rollback Plan**: Identify the previous stable container image digest or git commit tag in case an immediate rollback is required.

---

## 8. Post-Deploy Checklist

- [ ] Monitor Cloud Run metrics or server logs for 429 rate limit alarms or 5xx errors.
- [ ] Verify that sample inquiries return verified citations with green badges.
- [ ] Check `/api/privacy-status` to confirm that server retention is reported as `"zero (stateless proxy)"`.
