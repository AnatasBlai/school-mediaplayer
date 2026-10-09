@echo off
chcp 65001 >nul
cd /d "%~dp0"
rem Включить автозапуск: сервер — при включении компьютера, табло на телевизоре — при входе в Windows.
rem Нужны права администратора: если их нет, Windows спросит разрешение и файл перезапустится.
net session >nul 2>&1
if errorlevel 1 (
  echo Нужны права администратора - Windows сейчас спросит разрешение.
  powershell -NoProfile -Command "Start-Process -FilePath $env:ComSpec -ArgumentList '/c', ('\"' + '%~f0' + '\" %USERDOMAIN%\%USERNAME%') -Verb RunAs"
  exit /b
)
set "KUSER=%~1"
if "%KUSER%"=="" set "KUSER=%USERDOMAIN%\%USERNAME%"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0tools\autostart.ps1" -User "%KUSER%"
echo.
pause
