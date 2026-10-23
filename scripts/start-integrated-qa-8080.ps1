# SIGAPRO — QA integrado na porta 8080, sem reset e sem escrita em produção.
$ErrorActionPreference = "Stop"
$root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$expected = [System.IO.Path]::GetFullPath((Join-Path $env:USERPROFILE "Documents\SIGAPRO-HOMOLOGACAO-INTEGRADA-20261023")).TrimEnd("\")
$original = [System.IO.Path]::GetFullPath((Join-Path $env:USERPROFILE "Documents\New project")).TrimEnd("\")
$remoteRef = "qa/sigapro-ia-logo-integrado-20261023"

if ($root.TrimEnd("\") -ine $expected) { throw "Pasta diferente da homologacao SIGAPRO. Nada alterado." }
if (-not (Test-Path (Join-Path $root ".git"))) { throw "Pasta sem Git. Nada alterado." }
$origin = (git -C $root remote get-url origin).Trim()
if ($LASTEXITCODE -ne 0 -or $origin -notmatch "roksparta8724/projetosigapro01(\.git)?$") {
    throw "Repositorio diferente do SIGAPRO. Nada alterado."
}
$localBranch = (git -C $root branch --show-current).Trim()
if ($localBranch -ne "qa-integrado-local-20261023") { throw "Branch de homologacao inesperada: $localBranch" }
$dirty = @(git -C $root status --porcelain)
if ($dirty.Count -gt 0) { throw "Existem alteracoes locais. Nada sera sobrescrito." }

Write-Host "SIGAPRO: atualizando SOMENTE a homologacao..." -ForegroundColor Cyan
git -C $root fetch origin $remoteRef
if ($LASTEXITCODE -ne 0) { throw "Falha no fetch. Servidor anterior preservado." }
git -C $root merge --ff-only "origin/$remoteRef"
if ($LASTEXITCODE -ne 0) { throw "Branch divergente. Servidor anterior preservado." }
$head = (git -C $root rev-parse HEAD).Trim()

$analise = Join-Path $root "src\pages\saas\AnalystDeskPage.tsx"
$vite = Join-Path $root "vite.config.ts"
$launcher = Join-Path $root "scripts\dev-qa.mjs"
if (-not (Test-Path $analise) -or
    -not (Select-String -Path $analise -SimpleMatch 'data-sigapro-ai-access="pilot"' -Quiet) -or
    -not (Select-String -Path $vite -SimpleMatch "SIGAPRO_QA_PUBLIC_BRANDING_READ" -Quiet) -or
    -not (Select-String -Path $launcher -SimpleMatch "SIGAPRO_LOCAL_QA_PORT" -Quiet)) {
    throw "Faltam as mudancas IA/logo no codigo. Servidor preservado."
}

if (-not (Test-Path (Join-Path $root "node_modules\vite\bin\vite.js"))) {
    Push-Location $root
    try {
        npm ci --no-audit --no-fund
        if ($LASTEXITCODE -ne 0) { throw "npm ci falhou." }
    } finally { Pop-Location }
}

Push-Location $root
try {
    node scripts/dev-qa.mjs --check --port=8080 --read-public-logos
    if ($LASTEXITCODE -ne 0) { throw "QA isolado nao validou." }
    npm run quality
    if ($LASTEXITCODE -ne 0) { throw "Testes falharam. Servidor anterior preservado." }
} finally { Pop-Location }

# A porta so e liberada se o processo de origem for Vite SIGAPRO conhecido.
$owners = @(Get-NetTCPConnection -LocalPort 8080 -State Listen -ErrorAction SilentlyContinue |
    ForEach-Object { $_.OwningProcess } | Sort-Object -Unique)
if ($owners.Count -gt 1) { throw "Multiplos servidores na porta 8080. Nada encerrado." }
if ($owners.Count -eq 1) {
    $listenerPid = [int]$owners[0]
    try { $source = Invoke-RestMethod "http://localhost:8080/api/dev-source" -TimeoutSec 5 }
    catch { throw "Servidor 8080 sem diagnostico. Nenhum processo encerrado." }
    if ($source.app -ne "SIGAPRO" -or [int]$source.pid -ne $listenerPid) {
        throw "Servidor na porta 8080 nao reconhecido. Nenhum processo encerrado."
    }
    $serverFolder = [System.IO.Path]::GetFullPath([string]$source.cwd).TrimEnd("\")
    if ($serverFolder -ine $root.TrimEnd("\") -and $serverFolder -ine $original) {
        throw "A porta 8080 pertence a outra pasta: $serverFolder"
    }
    $processInfo = Get-CimInstance Win32_Process -Filter "ProcessId = $listenerPid"
    if (-not $processInfo -or [string]$processInfo.CommandLine -notmatch '(?i)vite') {
        throw "PID da porta 8080 nao identificado como Vite. Nada encerrado."
    }
    Write-Host "Trocando somente o Vite SIGAPRO anterior: PID $listenerPid" -ForegroundColor Yellow
    Stop-Process -Id $listenerPid -Force
    Start-Sleep -Seconds 1
    if (Get-NetTCPConnection -LocalPort 8080 -State Listen -ErrorAction SilentlyContinue) {
        throw "Porta 8080 ainda ocupada. Nova instancia nao iniciada."
    }
}

Write-Host "Iniciando QA isolado SIGAPRO na porta 8080..." -ForegroundColor Cyan
Start-Process -FilePath "cmd.exe" -WorkingDirectory $root -ArgumentList @(
    "/k", "npm run dev:qa -- --port=8080 --read-public-logos"
)

$verified = $false
for ($attempt=0; $attempt -lt 16; $attempt++) {
    Start-Sleep -Seconds 1
    try {
        $live = Invoke-RestMethod "http://localhost:8080/api/dev-source" -TimeoutSec 2
        if ($live.app -ne "SIGAPRO" -or
            [string]$live.neonEnvironment -ne "isolated-qa" -or
            [int]$live.port -ne 8080 -or
            [string]$live.sha -ne $head -or
            ([System.IO.Path]::GetFullPath([string]$live.cwd).TrimEnd("\") -ine $root.TrimEnd("\"))) {
            throw "Codigo, banco ou pasta servida nao corresponde a homologacao."
        }
        $module = Invoke-WebRequest -UseBasicParsing "http://localhost:8080/src/pages/saas/AnalystDeskPage.tsx" -TimeoutSec 5
        if ([string]$module.Content -notlike '*data-sigapro-ai-access*') {
            throw "A pagina Análise servida nao inclui o card IA."
        }
        $verified = $true
        break
    } catch {
        if ($attempt -eq 15) { throw "Servidor nao validado: $($_.Exception.Message)" }
    }
}
if ($verified) {
    Write-Host "SIGAPRO 8080 VERIFICADO" -ForegroundColor Green
    Write-Host "Pasta  : $root"
    Write-Host "Branch : $localBranch"
    Write-Host "Commit : $head"
    Write-Host "Banco  : Neon QA isolado"
    Write-Host "Card IA: confirmado no JavaScript entregue pelo servidor."
    Write-Host "Logo   : somente leitura de imagem publica (dependente do R2)."
    Write-Host "Abra http://localhost:8080/prefeitura/analise"
}
