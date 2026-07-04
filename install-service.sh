#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SERVICE_FILE="$SCRIPT_DIR/TaiAi-ui.service"

if [ ! -f "$SERVICE_FILE" ]; then
  echo "Error: TaiAi-ui.service not found in $SCRIPT_DIR"
  exit 1
fi

echo "Installing TaiAi UI service..."
echo "Make sure you've edited TaiAi-ui.service with your username and paths first!"
echo ""

sudo cp "$SERVICE_FILE" /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable TaiAi-ui
sudo systemctl start TaiAi-ui
sudo systemctl status TaiAi-ui
