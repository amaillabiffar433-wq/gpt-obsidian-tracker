@echo off
call "%~dp0env.bat"
if errorlevel 1 exit /b 1
if not exist "dist\collector.js" (
 echo Build required. Run scripts\build.bat first.
 pause
 exit /b 1
)
node dist\collector.js
if errorlevel 1 pause
