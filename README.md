# P2 Form — NSWS Sugar Mill Portal

A web application for sugar mills to submit P2 Form data to the National Single Window System (NSWS) via API.

## Quick Start (Local)

```bash
npm install
cp .env.example .env     # Edit with your MongoDB URI
npm run seed              # Create test users
npm start                 # http://localhost:3000
```

## Test Users

| User | Email | Password | Purpose |
|------|-------|----------|---------|
| UAT  | uat@sugarmill.com | uat@123 | UAT testing (Balrampur/8901) |
| Sample | test@sugarmill.com | password123 | Sample data testing |

## Deploy to VPS (Recommended)

```bash
# On your Ubuntu/Debian VPS:
git clone <your-repo> && cd p2-form-app
cp .env.example .env && nano .env    # Fill in values
bash deploy-vps.sh
```

## Deploy with Docker

```bash
cp .env.example .env && nano .env
docker-compose up -d
```

## NSWS IP Whitelisting

After deployment, share these details with NSWS team:

| Field | Value |
|-------|-------|
| Static IP | `curl ifconfig.me` on your server |
| Domain | Your domain |
| SWS ID | From your NSWS account |
| Project No | From investor dashboard |
| Plant Name/Code | As registered |

## Environment Variables

| Variable | Description |
|----------|-------------|
| MONGODB_URI | MongoDB Atlas connection string |
| SESSION_SECRET | Random secret for session cookies |
| PORT | Server port (default: 3000) |
| NSWS_API_URL | NSWS API endpoint |
| NSWS_ACCESS_ID | API access ID |
| NSWS_ACCESS_SECRET | API access secret |
| NSWS_API_KEY | API key |
