@echo off
echo Starting development server...

echo Setting environment variables...
set NODE_ENV=development
set PORT=5000

echo Checking if dependencies are installed...
if not exist node_modules (
    echo Dependencies not found, running installation...
    call windows-install.bat
)

echo Checking for .env file...
if not exist .env (
    echo Creating .env file from template...
    if exist .env.example (
        copy .env.example .env
        echo Please edit .env file with your configuration values
        echo Generate encryption key with: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
        pause
    )
)

echo Starting server...
npm run dev

if %errorlevel% neq 0 (
    echo NPM run dev failed, trying Windows-specific command...
    npm run dev:win
)

if %errorlevel% neq 0 (
    echo Windows command failed, trying direct tsx...
    npm run dev:direct
)

if %errorlevel% neq 0 (
    echo All npm commands failed, trying manual tsx...
    npx tsx server/index.ts
)

pause