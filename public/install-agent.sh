#!/bin/bash
set -e

DEVICE_TOKEN="$1"
SERVER_URL="${2:-https://logcrentralplatformapi-production.up.railway.app}"

if [ -z "$DEVICE_TOKEN" ]; then
  echo "Usage: curl -s ${SERVER_URL}/install-agent.sh | sudo bash -s DEVICE_TOKEN"
  exit 1
fi

echo "Verification du token..."
DEVICE_INFO=$(curl -s "${SERVER_URL}/api/devices/by-token/${DEVICE_TOKEN}")
DEVICE_ID=$(echo "$DEVICE_INFO" | python3 -c "import sys,json; print(json.load(sys.stdin).get('deviceId', ''))" 2>/dev/null)
TENANT_NAME=$(echo "$DEVICE_INFO" | python3 -c "import sys,json; print(json.load(sys.stdin).get('tenantName', ''))" 2>/dev/null)

if [ -z "$DEVICE_ID" ]; then
  echo "Erreur: token invalide ($SERVER_URL)"
  exit 1
fi

echo "Device  : $DEVICE_ID"
echo "Tenant  : $TENANT_NAME"

API_HOST=$(echo "$SERVER_URL" | sed 's|https://||' | sed 's|http://||' | cut -d'/' -f1)

# Installation propre pour Kali/Debian
if ! command -v fluent-bit &>/dev/null; then
  echo "Installation de Fluent-Bit..."
  # Fix GPG pour Kali
  wget -qO - https://packages.fluentbit.io/fluentbit.key | gpg --dearmor | tee /usr/share/keyrings/fluentbit.gpg > /dev/null
  echo "deb [signed-by=/usr/share/keyrings/fluentbit.gpg] https://packages.fluentbit.io/debian/bookworm bookworm main" > /etc/apt/sources.list.d/fluentbit.list
  apt-get update -qq
  apt-get install -y fluent-bit
fi

mkdir -p /etc/fluent-bit
cat > /etc/fluent-bit/fluent-bit.conf << FBEOF
[SERVICE]
    Flush        5
    Daemon       Off
    Log_Level    warn

[INPUT]
    Name              systemd
    Tag               syslog.*
    Read_From_Tail    On

[FILTER]
    Name             record_modifier
    Match            *
    Record device_id ${DEVICE_ID}
    Record tenant_id ${TENANT_NAME}

[OUTPUT]
    Name         http
    Match        *
    Host         ${API_HOST}
    Port         443
    URI          /api/webhooks/fluentbit
    Format       json
    TLS          On
    TLS.Verify   Off
    Retry_Limit  3
FBEOF

# Service Systemd
cat > /etc/systemd/system/logcentral-agent.service << SEOF
[Unit]
Description=LogCentral Agent
After=network-online.target

[Service]
ExecStart=/opt/fluent-bit/bin/fluent-bit -c /etc/fluent-bit/fluent-bit.conf
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
SEOF

systemctl daemon-reload
systemctl enable logcentral-agent
systemctl restart logcentral-agent

echo "---"
echo "Installation terminee !"
echo "Logs envoyes vers : $SERVER_URL"
