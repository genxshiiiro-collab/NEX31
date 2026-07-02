@echo off
title Nex31 - Bot Discord
cd /d "%~dp0"
color 0a

echo ============================================
echo        NEX31 - BOT DISCORD - DEMARRAGE
echo ============================================
echo.

where node >nul 2>nul
if errorlevel 1 ( color 0c & echo [ERREUR] Node.js n'est pas installe. Telecharge-le sur https://nodejs.org & echo. & pause & exit /b 1 )

if not exist ".env" ( color 0c & echo [ERREUR] Fichier .env manquant. Copie .env.example en .env puis remplis-le. & echo. & pause & exit /b 1 )

if not exist "node_modules" ( echo Premiere utilisation : installation des dependances... & call npm install --no-audit --no-fund & echo. )

echo Demarrage du bot... (ferme cette fenetre pour arreter le bot)
echo.
node src/index.js

echo.
color 0c
echo Le bot s'est arrete.
pause
