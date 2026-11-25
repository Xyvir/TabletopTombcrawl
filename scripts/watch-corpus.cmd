@echo off
rem The live corpus status board, in its own console window:
rem   cmd /c start "" scripts\watch-corpus.cmd
rem One frame instead? scripts\status.cmd
chcp 65001 >nul
cd /d "%~dp0.."
title Tombcrawl corpus search
powershell -NoProfile -NoExit -File "%~dp0watch-corpus.ps1"
