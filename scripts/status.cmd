@echo off
rem The corpus status board, in its own console window. Launch with:
rem   cmd /c start "" scripts\status.cmd
cd /d "%~dp0.."
node scripts/run.mjs scripts/status.ts
