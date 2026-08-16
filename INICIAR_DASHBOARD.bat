@echo off
setlocal
cd /d "%~dp0"

set "BUNDLED_NODE=%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"

if exist "%BUNDLED_NODE%" (
  "%BUNDLED_NODE%" server.mjs
  exit /b
)

node --version >nul 2>nul
if not errorlevel 1 (
  node server.mjs
  exit /b
)

echo Node.js 20 ou superior nao foi encontrado.
echo Instale em https://nodejs.org/ e execute este arquivo novamente.
pause
exit /b 1
