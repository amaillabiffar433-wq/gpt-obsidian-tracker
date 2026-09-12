@echo off
call "%~dp0env.bat"
if errorlevel 1 exit /b 1
call npm.cmd run admin -- shutdown
