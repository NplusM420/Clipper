@echo off
echo Cleaning up Windows npm installation issues...

echo Stopping any running Node processes...
taskkill /f /im node.exe >nul 2>&1
taskkill /f /im npm.exe >nul 2>&1

echo Removing node_modules with Windows-specific commands...
if exist node_modules (
    echo Removing node_modules directory...
    rmdir /s /q node_modules
)

echo Removing package-lock.json...
if exist package-lock.json (
    del /f /q package-lock.json
)

echo Clearing npm cache...
npm cache clean --force

echo Cleanup complete! Ready for fresh installation.
pause