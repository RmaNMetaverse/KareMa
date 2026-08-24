@echo off
setlocal
title KareMa - backup
cd /d "%~dp0"

for /f "tokens=2 delims==" %%U in ('findstr /b "POSTGRES_USER=" .env') do set "PGUSER=%%U"
for /f "tokens=2 delims==" %%D in ('findstr /b "POSTGRES_DB=" .env') do set "PGDB=%%D"
if "%PGUSER%"=="" set "PGUSER=karema"
if "%PGDB%"=="" set "PGDB=karema"

for /f "delims=" %%T in ('powershell -NoProfile -Command "Get-Date -Format yyyy-MM-dd_HH-mm"') do set "STAMP=%%T"
set "DEST=backups\%STAMP%"
mkdir "%DEST%" 2>nul

echo.
echo   Backing up to %DEST%
echo.

echo   [1/2] database...
docker compose exec -T db pg_dump -U %PGUSER% -d %PGDB% > "%DEST%\database.sql"
if errorlevel 1 (
  echo   [X] Database backup failed. Is KareMa running? Try start.bat first.
  pause
  exit /b 1
)

echo   [2/2] attachments...
docker run --rm -v karema_karema_files:/data -v "%cd%\%DEST%":/backup alpine tar czf /backup/attachments.tar.gz -C /data .
if errorlevel 1 (
  echo   [X] Attachment backup failed.
  pause
  exit /b 1
)

echo.
echo   Done. Keep the whole %DEST% folder somewhere safe.
echo.
dir /b "%DEST%"
echo.
pause
