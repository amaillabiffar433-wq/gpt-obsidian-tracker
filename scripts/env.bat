@echo off
for %%I in ("%~dp0..") do set "TRACKER_ROOT=%%~fI"
if /I not "%TRACKER_ROOT:~0,2%"=="D:" (
 echo ERROR: Project must be on D drive.
 exit /b 1
)
cd /d "%TRACKER_ROOT%"
set "TEMP=%TRACKER_ROOT%\.cache\tmp"
set "TMP=%TEMP%"
set "npm_config_cache=%TRACKER_ROOT%\.cache\npm"
set "PLAYWRIGHT_BROWSERS_PATH=%TRACKER_ROOT%\.cache\browsers"
set "PATH=D:\Node.js;%PATH%"
if not exist "%TEMP%" mkdir "%TEMP%"
exit /b 0
