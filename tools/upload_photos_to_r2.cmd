@echo off
setlocal

cd /d "%~dp0.." || exit /b 1

echo Upload des photos vers Cloudflare R2...
rclone copy photos r2-runningmap:runningmap-photos/photos --progress

if errorlevel 1 (
    echo.
    echo ERREUR pendant l'upload.
    exit /b 1
)

echo.
echo Upload termine.
