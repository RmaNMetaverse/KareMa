@echo off
title KareMa - logs
cd /d "%~dp0"
echo   Showing live logs. Press Ctrl+C to stop watching (KareMa keeps running).
echo.
docker compose logs -f --tail 100
pause
