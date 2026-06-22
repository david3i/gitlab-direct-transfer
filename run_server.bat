@echo off
setlocal

set "BASE=%~dp0"
set "HOST=127.0.0.1"
set "PORT=5000"
set "URL=http://%HOST%:%PORT%"
set "EXE=%BASE%GitLab-Transfer-Server.exe"

echo ============================================
echo  GitLab Transfer Tool - Server + Frontend
echo ============================================
echo.

if not exist "%EXE%" (
    echo ERROR: GitLab-Transfer-Server.exe not found.
    echo Expected location: %EXE%
    pause
    exit /b 1
)

echo [start] %EXE%
start "" "%EXE%" --host %HOST% --port %PORT%

echo.
echo Server starting... opening browser in 2 seconds.
echo   URL: %URL%
echo.
echo Close the server window to stop.
echo ============================================
timeout /t 2 /nobreak >nul
start "" "%URL%"
pause
