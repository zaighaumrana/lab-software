# ============================================================
# LMS - First-time local setup script (Windows)
# Run from inside the lms folder:  .\setup.ps1
# ============================================================

$ErrorActionPreference = "Stop"

Write-Host "`n=== Laboratory Management System - First-Time Setup ===" -ForegroundColor Cyan

# 1. Check Node.js
Write-Host "`n[1/7] Checking Node.js..." -ForegroundColor Yellow
try {
    $nodeVersion = node -v
    Write-Host "  Node.js found: $nodeVersion" -ForegroundColor Green
    $parsedNodeVersion = [version]($nodeVersion -replace '^v', '')
    if ($parsedNodeVersion -lt [version]'24.15.0') {
        Write-Host "  ERROR: Node.js 24.15+ is required. You have $nodeVersion" -ForegroundColor Red
        exit 1
    }
} catch {
    Write-Host "  ERROR: Node.js is not installed or not in PATH." -ForegroundColor Red
    Write-Host "  Download from https://nodejs.org (use Node.js 24 LTS, version 24.15 or higher)" -ForegroundColor Red
    exit 1
}

# 2. Check / install pnpm
Write-Host "`n[2/7] Checking pnpm..." -ForegroundColor Yellow
try {
    $pnpmVersion = pnpm -v
    Write-Host "  pnpm found: $pnpmVersion" -ForegroundColor Green
} catch {
    Write-Host "  pnpm not found. Installing globally..." -ForegroundColor Yellow
    npm install -g pnpm
    Write-Host "  pnpm installed." -ForegroundColor Green
}

# 3. Install all dependencies
Write-Host "`n[3/7] Installing dependencies (this may take a few minutes)..." -ForegroundColor Yellow
pnpm install
if ($LASTEXITCODE -ne 0) {
    Write-Host "  ERROR: pnpm install failed." -ForegroundColor Red
    exit 1
}
Write-Host "  Dependencies installed." -ForegroundColor Green

# 4. Create .env if it does not exist
Write-Host "`n[4/7] Checking database .env file..." -ForegroundColor Yellow
$envPath = "packages\database\.env"
$envExample = "packages\database\.env.example"

if (-not (Test-Path $envPath)) {
    if (Test-Path $envExample) {
        Copy-Item $envExample $envPath
        Write-Host "  Created packages\database\.env from .env.example" -ForegroundColor Green
        Write-Host "  IMPORTANT: Edit this file and set your real DATABASE_URL" -ForegroundColor Yellow
        Write-Host "  Example: DATABASE_URL=`"postgresql://postgres:YOUR_PASSWORD@localhost:5432/lms?schema=public`"" -ForegroundColor Yellow
    } else {
        Write-Host "  WARNING: .env.example not found. Create packages\database\.env manually." -ForegroundColor Yellow
    }
} else {
    Write-Host "  .env already exists." -ForegroundColor Green
}

# 5. Generate Prisma client
# The pinned package-local Prisma 7 CLI discovers packages/database/prisma7.config.ts.
Write-Host "`n[5/7] Generating Prisma client..." -ForegroundColor Yellow
pnpm db:generate
if ($LASTEXITCODE -ne 0) {
    Write-Host "  WARNING: prisma generate failed. Check the error above." -ForegroundColor Yellow
} else {
    Write-Host "  Prisma client generated." -ForegroundColor Green
}

# 6. Run migrations (creates tables)
Write-Host "`n[6/7] Running database migrations..." -ForegroundColor Yellow
Write-Host "  (Requires PostgreSQL running and DATABASE_URL set correctly)" -ForegroundColor Yellow
pnpm --filter @lms/database migrate:deploy
if ($LASTEXITCODE -ne 0) {
    Write-Host "  WARNING: migration failed. Fix DATABASE_URL / PostgreSQL and re-run: pnpm --filter @lms/database migrate:deploy" -ForegroundColor Yellow
} else {
    Write-Host "  Migrations applied." -ForegroundColor Green
}

# 7. Seed
Write-Host "`n[7/7] Seeding default data..." -ForegroundColor Yellow
pnpm db:seed
if ($LASTEXITCODE -ne 0) {
    Write-Host "  WARNING: seed failed. You can re-run later with: pnpm db:seed" -ForegroundColor Yellow
} else {
    Write-Host "  Seed complete." -ForegroundColor Green
}

Write-Host "`n=== Setup finished ===" -ForegroundColor Green
Write-Host @"

Default logins:
  admin    / admin123   (Admin role)
  operator / admin123   (Lab Operator role)

Default IDs (for headers during early testing):
  x-tenant-id: default-tenant
  x-branch-id: default-branch

Start the API:
  pnpm dev:api

API will be at http://localhost:3000

Test login:
  curl -X POST http://localhost:3000/auth/login -H "Content-Type: application/json" -d "{\"username\":\"admin\",\"password\":\"admin123\"}"

"@ -ForegroundColor Cyan

Write-Host "Done." -ForegroundColor Green
