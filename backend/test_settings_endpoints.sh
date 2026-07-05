#!/bin/bash
# Script de prueba para verificar los endpoints de Settings

API_URL=$(grep REACT_APP_BACKEND_URL /app/frontend/.env | cut -d '=' -f2)

echo "🧪 TESTING SETTINGS ENDPOINTS"
echo "================================"
echo ""

# Test 1: Verificar endpoint público de organización
echo "📝 Test 1: GET Organization Info (público)"
curl -s "$API_URL/api/public/org_demo001/organization" | python3 -c "
import sys, json
try:
    data = json.load(sys.stdin)
    print(f\"✅ Organization loaded: {data.get('name')}\")
    print(f\"   Phone: {data.get('phone', 'Not set')}\")
    print(f\"   Address: {data.get('address', 'Not set')}\")
except Exception as e:
    print(f'❌ Error: {e}')
"
echo ""

# Test 2: Simular actualización de organización (requiere auth)
echo "📝 Test 2: PUT Organization Profile (requiere auth)"
echo "   Este endpoint requiere sesión válida (cookies)"
echo "   Endpoint: PUT $API_URL/api/organizations/org_demo001"
echo "   Payload: {\"name\": \"New Name\", \"phone\": \"+57123456\", \"address\": \"New Address\"}"
echo "   ⚠️  Debe probarse desde el navegador con sesión activa"
echo ""

# Test 3: Simular cambio de rol (requiere auth)
echo "📝 Test 3: PUT User Role (requiere auth owner/admin)"
echo "   Endpoint: PUT $API_URL/api/owner/users/{user_id}/role?role=admin"
echo "   ⚠️  Debe probarse desde el navegador con sesión activa"
echo ""

echo "================================"
echo "✅ Tests básicos completados"
echo ""
echo "🔍 Para debugging completo:"
echo "1. Abre DevTools (F12) en el navegador"
echo "2. Ve a la pestaña Console"
echo "3. Intenta guardar cambios en Settings"
echo "4. Revisa los logs detallados con emoji ❌"
