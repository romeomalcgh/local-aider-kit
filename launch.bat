@echo off
setlocal
set OLLAMA_API_BASE=http://127.0.0.1:11434
set NODE_ENV=production
cd /d "%~dp0browser-ui"
if not exist node_modules\ (echo Dependencies missing. Run setup.ps1 first.& pause & exit /b 1)
if not exist dist\index.html (call npm run build || (pause & exit /b 1))
start "" powershell.exe -NoProfile -WindowStyle Hidden -Command "Start-Sleep -Seconds 2; Start-Process 'http://localhost:3000'"
npm start
pause
