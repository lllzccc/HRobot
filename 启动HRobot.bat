@echo off
chcp 65001 >nul
setlocal

set "APP_DIR=%~dp0"
set "PORT=8767"
set "URL=http://127.0.0.1:%PORT%/"

if not exist "%APP_DIR%server.py" (
  echo [ERROR] Cannot find server.py.
  echo Keep this BAT file in the HROBOT project root.
  pause
  exit /b 1
)

where python >nul 2>nul
if not errorlevel 1 (
  set "PYTHON_CMD=python"
) else (
  where py >nul 2>nul
  if errorlevel 1 (
    echo [ERROR] Python was not found.
    pause
    exit /b 1
  )
  set "PYTHON_CMD=py"
)

powershell -NoProfile -ExecutionPolicy Bypass -Command "if(Get-NetTCPConnection -LocalPort %PORT% -State Listen -ErrorAction SilentlyContinue){exit 0}else{exit 1}"
if not errorlevel 1 (
  echo HRobot is already running on port %PORT%. Opening browser...
  start "" "%URL%"
  exit /b 0
)

cd /d "%APP_DIR%"

%PYTHON_CMD% -c "import openpyxl, pypdf" >nul 2>nul
if errorlevel 1 (
  echo Installing missing dependencies...
  %PYTHON_CMD% -m pip install -r requirements.txt
  if errorlevel 1 (
    echo [ERROR] Dependency installation failed. Check Python, pip, and network access.
    pause
    exit /b 1
  )
)

echo Starting HRobot at %URL%
start "HRobot Server - Keep This Window Open" /D "%APP_DIR%" cmd /k "%PYTHON_CMD% server.py --host 127.0.0.1 --port %PORT%"

echo Waiting for HRobot to become ready...
powershell -NoProfile -ExecutionPolicy Bypass -Command "$url='%URL%'; for($i=0;$i -lt 40;$i++){try{$r=Invoke-WebRequest -UseBasicParsing -Uri $url -TimeoutSec 1;if($r.StatusCode -ge 200){Start-Process $url;exit 0}}catch{};Start-Sleep -Milliseconds 500};exit 1"

if errorlevel 1 (
  echo [NOTICE] HRobot is still starting or failed to start. Check the HRobot Server window.
  pause
) else (
  echo HRobot started and opened in your browser.
)

endlocal
