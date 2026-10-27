# Сборка приложения "ЖКХ Контроль" в готовую программу + ярлык на рабочем столе.
# Запуск:  правой кнопкой -> "Выполнить с помощью PowerShell"
#   или в терминале:  powershell -ExecutionPolicy Bypass -File scripts\build-app.ps1
$ErrorActionPreference = 'Stop'

$proj   = Split-Path -Parent $PSScriptRoot
$outDir = Join-Path $env:USERPROFILE 'jkh-release'   # сборка вне OneDrive (во избежание блокировок файлов)
$appDir = Join-Path $env:USERPROFILE 'JKH-Control-App'
$icon   = Join-Path $proj 'build\icon.ico'

Write-Host '==> Сборка интерфейса (Vite)...' -ForegroundColor Cyan
Push-Location $proj
npm run build
if ($LASTEXITCODE -ne 0) { throw 'Ошибка сборки Vite' }

Write-Host '==> Упаковка в приложение (electron-builder)...' -ForegroundColor Cyan
$env:CSC_IDENTITY_AUTO_DISCOVERY = 'false'
# dir-таргет: готовая папка с .exe без установщика (не требует подписи кода)
npx electron-builder --win --dir -c.directories.output="$outDir"
# код выхода может быть !=0 из-за шага asar-integrity — проверяем наличие exe отдельно
Pop-Location

$src = Join-Path $outDir 'win-unpacked'
$exe = Join-Path $src 'ЖКХ Контроль.exe'
if (-not (Test-Path -LiteralPath $exe)) { throw "Не найден собранный exe: $exe" }

Write-Host '==> Копирование приложения в стабильную папку...' -ForegroundColor Cyan
if (Test-Path -LiteralPath $appDir) { Remove-Item -LiteralPath $appDir -Recurse -Force }
Copy-Item -LiteralPath $src -Destination $appDir -Recurse

Write-Host '==> Создание ярлыка на рабочем столе...' -ForegroundColor Cyan
$targetExe = Join-Path $appDir 'ЖКХ Контроль.exe'
$desktop   = [Environment]::GetFolderPath('Desktop')
$lnk       = Join-Path $desktop 'ЖКХ Контроль.lnk'
$ws = New-Object -ComObject WScript.Shell
$s  = $ws.CreateShortcut($lnk)
$s.TargetPath       = $targetExe
$s.WorkingDirectory = $appDir
if (Test-Path -LiteralPath $icon) { $s.IconLocation = $icon }
$s.Description = 'ЖКХ Контроль — учёт коммунальных услуг'
$s.Save()

Write-Host ''
Write-Host 'Готово!' -ForegroundColor Green
Write-Host "  Приложение: $targetExe"
Write-Host "  Ярлык:      $lnk"
