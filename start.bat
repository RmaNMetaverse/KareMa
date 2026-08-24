@echo off
setlocal EnableDelayedExpansion
title KareMa - start
cd /d "%~dp0"

echo.
echo   KareMa
echo   ======
echo.

REM ---- 1. is Docker there and running? -------------------------------------
where docker >nul 2>&1
if errorlevel 1 (
  echo   [X] Docker was not found.
  echo.
  echo   Install Docker Desktop from https://www.docker.com/products/docker-desktop
  echo   then run this file again.
  echo.
  pause
  exit /b 1
)

docker info >nul 2>&1
if errorlevel 1 (
  echo   [X] Docker Desktop is installed but not running.
  echo       Start Docker Desktop, wait for the whale icon to go steady, then run this again.
  echo.
  pause
  exit /b 1
)

REM ---- 2. first run: build a .env with a strong secret ---------------------
if not exist ".env" (
  echo   First run - creating your .env configuration...
  copy /y ".env.example" ".env" >nul

  for /f "delims=" %%S in ('powershell -NoProfile -Command "[Convert]::ToBase64String((1..48 ^| ForEach-Object {Get-Random -Max 256}))"') do set "SECRET=%%S"
  powershell -NoProfile -Command "(Get-Content '.env') -replace '^JWT_SECRET=.*', ('JWT_SECRET=' + [regex]::Escape('!SECRET!').Replace('\','')) | Set-Content '.env'"

  echo   Generated a unique JWT_SECRET for this installation.
  echo.
  echo   Open .env in Notepad if you want to change the port or the admin login
  echo   BEFORE the first start. The defaults are:
  echo       address   http://localhost:8080
  echo       email     admin@karema.local
  echo       password  admin1234
  echo.
  pause
)

REM ---- 3. up ---------------------------------------------------------------
echo   Building and starting KareMa. The first run takes a few minutes.
echo.
docker compose up -d --build
if errorlevel 1 (
  echo.
  echo   [X] Something went wrong. The output above should say what.
  pause
  exit /b 1
)

REM ---- 4. wait for the API ------------------------------------------------
for /f "tokens=2 delims==" %%P in ('findstr /b "KAREMA_PORT=" .env') do set "PORT=%%P"
if "%PORT%"=="" set "PORT=8080"

echo.
echo   Waiting for KareMa to come up...
set /a tries=0
:waitloop
set /a tries+=1
powershell -NoProfile -Command "try { $r = Invoke-WebRequest -UseBasicParsing -TimeoutSec 3 http://localhost:%PORT%/api/health; if ($r.StatusCode -eq 200) { exit 0 } else { exit 1 } } catch { exit 1 }" >nul 2>&1
if not errorlevel 1 goto ready
if %tries% GEQ 40 (
  echo   [!] It is taking longer than expected. Check the logs with logs.bat
  goto done
)
timeout /t 3 /nobreak >nul
goto waitloop

:ready
echo.
echo   KareMa is running.
echo.
echo     Open        http://localhost:%PORT%
echo     Sign in     see ADMIN_EMAIL / ADMIN_PASSWORD in .env
echo.
echo   Other people on your network reach it at http://YOUR-PC-NAME:%PORT%
echo.
start "" "http://localhost:%PORT%"

:done
echo   This window can be closed. KareMa keeps running in the background
echo   and restarts automatically with Docker Desktop.
echo.
pause
