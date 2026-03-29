#!/bin/bash
# ============================================
# Deploy P2 Form App to Ubuntu/Debian VPS
# (DigitalOcean, AWS EC2, Azure VM, etc.)
# Run: bash deploy-vps.sh
# ============================================

set -e

echo "=== P2 Form App — VPS Deployment ==="

# 1. Update system
echo "[1/6] Updating system..."
sudo apt update && sudo apt upgrade -y

# 2. Install Node.js 20
echo "[2/6] Installing Node.js 20..."
if ! command -v node &> /dev/null; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
  sudo apt install -y nodejs
fi
echo "Node: $(node -v) | npm: $(npm -v)"

# 3. Install PM2 (process manager)
echo "[3/6] Installing PM2..."
sudo npm install -g pm2

# 4. Install dependencies
echo "[4/6] Installing app dependencies..."
npm ci --only=production

# 5. Setup .env
if [ ! -f .env ]; then
  echo "[!] No .env file found. Copy .env.example to .env and fill in your values."
  cp .env.example .env
  echo "[!] Edit .env now: nano .env"
  exit 1
fi

# 6. Start with PM2
echo "[5/6] Starting app with PM2..."
pm2 delete p2-form-app 2>/dev/null || true
pm2 start server.js --name p2-form-app --env production
pm2 save
pm2 startup

echo ""
echo "=== Deployment Complete ==="
echo "App running on port 3000"
echo ""
echo "Useful commands:"
echo "  pm2 status          — check app status"
echo "  pm2 logs p2-form-app — view logs"
echo "  pm2 restart p2-form-app — restart app"
echo ""
echo "Next steps:"
echo "  1. Setup Nginx reverse proxy (see nginx.conf)"
echo "  2. Setup SSL with: sudo certbot --nginx -d yourdomain.com"
echo "  3. Note your server's public IP: curl ifconfig.me"
echo "  4. Share that IP with NSWS for whitelisting"
