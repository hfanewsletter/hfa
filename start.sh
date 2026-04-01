#!/usr/bin/env bash
# ============================================================
# start.sh — Start the full HFA Newspaper app on localhost
#
# What this does:
#   1. Checks prerequisites (Python 3, Node, npm)
#   2. Creates .env and web/.env.local from examples if missing
#   3. Creates/activates Python venv and installs dependencies
#   4. Installs Node dependencies for the web app
#   5. Creates required folders (inbox, processed, logs, data)
#   6. Starts the Python pipeline worker (background)
#   7. Starts the Next.js dev server (foreground, port 3000)
#   8. Cleans up the Python worker on exit (Ctrl+C)
# ============================================================

set -euo pipefail

# ── Colours ──────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
RESET='\033[0m'

info()    { echo -e "${CYAN}[INFO]${RESET} $*"; }
success() { echo -e "${GREEN}[OK]${RESET}   $*"; }
warn()    { echo -e "${YELLOW}[WARN]${RESET} $*"; }
error()   { echo -e "${RED}[ERROR]${RESET} $*" >&2; }

# ── Move to project root (the folder containing this script) ─
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo ""
echo -e "${BOLD}================================================${RESET}"
echo -e "${BOLD}   HFA Newspaper — Local Dev Startup${RESET}"
echo -e "${BOLD}================================================${RESET}"
echo ""

# ── 1. Prerequisites ─────────────────────────────────────────
info "Checking prerequisites..."

if ! command -v python3 &>/dev/null; then
    error "Python 3 is not installed. Download from https://www.python.org/downloads/"
    exit 1
fi

PYTHON_VERSION=$(python3 -c 'import sys; print(f"{sys.version_info.major}.{sys.version_info.minor}")')
PYTHON_MAJOR=$(echo "$PYTHON_VERSION" | cut -d. -f1)
PYTHON_MINOR=$(echo "$PYTHON_VERSION" | cut -d. -f2)
if [ "$PYTHON_MAJOR" -lt 3 ] || { [ "$PYTHON_MAJOR" -eq 3 ] && [ "$PYTHON_MINOR" -lt 10 ]; }; then
    error "Python 3.10 or higher is required (found $PYTHON_VERSION)."
    exit 1
fi
success "Python $PYTHON_VERSION"

if ! command -v node &>/dev/null; then
    error "Node.js is not installed. Download from https://nodejs.org/"
    exit 1
fi
success "Node $(node --version)"

if ! command -v npm &>/dev/null; then
    error "npm is not installed (should come with Node.js)."
    exit 1
fi
success "npm $(npm --version)"

# ── 2. Env files ─────────────────────────────────────────────
if [ ! -f ".env" ]; then
    warn ".env not found — creating from .env.example"
    cp .env.example .env
    echo ""
    echo -e "${YELLOW}  ┌─────────────────────────────────────────────────────┐${RESET}"
    echo -e "${YELLOW}  │  ACTION REQUIRED: open .env and fill in:            │${RESET}"
    echo -e "${YELLOW}  │    LLM_API_KEY   — your Gemini API key               │${RESET}"
    echo -e "${YELLOW}  │    EMAIL_SENDER  — sender address on your Resend domain│${RESET}"
    echo -e "${YELLOW}  │    RESEND_API_KEY — your Resend API key              │${RESET}"
    echo -e "${YELLOW}  └─────────────────────────────────────────────────────┘${RESET}"
    echo ""
    read -rp "  Press Enter to continue anyway, or Ctrl+C to edit .env first... "
else
    success ".env present"
fi

if [ ! -f "web/.env.local" ]; then
    warn "web/.env.local not found — creating from web/.env.local.example"
    cp web/.env.local.example web/.env.local
    # Generate a random AUTH_SECRET
    if command -v openssl &>/dev/null; then
        AUTH_SECRET=$(openssl rand -hex 32)
        if [[ "$OSTYPE" == "darwin"* ]]; then
            sed -i '' "s/replace-with-a-long-random-string/$AUTH_SECRET/" web/.env.local
        else
            sed -i "s/replace-with-a-long-random-string/$AUTH_SECRET/" web/.env.local
        fi
        success "Generated AUTH_SECRET in web/.env.local"
    fi
    warn "Admin password is 'changeme' — update ADMIN_PASSWORD in web/.env.local"
else
    success "web/.env.local present"
fi

# ── 3. Python venv ────────────────────────────────────────────
if [ ! -d "venv" ]; then
    info "Creating Python virtual environment..."
    python3 -m venv venv
    success "Virtual environment created at ./venv"
else
    success "Virtual environment already exists"
fi

info "Activating virtual environment..."
# shellcheck disable=SC1091
source venv/bin/activate

info "Checking Python dependencies..."
pip install --quiet --upgrade pip
pip install --quiet -r requirements.txt
success "Python dependencies up to date"

# ── 4. Node dependencies ──────────────────────────────────────
if [ ! -d "web/node_modules" ]; then
    info "Installing Node.js dependencies (this may take a minute)..."
    npm install --prefix web --silent
    success "Node.js dependencies installed"
else
    success "Node.js dependencies already installed"
fi

# ── 5. Required folders ───────────────────────────────────────
for dir in inbox editorial_inbox processed logs data data/weekly_editions; do
    mkdir -p "$dir"
done
success "Required folders ready (inbox/, editorial_inbox/, processed/, logs/, data/)"

# ── 6. Start Python worker ────────────────────────────────────
echo ""
info "Starting Python pipeline worker (watching inbox/ for PDFs)..."
PYTHONUNBUFFERED=1 python3 src/main.py --process-existing 2>&1 | tee logs/app.log &
PYTHON_PID=$!
success "Python worker started (PID $PYTHON_PID) — logs at logs/app.log"

# Trap Ctrl+C — kill Python worker when the script exits
cleanup() {
    echo ""
    info "Shutting down..."
    if kill -0 "$PYTHON_PID" 2>/dev/null; then
        kill "$PYTHON_PID"
        success "Python worker stopped"
    fi
    exit 0
}
trap cleanup INT TERM

# Give the worker a moment to start, then check it's still alive
sleep 1
if ! kill -0 "$PYTHON_PID" 2>/dev/null; then
    warn "Python worker exited early — check logs/app.log for errors"
    warn "The web app will still start; you can fix the issue and restart"
fi

# ── 7. Start Next.js ──────────────────────────────────────────
echo ""
info "Starting Next.js web server..."
echo ""
echo -e "${BOLD}================================================${RESET}"
echo -e "${BOLD}  App is starting at http://localhost:3000${RESET}"
echo -e "${BOLD}  Admin panel:       http://localhost:3000/admin${RESET}"
echo -e "${BOLD}  Press Ctrl+C to stop everything${RESET}"
echo -e "${BOLD}================================================${RESET}"
echo ""

npm run dev --prefix web
