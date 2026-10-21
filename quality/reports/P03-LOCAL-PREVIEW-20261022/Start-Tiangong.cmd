@echo off
setlocal
cd /d "%~dp0"
if not exist "%~dp0site\index.html" (
  echo Extract the entire ZIP before starting this file.
  pause
  exit /b 1
)
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0StartPreview.ps1"
if errorlevel 1 pause
