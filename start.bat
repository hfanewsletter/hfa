@echo off
setlocal EnableDelayedExpansion

:: ============================================================
:: start.bat — Start the full HFA Newspaper app on localhost
::
:: What this does:
::   1. Checks prerequisites (Python, Node, npm)
::   2. Creates .env and web\.env.local from examples if missing
::   3. Creates/activates Python venv and installs dependencies
::   4. Installs Node dependencies for the web app
::   5. Creates required folders (inbox, processed, logs, data)
::   6. Starts the Python pipeline worker (new window)
::   7. Starts the Next.js dev server (this window, port 3000)
:: ============================================================

:: Move to the folder containing this script
cd /d "%~dp0"

echo.
echo ================================================
echo    HFA Newspaper -- Local Dev Startup
echo ================================================
echo.

:: ── 1. Prerequisites ─────────────────────────────────────────
echo [INFO] Checking prerequisites...

where python >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Python is not installed.
    echo         Download from https://www.python.org/downloads/
    echo         Make sure to check "Add Python to PATH" during install.
    pause
    exit /b 1
)

for /f "tokens=*" %%v in ('python --version 2^>^&1') do set PYTHON_VER=%%v
echo [OK]   !PYTHON_VER!

where node >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Node.js is not installed. Download from https://nodejs.org/
    pause
    exit /b 1
)
for /f "tokens=*" %%v in ('node --version 2^>^&1') do echo [OK]   Node %%v

where npm >nul 2>&1
if errorlevel 1 (
    echo [ERROR] npm not found. It should come with Node.js.
    pause
    exit /b 1
)
for /f "tokens=*" %%v in ('npm --version 2^>^&1') do echo [OK]   npm %%v

:: ── 2. Env files ─────────────────────────────────────────────
if not exist ".env" (
    echo [WARN] .env not found -- creating from .env.example
    copy ".env.example" ".env" >nul
    echo.
    echo   +---------------------------------------------------------+
    echo   ^|  ACTION REQUIRED: open .env in a text editor and fill:  ^|
    echo   ^|    LLM_API_KEY    -- your Gemini API key                ^|
    echo   ^|    EMAIL_SENDER   -- sender on your Resend domain         ^|
    echo   ^|    RESEND_API_KEY -- your Resend API key                ^|
    echo   +---------------------------------------------------------+
    echo.
    pause
) else (
    echo [OK]   .env present
)

if not exist "web\.env.local" (
    echo [WARN] web\.env.local not found -- creating from example
    copy "web\.env.local.example" "web\.env.local" >nul
    echo [WARN] Admin password is 'changeme' -- update ADMIN_PASSWORD in web\.env.local
) else (
    echo [OK]   web\.env.local present
)

:: ── 3. Python venv ────────────────────────────────────────────
if not exist "venv\" (
    echo [INFO] Creating Python virtual environment...
    python -m venv venv
    if errorlevel 1 (
        echo [ERROR] Failed to create virtual environment.
        pause
        exit /b 1
    )
    echo [OK]   Virtual environment created at .\venv
) else (
    echo [OK]   Virtual environment already exists
)

echo [INFO] Activating virtual environment...
call venv\Scripts\activate.bat

echo [INFO] Checking Python dependencies...
pip install --quiet --upgrade pip
pip install --quiet -r requirements.txt
if errorlevel 1 (
    echo [ERROR] Failed to install Python dependencies.
    pause
    exit /b 1
)
echo [OK]   Python dependencies up to date

:: ── 4. Node dependencies ──────────────────────────────────────
if not exist "web\node_modules\" (
    echo [INFO] Installing Node.js dependencies (this may take a minute^)...
    npm install --prefix web
    if errorlevel 1 (
        echo [ERROR] Failed to install Node.js dependencies.
        pause
        exit /b 1
    )
    echo [OK]   Node.js dependencies installed
) else (
    echo [OK]   Node.js dependencies already installed
)

:: ── 5. Required folders ───────────────────────────────────────
if not exist "inbox\"              mkdir inbox
if not exist "editorial_inbox\"    mkdir editorial_inbox
if not exist "processed\"          mkdir processed
if not exist "logs\"               mkdir logs
if not exist "data\"               mkdir data
if not exist "data\weekly_editions\" mkdir data\weekly_editions
echo [OK]   Required folders ready

:: ── 6. Start Python worker in a new window ────────────────────
echo.
echo [INFO] Starting Python pipeline worker in a new window...
start "HFA Python Worker" cmd /k "cd /d %~dp0 && call venv\Scripts\activate.bat && python src\main.py --process-existing"
echo [OK]   Python worker window opened

:: Brief pause so the worker window has time to initialise
timeout /t 2 /nobreak >nul

:: ── 7. Start Next.js ──────────────────────────────────────────
echo.
echo ================================================
echo   App is starting at http://localhost:3000
echo   Admin panel:       http://localhost:3000/admin
echo   Close this window to stop the web server.
echo   Close the Python Worker window to stop it.
echo ================================================
echo.

npm run dev --prefix web

endlocal
