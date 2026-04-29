#!/bin/bash
# test-api.sh — teste tous les endpoints de l'API
BASE="http://localhost:4000/api"

echo "=== Test LogCentral API ==="
echo ""

# 1. Health
echo "--- Health ---"
curl -s http://localhost:4000/health | python3 -m json.tool
echo ""

# 2. Register
echo "--- Register ---"
REGISTER=$(curl -s -X POST "$BASE/auth/register" \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@acme.com","password":"password123","name":"Admin Acme","tenantName":"acme"}')
echo $REGISTER | python3 -m json.tool
TOKEN=$(echo $REGISTER | python3 -c "import sys,json; print(json.load(sys.stdin).get('token',''))")
echo "TOKEN: $TOKEN"
echo ""

# 3. Login
echo "--- Login ---"
LOGIN=$(curl -s -X POST "$BASE/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@acme.com","password":"password123"}')
echo $LOGIN | python3 -m json.tool
TOKEN=$(echo $LOGIN | python3 -c "import sys,json; print(json.load(sys.stdin).get('token',''))")
echo ""

# 4. Créer un device
echo "--- Créer device ---"
DEVICE=$(curl -s -X POST "$BASE/devices" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"name":"Mon Routeur Principal","deviceId":"router-01"}')
echo $DEVICE | python3 -m json.tool
echo ""

# 5. Lister les devices
echo "--- Lister devices ---"
curl -s "$BASE/devices" \
  -H "Authorization: Bearer $TOKEN" | python3 -m json.tool
echo ""

# 6. Récupérer des logs
echo "--- Logs (dernière heure) ---"
curl -s "$BASE/logs?limit=5" \
  -H "Authorization: Bearer $TOKEN" | python3 -m json.tool
echo ""

echo "=== Tests terminés ==="
