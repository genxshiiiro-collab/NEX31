@echo off
title Nex31 - Deploiement des commandes
cd /d "%~dp0"
color 0b

echo ============================================
echo   NEX31 - ENREGISTREMENT DES COMMANDES /
echo ============================================
echo.
echo A lancer une fois au debut, puis a chaque fois
echo que tu ajoutes ou modifies une commande slash.
echo.

where node >nul 2>nul
if errorlevel 1 ( color 0c & echo [ERREUR] Node.js n'est pas installe. & pause & exit /b 1 )

if not exist "node_modules" ( echo Installation des dependances... & call npm install --no-audit --no-fund & echo. )

node src/deploy-commands.js

echo.
pause
