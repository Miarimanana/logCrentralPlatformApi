#!/bin/sh
# install-agent-docker.sh
# Compatible sh (pas uniquement bash)
# Usage:
# curl -s http://SERVEUR:4000/install-agent-docker.sh | sh -s DEVICE_TOKEN http://SERVEUR:4000

set -e

DEVICE_TOKEN="$1"
SERVER_URL="$2"

if [ -z "$DEVICE_TOKEN" ] || [ -z "$SERVER_URL" ]; then
  echo "Usage: curl -s http://SERVEUR:4000/install-agent-docker.sh | sh -s DEVICE_TOKEN http://SERVEUR:4000"
  exit 1
fi

SERVER_IP=$(echo "$SERVER_URL" | sed 's|https\?://||' | cut -d':' -f1)

echo "Verification du token..."

# --- 1. Récupération device info ---
if command -v curl >/dev/null 2>&1; then
  DEVICE_INFO=$(curl -s "${SERVER_URL}/api/devices/by-token/${DEVICE_TOKEN}")
elif command -v wget >/dev/null 2>&1; then
  DEVICE_INFO=$(wget -qO- "${SERVER_URL}/api/devices/by-token/${DEVICE_TOKEN}")
else
  echo "Erreur: curl ou wget requis"
  exit 1
fi

# --- 2. Parsing JSON sans python ---
DEVICE_ID=$(echo "$DEVICE_INFO" | grep -o '"deviceId":"[^"]*"' | cut -d'"' -f4)
TENANT_NAME=$(echo "$DEVICE_INFO" | grep -o '"tenantName":"[^"]*"' | cut -d'"' -f4)

if [ -z "$DEVICE_ID" ]; then
  echo "Erreur: token invalide ou serveur inaccessible"
  exit 1
fi

SYSLOG_HOST="${TENANT_NAME}__${DEVICE_ID}"

echo "Device   : $DEVICE_ID"
echo "Tenant   : $TENANT_NAME"
echo "Serveur  : $SERVER_IP"

# --- 3. Vérifier Docker ---
if ! command -v docker >/dev/null 2>&1; then
  echo "Erreur: Docker n'est pas installé"
  exit 1
fi

# --- 4. Config Docker daemon ---
DOCKER_DAEMON_FILE="/etc/docker/daemon.json"

echo "Configuration de Docker..."

# sauvegarde
if [ -f "$DOCKER_DAEMON_FILE" ]; then
  cp "$DOCKER_DAEMON_FILE" "${DOCKER_DAEMON_FILE}.bak"
  echo "Backup: ${DOCKER_DAEMON_FILE}.bak"
fi

# si fichier vide ou inexistant
if [ ! -s "$DOCKER_DAEMON_FILE" ]; then
  echo "{}" > "$DOCKER_DAEMON_FILE"
fi

# inject config propre (simple et safe)
cat > "$DOCKER_DAEMON_FILE" << EOF
{
  "log-driver": "syslog",
  "log-opts": {
    "syslog-address": "udp://${SERVER_IP}:514",
    "syslog-format": "rfc5424",
    "tag": "${SYSLOG_HOST}/{{.Name}}"
  }
}
EOF

echo "Config Docker mise à jour"

# --- 5. Restart Docker ---
echo "Redémarrage Docker..."
if command -v systemctl >/dev/null 2>&1; then
  systemctl restart docker
else
  service docker restart 2>/dev/null || /etc/init.d/docker restart 2>/dev/null
fi

sleep 3

# --- 6. Test ---
echo "Test d'envoi..."

docker run --rm \
  --log-driver syslog \
  --log-opt syslog-address="udp://${SERVER_IP}:514" \
  --log-opt tag="${SYSLOG_HOST}/test" \
  alpine echo "AGENT_INSTALLED device=${SYSLOG_HOST}"

echo "---"
echo "Installation terminée"
echo "Logs visibles : http://${SERVER_IP}:3000"
echo "Query Loki    : {job=\"syslog\", device_id=\"${DEVICE_ID}\"}"