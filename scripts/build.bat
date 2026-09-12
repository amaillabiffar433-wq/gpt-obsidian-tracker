@echo off
call "%~dp0env.bat"
if errorlevel 1 exit /b 1
if not exist "node_modules" call npm.cmd ci
if errorlevel 1 exit /b 1
call npm.cmd run build
if errorlevel 1 pause
