@echo off
title KareMa - update
cd /d "%~dp0"
echo.
echo   Rebuilding KareMa from the current source...
echo.
docker compose up -d --build
if errorlevel 1 (
  echo   [X] The rebuild failed. See the output above.
  pause
  exit /b 1
)
echo.
echo   Updated. Your database and attachments were left untouched.
echo.
pause
