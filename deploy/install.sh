#!/usr/bin/env bash
# Installe le bot sur un serveur Linux (Ubuntu/Debian) et le lance en service 24/7.
# Usage : curl -fsSL https://raw.githubusercontent.com/7skyfe/Valorant-Tracker/claude/discord-game-tracker-bot-rqcjb6/deploy/install.sh | bash
# Relancer la même commande plus tard met le bot à jour.
set -euo pipefail

REPO=https://github.com/7skyfe/Valorant-Tracker.git
BRANCH=claude/discord-game-tracker-bot-rqcjb6
DIR="$HOME/Valorant-Tracker"
SERVICE=valorant-tracker

echo "==> Paquets système"
sudo apt-get update -y -qq
sudo apt-get install -y -qq git curl ca-certificates >/dev/null

if ! command -v node >/dev/null || [ "$(node -p 'process.versions.node.split(".")[0]')" -lt 18 ]; then
  echo "==> Installation de Node.js 22"
  curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash - >/dev/null
  sudo apt-get install -y -qq nodejs >/dev/null
fi

echo "==> Code du bot"
if [ -d "$DIR/.git" ]; then
  git -C "$DIR" fetch -q origin "$BRANCH"
  git -C "$DIR" reset -q --hard "origin/$BRANCH"
else
  git clone -q -b "$BRANCH" "$REPO" "$DIR"
fi
cd "$DIR"
npm ci --omit=dev --silent

if [ ! -f .env ]; then
  echo "==> Configuration (rien ne s'affiche quand tu colles, c'est normal)"
  read -rsp "Token du bot Discord : " TOKEN </dev/tty; echo
  read -rsp "Clé API HenrikDev : " KEY </dev/tty; echo
  read -rp "ID de ton serveur Discord (Entrée pour passer) : " GUILD </dev/tty
  umask 077
  printf 'DISCORD_TOKEN=%s\nHENRIK_API_KEY=%s\nDEV_GUILD_ID=%s\n' "$TOKEN" "$KEY" "$GUILD" > .env
fi

echo "==> Service 24/7"
sudo tee /etc/systemd/system/$SERVICE.service >/dev/null <<UNIT
[Unit]
Description=Valorant Tracker (bot Discord)
After=network-online.target
Wants=network-online.target

[Service]
User=$USER
WorkingDirectory=$DIR
ExecStart=$(command -v node) src/index.js
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
UNIT
sudo systemctl daemon-reload
sudo systemctl enable -q $SERVICE
sudo systemctl restart $SERVICE
sleep 5
sudo journalctl -u $SERVICE -n 5 --no-pager
echo
echo "✅ Terminé. Logs en direct : sudo journalctl -u $SERVICE -f"
