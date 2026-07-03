@echo off
title Nex31 - Push GitHub
cd /d "%~dp0"
color 0b

echo ============================================
echo   NEX31 - PUSH VERS GITHUB
echo ============================================
echo.
echo 1. Enregistre tes modifs sur GitHub (push)
echo 2. Puis RESTART le serveur YorkHost
echo.

where git >nul 2>nul
if errorlevel 1 ( color 0c & echo [ERREUR] Git n'est pas installe. & pause & exit /b 1 )

git status -sb
echo.

set /p MSG=Message du commit (Entree = "Mise a jour bot"): 
if "%MSG%"=="" set MSG=Mise a jour bot

git add -A
git diff --cached --quiet
if not errorlevel 1 (
  echo.
  echo Aucun changement a pousser.
  pause
  exit /b 0
)

git commit -m "%MSG%"
if errorlevel 1 (
  color 0c
  echo [ERREUR] Commit impossible.
  pause
  exit /b 1
)

echo.
echo Push vers origin/main...
git push origin main
if errorlevel 1 (
  color 0c
  echo.
  echo [ERREUR] Push echoue. Verifie ton login GitHub / token.
  pause
  exit /b 1
)

color 0a
echo.
echo OK - Push reussi. Va sur YorkHost et clique RESTART.
echo.
pause
