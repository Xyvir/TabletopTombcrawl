@echo off
rem One frame of the corpus status board, then the window stays put:
rem   cmd /c start "" scripts\status.cmd
rem The live board is scripts\watch-corpus.cmd.
cd /d "%~dp0.."
node scripts/status.ts
echo.
pause
