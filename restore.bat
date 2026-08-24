@echo off
setlocal
title KareMa - restore
cd /d "%~dp0"

if "%~1"=="" (
  echo.
  echo   Usage: drag a backup folder onto this file, or run
  echo       restore.bat backups\2026-01-31_09-15
  echo.
  pause
  exit /b 1
)

set "SRC=%~1"
if not exist "%SRC%\database.sql" (
  echo   [X] %SRC% does not contain database.sql
  pause
  exit /b 1
)

echo.
echo   This REPLACES the current KareMa data with the backup in:
echo       %SRC%
echo.
set /p CONFIRM=  Type RESTORE to continue: 
if /i not "%CONFIRM%"=="RESTORE" (
  echo   Cancelled.
  pause
  exit /b 0
)

for /f "tokens=2 delims==" %%U in ('findstr /b "POSTGRES_USER=" .env') do set "PGUSER=%%U"
for /f "tokens=2 delims==" %%D in ('findstr /b "POSTGRES_DB=" .env') do set "PGDB=%%D"
if "%PGUSER%"=="" set "PGUSER=karema"
if "%PGDB%"=="" set "PGDB=karema"

echo   Stopping the app...
docker compose stop api web

echo   Restoring the database...
docker compose exec -T db psql -U %PGUSER% -d postgres -c "DROP DATABASE IF EXISTS %PGDB%;" >nul
docker compose exec -T db psql -U %PGUSER% -d postgres -c "CREATE DATABASE %PGDB%;" >nul
docker compose exec -T db psql -U %PGUSER% -d %PGDB% < "%SRC%\database.sql" >nul

if exist "%SRC%\attachments.tar.gz" (
  echo   Restoring attachments...
  docker run --rm -v karema_karema_files:/data -v "%cd%\%SRC%":/backup alpine sh -c "rm -rf /data/* && tar xzf /backup/attachments.tar.gz -C /data"
)

echo   Starting the app...
docker compose start api web

echo.
echo   Restore complete.
echo.
pause
