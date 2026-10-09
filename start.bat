@echo off
chcp 65001 >nul
cd /d "%~dp0"
title Расписание - сервер
where node >nul 2>nul || goto nonode
if not exist "dist\index.html" (
  echo Первая сборка сайта...
  if not exist node_modules call npm install
  call npm run build
)
node server.js
pause
exit /b

:nonode
echo Node.js не найден. Пробую установить через winget...
winget install -e --id OpenJS.NodeJS.LTS --accept-package-agreements --accept-source-agreements
echo.
echo Если установка прошла успешно - закройте это окно и запустите start.bat ещё раз.
echo Иначе скачайте Node.js LTS вручную: https://nodejs.org
pause
