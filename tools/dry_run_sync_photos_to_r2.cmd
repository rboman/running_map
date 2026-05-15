@echo off
setlocal

cd /d D:\dev\VIBECODING\running_map

echo.
echo Simulation de synchronisation des photos vers Cloudflare R2
echo Source      : photos
echo Destination : r2-runningmap:runningmap-photos/photos
echo.
echo Aucune modification ne sera effectuee.
echo.

rclone sync photos r2-runningmap:runningmap-photos/photos --dry-run --progress

if errorlevel 1 (
    echo.
    echo ERREUR pendant la simulation.
    exit /b 1
)

echo.
echo Simulation terminee.
echo Verifie bien la liste des fichiers a copier/modifier/supprimer avant de lancer le vrai sync.