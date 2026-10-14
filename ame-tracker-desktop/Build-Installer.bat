@echo off
setlocal
cd /d "%~dp0"

echo.
echo  AME Tracker — building Windows installer
echo  This must run on Windows. It may take several minutes.
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js was not found. Install Node.js 20+ from https://nodejs.org then run this again.
  pause
  exit /b 1
)

call npm install
if errorlevel 1 (
  echo npm install failed.
  pause
  exit /b 1
)

call npm run package:win
if errorlevel 1 (
  echo package:win failed.
  pause
  exit /b 1
)

echo.
echo  Done. Open the release folder for the setup file:
echo  %cd%\release
echo.
start "" "%cd%\release"
pause
