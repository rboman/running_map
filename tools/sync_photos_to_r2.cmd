@echo off
setlocal

cd /d D:\dev\VIBECODING\running_map

echo.
echo ATTENTION : synchronisation reelle des photos vers Cloudflare R2.
echo.
echo Source      : photos
echo Destination : r2-runningmap:runningmap-photos/photos
echo.
echo Cette commande peut SUPPRIMER sur R2 les fichiers qui ne sont plus presents localement.
echo.
choice /M "Continuer"

if errorlevel 2 (
    echo.
    echo Synchronisation annulee.
    exit /b 0
)

echo.
echo Synchronisation en cours...
echo.

rclone sync photos r2-runningmap:runningmap-photos/photos --progress

if errorlevel 1 (
    echo.
    echo ERREUR pendant la synchronisation.
    exit /b 1
)

echo.
echo Synchronisation terminee.