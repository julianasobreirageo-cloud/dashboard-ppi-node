@echo off
setlocal
cd /d "%~dp0"
title Publicar Dashboard PPI na Internet

set "BUNDLED_NODE=%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"
set "NODE_CMD="
if exist "%BUNDLED_NODE%" set "NODE_CMD=%BUNDLED_NODE%"
if not defined NODE_CMD node --version >nul 2>nul && set "NODE_CMD=node"

if not defined NODE_CMD (
  echo Node.js nao foi encontrado.
  pause
  exit /b 1
)
if not exist "cloudflared.exe" (
  echo O publicador cloudflared.exe nao foi encontrado nesta pasta.
  pause
  exit /b 1
)

for /f %%P in ('powershell -NoProfile -Command "$l=[Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback,0);$l.Start();$p=$l.LocalEndpoint.Port;$l.Stop();$p"') do set "PPI_PORT=%%P"

echo ===============================================================
echo   PUBLICACAO TEMPORARIA - CENTRO DE INTELIGENCIA PPI
echo ===============================================================
echo.
echo 1. O servidor Node sera aberto em outra janela.
echo 2. Aguarde o endereco https://...trycloudflare.com aparecer abaixo.
echo 3. Copie esse endereco e envie para quem acessara o dashboard.
echo 4. Mantenha as duas janelas abertas durante a demonstracao.
echo.

start "Servidor Node - Dashboard PPI" cmd /k "set PPI_DASHBOARD_PORT=%PPI_PORT%&& "%NODE_CMD%" server.mjs"
timeout /t 4 /nobreak >nul

echo Criando endereco publico seguro para a porta %PPI_PORT%...
echo.
cloudflared.exe tunnel --url "http://127.0.0.1:%PPI_PORT%" --no-autoupdate

echo.
echo A publicacao foi encerrada.
pause
