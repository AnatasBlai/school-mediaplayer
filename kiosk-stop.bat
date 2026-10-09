@echo off
chcp 65001 >nul
rem Закрыть окно табло в киоск-режиме (обычный браузер не трогается).
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0tools\kiosk.ps1" -Stop
timeout /t 3 >nul
