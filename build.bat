@echo off
chcp 65001 >nul
cd /d "%~dp0"
if not exist node_modules call npm install
call npm run build
echo.
echo Готово. Перезапустите start.bat, чтобы сервер раздавал новую версию.
pause
