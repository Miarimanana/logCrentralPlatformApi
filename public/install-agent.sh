# #!/bin/bash
# set -e

# DEVICE_TOKEN="$1"
# SERVER_URL="$2"

# if [ -z "$DEVICE_TOKEN" ] || [ -z "$SERVER_URL" ]; then
#   echo "Usage: curl -s http://SERVEUR:4000/install-agent.sh | bash -s DEVICE_TOKEN http://SERVEUR:4000"
#   exit 1
# fi

# # Extrait uniquement l'IP/host du SERVER_URL (ex: http://192.168.0.28:4000 -> 192.168.0.28)
# SERVER_IP=$(echo "$SERVER_URL" | sed 's|http://||' | sed 's|https://||' | cut -d':' -f1)
# SERVER_PORT=$(echo "$SERVER_URL" | sed 's|http://||' | sed 's|https://||' | cut -d':' -f2)

# echo "Verification du token..."
# DEVICE_INFO=$(curl -s "${SERVER_URL}/api/devices/by-token/${DEVICE_TOKEN}")
# DEVICE_ID=$(echo "$DEVICE_INFO" | python3 -c "import sys,json; print(json.load(sys.stdin)['deviceId'])" 2>/dev/null)
# TENANT_NAME=$(echo "$DEVICE_INFO" | python3 -c "import sys,json; print(json.load(sys.stdin)['tenantName'])" 2>/dev/null)

# if [ -z "$DEVICE_ID" ] || [ "$DEVICE_ID" = "None" ]; then
#   echo "Erreur: token invalide ou serveur inaccessible ($SERVER_URL)"
#   exit 1
# fi

# SYSLOG_HOST="${TENANT_NAME}__${DEVICE_ID}"
# echo "Device   : $DEVICE_ID"
# echo "Tenant   : $TENANT_NAME"
# echo "Serveur  : $SERVER_IP"
# echo "Hostname : $SYSLOG_HOST"

# # Installer rsyslog si absent
# if ! command -v rsyslogd &>/dev/null; then
#   echo "Installation de rsyslog..."
#   apt-get update -qq && apt-get install -y rsyslog
# fi

# mkdir -p /etc/rsyslog.d

# # Hostname syslog
# tee /etc/rsyslog.d/10-logcentral-hostname.conf > /dev/null << EOF
# \$LocalHostName ${SYSLOG_HOST}
# EOF

# # Envoi vers le serveur LogCentral (IP fixe passée en argument)
# tee /etc/rsyslog.d/90-logcentral.conf > /dev/null << EOF
# *.* @${SERVER_IP}:514
# EOF

# # Forcer locale anglaise pour les timestamps
# mkdir -p /etc/systemd/system/rsyslog.service.d
# tee /etc/systemd/system/rsyslog.service.d/locale.conf > /dev/null << EOF
# [Service]
# Environment="LANG=C"
# Environment="LC_ALL=C"
# EOF

# # journald -> rsyslog
# mkdir -p /etc/systemd/journald.conf.d
# tee /etc/systemd/journald.conf.d/logcentral.conf > /dev/null << EOF
# [Journal]
# ForwardToSyslog=yes
# EOF

# systemctl daemon-reload
# systemctl enable rsyslog 2>/dev/null || true
# systemctl restart systemd-journald 2>/dev/null || true
# systemctl restart rsyslog

# sleep 2
# logger -t logcentral "AGENT_INSTALLED device=${SYSLOG_HOST}"

# echo "---"
# echo "Installation terminee."
# echo "Logs visibles : http://${SERVER_IP}:3000"
# echo "Query Loki    : {job=\"syslog\", device_id=\"${DEVICE_ID}\"}"

#===================================================================
#!/bin/bash
set -e

DEVICE_TOKEN="$1"
SERVER_URL="${2:-https://logcrentralplatformapi-production.up.railway.app}"

if [ -z "$DEVICE_TOKEN" ]; then
  echo "Usage: curl -s ${SERVER_URL}/install-agent.sh | bash -s DEVICE_TOKEN"
  exit 1
fi

echo "Verification du token..."
DEVICE_INFO=$(curl -s "${SERVER_URL}/api/devices/by-token/${DEVICE_TOKEN}")
DEVICE_ID=$(echo "$DEVICE_INFO" | python3 -c "import sys,json; print(json.load(sys.stdin)['deviceId'])" 2>/dev/null)
TENANT_NAME=$(echo "$DEVICE_INFO" | python3 -c "import sys,json; print(json.load(sys.stdin)['tenantName'])" 2>/dev/null)

if [ -z "$DEVICE_ID" ] || [ "$DEVICE_ID" = "None" ]; then
  echo "Erreur: token invalide ou serveur inaccessible ($SERVER_URL)"
  exit 1
fi

echo "Device  : $DEVICE_ID"
echo "Tenant  : $TENANT_NAME"
echo "Serveur : $SERVER_URL"

# Extraire le host Railway (sans https://)
API_HOST=$(echo "$SERVER_URL" | sed 's|https://||' | sed 's|http://||' | cut -d'/' -f1)

# Installer Fluent-Bit si absent
if ! command -v fluent-bit &>/dev/null; then
  echo "Installation de Fluent-Bit..."
  curl -fsSL https://raw.githubusercontent.com/fluent/fluent-bit/master/install.sh | sh
fi

# Créer config Fluent-Bit
mkdir -p /etc/fluent-bit

cat > /etc/fluent-bit/fluent-bit.conf << EOF
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
    Record hostname  \$(hostname)

[OUTPUT]
    Name         http
    Match        *
    Host         ${API_HOST}
    Port         443
    URI          /api/ingest/logs
    Format       json
    TLS          On
    TLS.Verify   Off
    Retry_Limit  3
EOF

# Créer service systemd
cat > /etc/systemd/system/logcentral-agent.service << EOF
[Unit]
Description=LogCentral Agent
After=network-online.target
Wants=network-online.target

[Service]
ExecStart=/opt/fluent-bit/bin/fluent-bit -c /etc/fluent-bit/fluent-bit.conf
Restart=always
RestartSec=10
Environment="LANG=C"
Environment="LC_ALL=C"

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable logcentral-agent
systemctl restart logcentral-agent

sleep 2

# Envoyer log de confirmation
curl -s -X POST "${SERVER_URL}/api/ingest/logs" \
  -H "Content-Type: application/json" \
  -d "[{\"device_id\":\"${DEVICE_ID}\",\"tenant_id\":\"${TENANT_NAME}\",\"log\":\"AGENT_INSTALLED\",\"hostname\":\"$(hostname)\"}]"

echo "---"
echo "Installation terminee !"
echo "Logs envoyes vers : $SERVER_URL"
echo "Query Loki : {job=\"syslog\", device_id=\"${DEVICE_ID}\"}"