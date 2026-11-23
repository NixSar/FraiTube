@echo off
rem Builds FraiTube and opens it. Double-click to start.
pushd "%~dp0"
call pnpm start
if errorlevel 1 pause
popd
