@echo off
rem Copies FraiTube into Ubuntu under WSL 2, builds it there and opens it. Double-click to start.
pushd "%~dp0"
call pnpm start:linux
if errorlevel 1 pause
popd
