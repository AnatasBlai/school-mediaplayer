@echo off
chcp 65001 >nul
cd /d "%~dp0"
rem Выключить автозапуск сервера и киоска.
net session >nul 2>&1
if errorlevel 1 (
  echo Нужны права администратора - Windows сейчас спросит разрешение.
  powershell -NoProfile -Command "Start-Process -FilePath $env:ComSpec -ArgumentList '/c', ('\"' + '%~f0' + '\"') -Verb RunAs"
  exit /b
)
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0tools\autostart.ps1" -Remove
echo.
pause
