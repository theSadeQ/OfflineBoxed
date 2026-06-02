@echo off
title OfflineBoxd Control Center
echo =======================================================
echo          OFFLINEBOXD AUTO-LAUNCH UTILITY
echo =======================================================
echo.

:: Ensure command runs from the batch file's directory
cd /d "%~dp0"

:: Verify Python is installed and accessible
where python >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] Python was not found on your system!
    echo Please install Python 3.x and ensure it is added to your system PATH.
    echo.
    pause
    exit /b
)

echo [SYSTEM] Starting local Control Center web server...
echo [SYSTEM] Access dashboard at http://localhost:8080
echo.
python gui_server.py

:: If the server exits with an error, pause and offer instructions
if %errorlevel% neq 0 (
    echo.
    echo [WARNING] The GUI Server exited with an error (Code: %errorlevel%).
    echo.
    echo If this is your first time launching, make sure requirements are met:
    echo   1. Open cmd in this folder
    echo   2. Run: pip install -r requirements.txt
    echo.
    pause
)
