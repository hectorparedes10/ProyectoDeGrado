@echo off
chcp 65001 >nul
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo No se encontro Node.js. Instala Node.js en esta computadora para iniciar ARENA.
  pause
  exit /b 1
)
node "%~dp0scripts\iniciar-local.cjs"
if errorlevel 1 pause
