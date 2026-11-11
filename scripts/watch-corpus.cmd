@echo off
cd /d "%~dp0.."
title Tombcrawl corpus search
node scripts/run.mjs scripts/status.ts
echo.
pause
