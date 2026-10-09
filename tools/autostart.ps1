# Автозапуск табло через «Планировщик заданий» Windows (запускать от администратора — это делает autostart-install.bat).
#   «Tablo - server» — сервер (node server.js) при ВКЛЮЧЕНИИ компьютера, от имени SYSTEM, без окна.
#                      Работает и без входа в Windows; упадёт — перезапустится через минуту.
#   «Tablo - kiosk»  — табло в киоск-режиме при ВХОДЕ пользователя в Windows (окно браузера можно показать
#                      только после входа).
#   autostart.ps1 -User DOMAIN\user   — установить (пользователь — для киоска)
#   autostart.ps1 -Remove             — убрать оба задания и остановить сервер
#   -DryRun                           — только показать, что будет сделано
param([string]$User = "$env:USERDOMAIN\$env:USERNAME", [switch]$Remove, [switch]$DryRun)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$serverTask = 'Tablo - server'
$kioskTask = 'Tablo - kiosk'

function Stop-PortServer {
  # сервер, запущенный вручную (start.bat), держит порт 8080 — иначе новый не запустится
  $c = Get-NetTCPConnection -LocalPort 8080 -State Listen -ErrorAction SilentlyContinue
  if ($c) {
    Write-Host "Останавливаю сервер, который уже работает на порту 8080 (процесс $($c.OwningProcess))..."
    if (-not $DryRun) { Stop-Process -Id $c.OwningProcess -Force }
  }
}

if ($Remove) {
  foreach ($t in $serverTask, $kioskTask) {
    if (Get-ScheduledTask -TaskName $t -ErrorAction SilentlyContinue) {
      Write-Host "Убираю задание «$t»"
      if (-not $DryRun) {
        Stop-ScheduledTask -TaskName $t -ErrorAction SilentlyContinue
        Unregister-ScheduledTask -TaskName $t -Confirm:$false
      }
    }
  }
  Stop-PortServer
  Write-Host 'Автозапуск выключен. Запускать сервер теперь вручную — start.bat.'
  exit 0
}

$node = (Get-Command node -ErrorAction SilentlyContinue).Source
if (-not $node) { throw 'Node.js не найден. Сначала запустите start.bat — он установит Node.js.' }
if (-not (Test-Path (Join-Path $root 'dist\index.html'))) { throw 'Сайт не собран: сначала запустите build.bat.' }

Write-Host "Папка табло: $root"
Write-Host "Node.js:     $node"
Write-Host "Киоск для:   $User"
if ($DryRun) { Write-Host '(проверка — ничего не меняю)'; exit 0 }

# --- сервер: при включении компьютера, от SYSTEM ---
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable `
  -ExecutionTimeLimit ([TimeSpan]::Zero) -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) -MultipleInstances IgnoreNew
Register-ScheduledTask -TaskName $serverTask -Force `
  -Description 'Школьное табло: сервер (node server.js). Создано autostart-install.bat' `
  -Action (New-ScheduledTaskAction -Execute $node -Argument "`"$root\server.js`"" -WorkingDirectory $root) `
  -Trigger (New-ScheduledTaskTrigger -AtStartup) `
  -Principal (New-ScheduledTaskPrincipal -UserId 'SYSTEM' -LogonType ServiceAccount -RunLevel Highest) `
  -Settings $settings | Out-Null
Write-Host "Задание «$serverTask» создано."

# --- киоск: при входе пользователя ---
$kioskArgs = "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$root\tools\kiosk.ps1`""
Register-ScheduledTask -TaskName $kioskTask -Force `
  -Description 'Школьное табло: браузер в киоск-режиме на телевизоре. Создано autostart-install.bat' `
  -Action (New-ScheduledTaskAction -Execute 'powershell.exe' -Argument $kioskArgs -WorkingDirectory $root) `
  -Trigger (New-ScheduledTaskTrigger -AtLogOn -User $User) `
  -Principal (New-ScheduledTaskPrincipal -UserId $User -LogonType Interactive -RunLevel Limited) `
  -Settings (New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit ([TimeSpan]::Zero)) | Out-Null
Write-Host "Задание «$kioskTask» создано."

# запускаем сервер прямо сейчас, не дожидаясь перезагрузки
Stop-PortServer
Start-Sleep -Seconds 1
Start-ScheduledTask -TaskName $serverTask
Write-Host ''
Write-Host 'Готово. Сервер запущен и будет запускаться сам при включении компьютера.'
Write-Host 'Табло на телевизоре откроется само при входе в Windows (сейчас — запустите kiosk.bat).'
