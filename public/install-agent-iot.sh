#!/bin/sh
# install-agent-iot.sh — POSIX sh compatible
# Usage:
# wget http://SERVEUR:4000/install-agent-iot.sh -O install.sh
# sh install.sh DEVICE_TOKEN http://SERVEUR:4000

DEVICE_TOKEN="$1"
SERVER_URL="$2"

if [ -z "$DEVICE_TOKEN" ] || [ -z "$SERVER_URL" ]; then
  echo "Usage: sh install-agent-iot.sh DEVICE_TOKEN http://SERVEUR:4000"
  exit 1
fi

# Extraire IP/host du serveur
SERVER_IP=$(echo "$SERVER_URL" | sed 's|https\?://||' | cut -d':' -f1)

echo "Verification du token..."

# --- Requête API ---
if command -v curl >/dev/null 2>&1; then
  DEVICE_INFO=$(curl -fsS "${SERVER_URL}/api/devices/by-token/${DEVICE_TOKEN}" 2>/dev/null)
elif command -v wget >/dev/null 2>&1; then
  DEVICE_INFO=$(wget -qO- "${SERVER_URL}/api/devices/by-token/${DEVICE_TOKEN}")
else
  echo "Erreur: curl ou wget requis"
  exit 1
fi

# --- Parsing JSON (plus robuste sans jq) ---
DEVICE_ID=$(echo "$DEVICE_INFO" | sed -n 's/.*"deviceId":"\([^"]*\)".*/\1/p')
TENANT_NAME=$(echo "$DEVICE_INFO" | sed -n 's/.*"tenantName":"\([^"]*\)".*/\1/p')

if [ -z "$DEVICE_ID" ]; then
  echo "Erreur: token invalide ou serveur inaccessible"
  exit 1
fi

SYSLOG_HOST="${TENANT_NAME}__${DEVICE_ID}"

echo "Device   : $DEVICE_ID"
echo "Tenant   : $TENANT_NAME"
echo "Serveur  : $SERVER_IP"
echo "Hostname : $SYSLOG_HOST"

# --- Détection syslog ---
if command -v rsyslogd >/dev/null 2>&1; then
  SYSLOG_TYPE="rsyslog"
elif [ -f /etc/syslog-ng/syslog-ng.conf ]; then
  SYSLOG_TYPE="syslog-ng"
elif [ -f /etc/openwrt_release ]; then
  SYSLOG_TYPE="openwrt"
else
  SYSLOG_TYPE="busybox"
fi

echo "Systeme syslog detecte : $SYSLOG_TYPE"

# --- Configuration ---
case "$SYSLOG_TYPE" in

rsyslog)
  mkdir -p /etc/rsyslog.d

  cat > /etc/rsyslog.d/10-logcentral-hostname.conf <<EOF
\$LocalHostName ${SYSLOG_HOST}
EOF

  cat > /etc/rsyslog.d/90-logcentral.conf <<EOF
*.* @${SERVER_IP}:514
EOF

  if command -v systemctl >/dev/null 2>&1; then
    systemctl restart rsyslog 2>/dev/null || true
    systemctl enable rsyslog 2>/dev/null || true
  else
    service rsyslog restart 2>/dev/null || /etc/init.d/rsyslog restart 2>/dev/null || true
  fi
  ;;

syslog-ng)
  CONF="/etc/syslog-ng/syslog-ng.conf"
  mkdir -p "$(dirname "$CONF")"

  cat > "$CONF" <<EOF
@version: 3.38
options { keep_hostname(yes); };

source s_sys { system(); internal(); };

destination d_logcentral {
  network("${SERVER_IP}" port(514) transport("udp"));
};

log { source(s_sys); destination(d_logcentral); };
EOF

  service syslog-ng restart 2>/dev/null || \
  /etc/init.d/syslog-ng restart 2>/dev/null || true
  ;;

openwrt)
  uci set system.@system[0].hostname="${SYSLOG_HOST}"
  uci set system.@system[0].log_ip="${SERVER_IP}"
  uci set system.@system[0].log_port="514"
  uci set system.@system[0].log_proto="udp"
  uci commit system

  /etc/init.d/system restart 2>/dev/null || true
  /etc/init.d/log restart 2>/dev/null || true
  ;;

busybox)
  killall syslogd 2>/dev/null || true
  sleep 1

  syslogd -R "${SERVER_IP}:514" -L &

  if [ -f /etc/rc.local ]; then
    grep -v "logcentral" /etc/rc.local > /tmp/rc.local.tmp
    mv /tmp/rc.local.tmp /etc/rc.local
    echo "syslogd -R ${SERVER_IP}:514 -L & # logcentral" >> /etc/rc.local
  fi
  ;;
esac

# --- Test d'envoi ---
sleep 2

if command -v logger >/dev/null 2>&1; then
  logger -t logcentral "device_id=${DEVICE_ID} tenant=${TENANT_NAME} AGENT_INSTALLED"
elif command -v nc >/dev/null 2>&1; then
  echo "<14>${SYSLOG_HOST} logcentral: device_id=${DEVICE_ID} tenant=${TENANT_NAME} AGENT_INSTALLED" | nc -u -w1 "${SERVER_IP}" 514
else
  echo "Impossible de tester l'envoi (logger/nc absent)"
fi

echo "---"
echo "Installation terminee"
echo "Device ID  : ${DEVICE_ID}"
echo "Tenant     : ${TENANT_NAME}"
echo "Logs       : http://${SERVER_IP}:3000"
echo "Query Loki : {job=\"syslog\", device_id=\"${DEVICE_ID}\"}"