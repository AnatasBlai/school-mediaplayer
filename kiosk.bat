@echo off
chcp 65001 >nul
rem Табло в киоск-режиме на телевизоре (настройки — kiosk-settings.txt). Закрыть — kiosk-stop.bat или Alt+F4.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0tools\kiosk.ps1" %*
