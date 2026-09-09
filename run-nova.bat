@echo off
setlocal
title Nova - Local AI Coding Assistant

where node >nul 2>nul
if errorlevel 1 (
    echo [ERROR] Node.js is not installed or not in PATH.
    pause
    exit /b 1
)

where ollama >nul 2>nul
if errorlevel 1 (
    echo [ERROR] Ollama is not installed or not in PATH.
    pause
    exit /b 1
)

echo Checking Ollama...
curl -s http://127.0.0.1:11434/api/tags >nul 2>nul
if errorlevel 1 (
    echo Ollama is not running. Starting Ollama service...
    start "" /min ollama serve
    timeout /t 3 /nobreak >nul
)

echo Starting Nova...
start "" http://localhost:3000
npm start
