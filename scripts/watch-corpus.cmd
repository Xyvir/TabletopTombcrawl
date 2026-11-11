@echo off
cd /d "%~dp0.."
title Tombcrawl corpus search
mode con: cols=88 lines=28 >/dev/null 2>/dev/null
node scripts/run.mjs scripts/status.ts
echo.
pause
