#!/bin/bash

# ============================================================
# PestaMax - Script de Inicio
# ============================================================
# Ejecutar desde la carpeta prestamax/
# ./start.sh

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$SCRIPT_DIR/backend"
FRONTEND_DIR="$SCRIPT_DIR/frontend"

echo ""
echo "╔══════════════════════════════════════╗"
echo "║         PestaMax - Iniciando          ║"
echo "╚══════════════════════════════════════╝"
echo ""

# Check if database exists, seed if not
DB_PATH="/sessions/admiring-brave-dirac/prestamax.db"
if [ ! -f "$DB_PATH" ]; then
  echo "📦 Inicializando base de datos..."
  cd "$BACKEND_DIR" && npx ts-node --transpile-only src/db/seed.ts
  echo ""
fi

# Start backend
echo "🚀 Iniciando Backend API (puerto 3001)..."
cd "$BACKEND_DIR" && npx ts-node-dev --transpile-only --no-notify src/index.ts > /tmp/prestamax-backend.log 2>&1 &
BACKEND_PID=$!
echo "   PID: $BACKEND_PID"

sleep 3

# Verify backend
if curl -s http://localhost:3001/health > /dev/null 2>&1; then
  echo "   ✅ Backend corriendo en http://localhost:3001"
else
  echo "   ❌ Error iniciando backend. Ver /tmp/prestamax-backend.log"
fi

# Start frontend
echo ""
echo "🌐 Iniciando Frontend (puerto 5173)..."
cd "$FRONTEND_DIR" && npx vite --port 5173 > /tmp/prestamax-frontend.log 2>&1 &
FRONTEND_PID=$!
echo "   PID: $FRONTEND_PID"

sleep 3

if curl -s -o /dev/null -w "%{http_code}" http://localhost:5173/ | grep -q "200"; then
  echo "   ✅ Frontend corriendo en http://localhost:5173"
else
  echo "   ❌ Error iniciando frontend. Ver /tmp/prestamax-frontend.log"
fi

echo ""
echo "╔══════════════════════════════════════════════════════╗"
echo "║               ✅ PestaMax está listo                  ║"
echo "╠══════════════════════════════════════════════════════╣"
echo "║  🌐 App:     http://localhost:5173                    ║"
echo "║  🔌 API:     http://localhost:3001                    ║"
echo "║  ❤️  Health: http://localhost:3001/health              ║"
echo "╠══════════════════════════════════════════════════════╣"
echo "║  📧 Admin:    admin@prestamax.com                     ║"
echo "║  🔑 Password: Admin123!                               ║"
echo "╠══════════════════════════════════════════════════════╣"
echo "║  📧 Oficial:  oficial@garcia.com / Demo123!           ║"
echo "║  📧 Cobrador: cobrador@garcia.com / Demo123!          ║"
echo "╚══════════════════════════════════════════════════════╝"
echo ""
echo "  Para detener: kill $BACKEND_PID $FRONTEND_PID"
echo ""

# Keep script running
wait
