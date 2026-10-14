#!/usr/bin/env bash
set -e

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" >/dev/null 2>&1 && pwd)"
cd "$DIR"

echo "=========================================================="
echo "           Iniciando SGLinux Infrastructure Manager       "
echo "=========================================================="

# Check virtual environment
if [ ! -d ".venv" ]; then
    echo "[+] Criando ambiente virtual Python..."
    python3 -m venv .venv
    .venv/bin/pip install --upgrade pip
    .venv/bin/pip install -r backend/requirements.txt
fi

export PYTHONPATH="$DIR/backend"

# If frontend/dist doesn't exist, build frontend
if [ ! -d "frontend/dist" ]; then
    echo "[+] Construindo frontend React com Vite..."
    cd frontend
    npm install
    npm run build
    cd "$DIR"
fi

echo "[+] Iniciando servidor FastAPI na porta 8000..."
echo "[+] Interface disponível em: http://localhost:8000"
echo "[+] Documentação Swagger em: http://localhost:8000/docs"
echo "=========================================================="

exec .venv/bin/uvicorn app.main:app --host 0.0.0.0 --port 8000
