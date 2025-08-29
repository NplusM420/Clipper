@echo off
echo Installing dependencies with Windows optimizations...

echo Setting npm configurations for Windows...
npm config set fund false
npm config set audit false
npm config set prefer-offline true
npm config set cache-min 3600

echo Installing with Windows-friendly options...
npm install --no-optional --no-fund --no-audit --legacy-peer-deps --prefer-offline

if %errorlevel% neq 0 (
    echo Installation failed, trying alternative method...
    echo Attempting install with --force flag...
    npm install --force --no-optional --legacy-peer-deps
)

if %errorlevel% neq 0 (
    echo NPM failed, trying with Yarn...
    echo Installing Yarn globally...
    npm install -g yarn
    echo Installing dependencies with Yarn...
    yarn install --ignore-optional --ignore-engines
)

echo Installation complete!
pause