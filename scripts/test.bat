@echo off
call "%~dp0env.bat"
if errorlevel 1 exit /b 1
call npm.cmd test
if errorlevel 1 exit /b 1
call npm.cmd run lint
if errorlevel 1 exit /b 1
call npm.cmd run build
if errorlevel 1 exit /b 1
echo All checks passed.
pause
