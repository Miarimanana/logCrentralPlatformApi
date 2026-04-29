#!/bin/bash
# install-agent-macos.sh
# Usage: curl -s http://SERVEUR:4000/install-agent-macos.sh | bash -s DEVICE_TOKEN http://SERVEUR:4000
set -e

DEVICE_TOKEN="$1"
SERVER_URL="$2"

if [ -z "$DEVICE_TOKEN" ] || [ -z "$SERVER_URL" ]; then
  echo "Usage: curl -s http://SERVEUR:4000/install-agent-macos.sh | bash -s DEVICE_TOKEN http://SERVEUR:4000"
  exit 1
fi

SERVER_IP=$(echo "$SERVER_URL" | sed 's|https\?://||' | cut -d':' -f1)

# --- 1. Validation token ---
echo "Verification du token..."
DEVICE_INFO=$(curl -s "${SERVER_URL}/api/devices/by-token/${DEVICE_TOKEN}")
DEVICE_ID=$(echo "$DEVICE_INFO" | python3 -c "import sys,json; print(json.load(sys.stdin)['deviceId'])" 2>/dev/null)
TENANT_NAME=$(echo "$DEVICE_INFO" | python3 -c "import sys,json; print(json.load(sys.stdin)['tenantName'])" 2>/dev/null)

if [ -z "$DEVICE_ID" ] || [ "$DEVICE_ID" = "None" ]; then
  echo "Erreur: token invalide ou serveur inaccessible ($SERVER_URL)"
  exit 1
fi

SYSLOG_HOST="${TENANT_NAME}__${DEVICE_ID}"
echo "Device   : $DEVICE_ID"
echo "Tenant   : $TENANT_NAME"
echo "Serveur  : $SERVER_IP"
echo "Hostname : $SYSLOG_HOST"

# --- 2. Installer syslog-ng via Homebrew ---
# macOS n'a pas rsyslog. syslog-ng est le standard sur macOS/BSD.
if ! command -v brew &>/dev/null; then
  echo "Homebrew requis. Installation..."
  /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
fi

if ! command -v syslog-ng &>/dev/null; then
  echo "Installation de syslog-ng..."
  brew install syslog-ng
fi

# --- 3. Ecrire la config syslog-ng ---
SYSLOG_NG_CONF="/usr/local/etc/syslog-ng/syslog-ng.conf"

# Sur Apple Silicon (M1/M2/M3), Homebrew installe dans /opt/homebrew
if [ -d "/opt/homebrew/etc/syslog-ng" ]; then
  SYSLOG_NG_CONF="/opt/homebrew/etc/syslog-ng/syslog-ng.conf"
fi

mkdir -p "$(dirname $SYSLOG_NG_CONF)"

cat > "$SYSLOG_NG_CONF" << EOF
@version: 3.38
@include "scl.conf"

options {
    keep_hostname(yes);
    # Forcer le hostname à tenant__device_id pour que Loki puisse extraire les labels
    use_fqdn(no);
};

source s_system {
    # Collecte les logs système macOS via ASL (Apple System Log)
    system();
    internal();
};

destination d_logcentral {
    network(
        "${SERVER_IP}"
        port(514)
        transport("udp")
        # Forcer le hostname dans chaque message syslog
        template("\$(format-date %b %d %H:%M:%S) ${SYSLOG_HOST} \${PROGRAM}[\${PID}]: \${MESSAGE}\n")
    );
};

log {
    source(s_system);
    destination(d_logcentral);
};
EOF

echo "Config ecrite : $SYSLOG_NG_CONF"

# --- 4. Demarrer syslog-ng via launchctl (equivalent systemctl sur macOS) ---
echo "Demarrage de syslog-ng..."

# Arrêt propre si déjà lancé
brew services stop syslog-ng 2>/dev/null || true

brew services start syslog-ng

sleep 2

# --- 5. Test d'envoi ---
logger -t logcentral "AGENT_INSTALLED device=${SYSLOG_HOST}"

echo "---"
echo "Installation terminee."
echo "Logs visibles : http://${SERVER_IP}:3000"
echo "Query Loki    : {job=\"syslog\", device_id=\"${DEVICE_ID}\"}"