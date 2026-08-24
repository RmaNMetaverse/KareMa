@echo off
title KareMa - remove everything
cd /d "%~dp0"
echo.
echo   WARNING: this deletes the KareMa containers, the database AND
echo   every uploaded attachment. Run backup.bat first if you want a copy.
echo.
set /p CONFIRM=  Type DELETE to continue: 
if /i not "%CONFIRM%"=="DELETE" (
  echo   Cancelled.
  pause
  exit /b 0
)
docker compose down -v
echo.
echo   Removed.
echo.
pause
