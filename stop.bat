@echo off
title KareMa - stop
cd /d "%~dp0"
echo.
echo   Stopping KareMa...
docker compose stop
echo.
echo   Stopped. Your data is safe - run start.bat to bring it back.
echo.
pause
