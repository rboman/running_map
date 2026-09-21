@echo off
setlocal
cd /d "%~dp0.." || exit /b 1
set "PHOTO_PYTHON=python"
if exist ".venv\Scripts\python.exe" set "PHOTO_PYTHON=.venv\Scripts\python.exe"

rem Compatibility wrapper: copy referenced images only; never delete remote files.
"%PHOTO_PYTHON%" scripts\manage_photos.py copy --dry-run
if errorlevel 1 exit /b 1
echo Simulation complete. No remote changes.
