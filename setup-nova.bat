@echo off
setlocal
title Nova - First Time Setup

echo.
echo  Nova setup
echo  ----------------------------------------
echo.

where node >nul 2>nul
if errorlevel 1 (
    echo [ERROR] Node.js is not installed or not in PATH.
    echo Install Node.js 18+ and run this again.
    pause
    exit /b 1
)

where npm >nul 2>nul
if errorlevel 1 (
    echo [ERROR] npm is not available.
    pause
    exit /b 1
)

where ollama >nul 2>nul
if errorlevel 1 (
    echo [ERROR] Ollama is not installed or not in PATH.
    echo Install Ollama, then run this again.
    pause
    exit /b 1
)

echo [1/3] Installing Nova dependencies...
call npm install
if errorlevel 1 goto :fail

echo.
echo [2/3] Downloading the recommended local coding model...
ollama pull qwen2.5-coder:3b
if errorlevel 1 goto :fail

echo.
echo [3/3] Checking Nova syntax...
call npm test
if errorlevel 1 goto :fail

echo.
echo ========================================
echo  Nova setup complete!
echo ========================================
echo.
echo Run run-nova.bat to start Nova.
echo.
pause
exit /b 0

:fail
echo.
echo [ERROR] Setup failed. Read the message above.
pause
exit /b 1
