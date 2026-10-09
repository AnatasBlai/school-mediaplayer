@echo off
chcp 65001 >nul
cd /d "%~dp0"
rem Собрать пакеты для школьного ПК в папку release:
rem   tablo-<версия>.zip        - первая установка (с расписанием, колодами и плейлистом, без фото и видео)
rem   tablo-<версия>-update.zip - обновление уже работающего табло (без папки data)
if not exist node_modules call npm install
call npm run build || goto fail
node tools\pack.mjs || goto fail
node tools\pack.mjs --update || goto fail
echo.
echo Архивы лежат в папке release.
pause
exit /b

:fail
echo Не получилось - смотрите сообщения выше.
pause
