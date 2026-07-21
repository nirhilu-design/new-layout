@echo off
cd /d %~dp0

if not exist dist (
  echo dist folder not found. Running build...
  call npm install
  call npm run build
)

echo Starting local server...
node server.js
pause