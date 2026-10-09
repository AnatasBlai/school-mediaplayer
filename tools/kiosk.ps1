# Табло в киоск-режиме браузера на экране-телевизоре. Настройки — kiosk-settings.txt в папке проекта.
#   kiosk.ps1          — дождаться сервера и открыть табло (прежнее окно киоска закрывается)
#   kiosk.ps1 -Stop    — закрыть окно киоска (обычный браузер пользователя не трогаем)
#   kiosk.ps1 -DryRun  — только показать, что будет запущено
# У киоска свой профиль браузера (%LOCALAPPDATA%\tablo-kiosk): по нему окно киоска отличается от обычного браузера.
param([switch]$Stop, [switch]$DryRun)

$root = Split-Path -Parent $PSScriptRoot
$cfg = @{ browser = ''; url = 'http://localhost:8080/'; x = '1920'; y = '0'; wait = '300' }
$file = Join-Path $root 'kiosk-settings.txt'
if (Test-Path $file) {
  foreach ($line in Get-Content $file -Encoding UTF8) {
    if ($line -match '^\s*([a-z]+)\s*=\s*(.*?)\s*$') { $cfg[$Matches[1]] = $Matches[2] }
  }
}
$profileDir = Join-Path $env:LOCALAPPDATA 'tablo-kiosk'

function Stop-Kiosk {
  Get-CimInstance Win32_Process -Filter "Name='browser.exe' OR Name='chrome.exe' OR Name='msedge.exe'" |
    Where-Object { $_.CommandLine -like '*tablo-kiosk*' } |
    ForEach-Object { Invoke-CimMethod -InputObject $_ -MethodName Terminate | Out-Null }
}

if ($Stop) {
  Stop-Kiosk
  Write-Host 'Окно киоска закрыто.'
  exit 0
}

# браузер: из настроек, иначе первый найденный
$candidates = @(
  $cfg.browser,
  "$env:LOCALAPPDATA\Yandex\YandexBrowser\Application\browser.exe",
  "${env:ProgramFiles(x86)}\Yandex\YandexBrowser\Application\browser.exe",
  "$env:ProgramFiles\Yandex\YandexBrowser\Application\browser.exe",
  "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
  "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe",
  "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe",
  "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe",
  "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe"
)
$exe = $candidates | Where-Object { $_ -and (Test-Path $_) } | Select-Object -First 1
if (-not $exe) {
  Write-Host 'Браузер не найден. Укажите путь к нему в kiosk-settings.txt (строка browser = ...).'
  exit 1
}

$browserArgs = @(
  '--kiosk', $cfg.url,
  "--user-data-dir=`"$profileDir`"",
  "--window-position=$($cfg.x),$($cfg.y)",
  '--no-first-run',
  '--no-default-browser-check',
  '--autoplay-policy=no-user-gesture-required', # видео со звуком без клика по странице
  '--disable-session-crashed-bubble',            # без «Восстановить страницы?» после сбоя питания
  '--disable-infobars',
  '--noerrdialogs',
  '--disable-features=Translate',
  '--overscroll-history-navigation=0',
  '--disable-pinch'
)

if ($DryRun) {
  Write-Host "Браузер: $exe"
  Write-Host "Параметры: $($browserArgs -join ' ')"
  exit 0
}

# ждём, пока сервер начнёт отвечать (после включения ПК он стартует не сразу)
$deadline = (Get-Date).AddSeconds([int]$cfg.wait)
while ((Get-Date) -lt $deadline) {
  try {
    Invoke-WebRequest -Uri $cfg.url -UseBasicParsing -TimeoutSec 3 | Out-Null
    break
  } catch {
    Start-Sleep -Seconds 2
  }
}

Stop-Kiosk
Start-Sleep -Seconds 1
Start-Process -FilePath $exe -ArgumentList $browserArgs
