@echo off
chcp 65001 >nul
cd /d "%~dp0"
title Расписание - режим разработки
where node >nul 2>nul || (
  echo Node.js не найден. Сначала запустите start.bat - он установит Node.js.
  pause
  exit /b
)
if not exist node_modules (
  echo Устанавливаю зависимости...
  call npm install
)
call npm run dev
pause
