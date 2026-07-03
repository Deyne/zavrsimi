# Zavrsi Mi - Windows setup provera
Write-Host ""
Write-Host "=== Zavrsi Mi - Provera okruzenja ===" -ForegroundColor Cyan
Write-Host ""

$dockerOk = $false
$pgOk = $false

# Docker
try {
    $null = Get-Command docker -ErrorAction Stop
    $compose = docker compose version 2>&1
    if ($LASTEXITCODE -eq 0) {
        $dockerOk = $true
        Write-Host "[OK] Docker: $compose" -ForegroundColor Green
    }
} catch {
    Write-Host "[X] Docker nije instaliran" -ForegroundColor Red
}

# PostgreSQL (lokalno)
$pgPaths = @(
    "C:\Program Files\PostgreSQL\16\bin\psql.exe",
    "C:\Program Files\PostgreSQL\15\bin\psql.exe",
    "C:\Program Files\PostgreSQL\14\bin\psql.exe"
)
$psql = $pgPaths | Where-Object { Test-Path $_ } | Select-Object -First 1
if ($psql) {
    $pgOk = $true
    Write-Host "[OK] PostgreSQL pronadjen: $psql" -ForegroundColor Green
} else {
    try {
        $null = Get-Command psql -ErrorAction Stop
        $pgOk = $true
        Write-Host "[OK] PostgreSQL (psql u PATH)" -ForegroundColor Green
    } catch {
        Write-Host "[X] PostgreSQL nije instaliran" -ForegroundColor Red
    }
}

Write-Host ""

if ($dockerOk) {
    Write-Host "Preporuceno: pokreni bazu preko Docker-a:" -ForegroundColor Yellow
    Write-Host "  npm run docker:up" -ForegroundColor White
    Write-Host "  npm run dev" -ForegroundColor White
} elseif ($pgOk) {
    Write-Host "PostgreSQL je instaliran. Kreiraj bazu rucno:" -ForegroundColor Yellow
    Write-Host "  1. Otvori pgAdmin ili psql" -ForegroundColor White
    Write-Host "  2. Kreiraj korisnika 'zavrsi' / lozinka 'zavrsi_secret'" -ForegroundColor White
    Write-Host "  3. Kreiraj bazu 'zavrsi_mi'" -ForegroundColor White
    Write-Host "  4. Pokreni migraciju:" -ForegroundColor White
    Write-Host "     psql -U zavrsi -d zavrsi_mi -f server/migrations/001_initial_schema.sql" -ForegroundColor Gray
    Write-Host "  5. npm run dev" -ForegroundColor White
    Write-Host ""
    Write-Host "Redis nije obavezan - server radi i bez njega (bez keša)." -ForegroundColor DarkGray
} else {
    Write-Host "Nijedan nacin za bazu nije dostupan. Izaberi jednu opciju:" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "OPCIJA A (preporuceno) - Docker Desktop:" -ForegroundColor Cyan
    Write-Host "  1. Preuzmi: https://www.docker.com/products/docker-desktop/" -ForegroundColor White
    Write-Host "  2. Instaliraj i restartuj racunar" -ForegroundColor White
    Write-Host "  3. Pokreni Docker Desktop" -ForegroundColor White
    Write-Host "  4. npm run docker:up" -ForegroundColor White
    Write-Host "  5. npm run dev" -ForegroundColor White
    Write-Host ""
    Write-Host "OPCIJA B - PostgreSQL bez Docker-a:" -ForegroundColor Cyan
    Write-Host "  1. Preuzmi: https://www.postgresql.org/download/windows/" -ForegroundColor White
    Write-Host "  2. Instaliraj PostgreSQL 16" -ForegroundColor White
    Write-Host "  3. U .env podesi DATABASE_URL sa tvojim podacima" -ForegroundColor White
    Write-Host "  4. Pokreni server/migrations/001_initial_schema.sql u pgAdmin" -ForegroundColor White
    Write-Host "  5. npm run dev" -ForegroundColor White
}

Write-Host ""
Write-Host "Frontend: http://localhost:5173" -ForegroundColor Green
Write-Host "Backend:  http://localhost:3001" -ForegroundColor Green
Write-Host ""
