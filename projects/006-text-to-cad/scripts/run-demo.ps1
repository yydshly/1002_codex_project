param([switch]$OpenViewer)
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$previousEnvironment = @{}
foreach ($name in @('UV_HTTP_TIMEOUT', 'UV_CONCURRENT_DOWNLOADS', 'CADGEN_CACHE_DIR', 'OPENBLAS_NUM_THREADS', 'OMP_NUM_THREADS', 'MKL_NUM_THREADS')) {
    $previousEnvironment[$name] = [Environment]::GetEnvironmentVariable($name, 'Process')
}
Push-Location -LiteralPath $projectRoot
try {
    $env:UV_HTTP_TIMEOUT = '180'
    $env:UV_CONCURRENT_DOWNLOADS = '2'
    $env:CADGEN_CACHE_DIR = Join-Path $projectRoot '.cache/cadgen'
    $env:OPENBLAS_NUM_THREADS = '1'
    $env:OMP_NUM_THREADS = '1'
    $env:MKL_NUM_THREADS = '1'
    foreach ($modelName in @('mounting_plate', 'mounting_plate_wide', 'plate_assembly', 'enclosure_base', 'enclosure_lid', 'enclosure_assembly')) {
        uv run --frozen python "src/$modelName.py"
        if ($LASTEXITCODE -ne 0) { throw "Model failed: $modelName" }
    }
    uv run --frozen python checks/verify_models.py
    if ($LASTEXITCODE -ne 0) { throw 'Plate geometry checks failed.' }
    uv run --frozen python checks/verify_enclosure.py
    if ($LASTEXITCODE -ne 0) { throw 'Enclosure geometry checks failed.' }
    uv run --frozen python scripts/drawing_demo.py
    if ($LASTEXITCODE -ne 0) { throw 'Engineering drawing failed.' }
    foreach ($modelName in @('mounting_plate', 'mounting_plate_wide', 'plate_assembly', 'enclosure_base', 'enclosure_lid', 'enclosure_assembly')) {
        uv run --frozen cadgen step snapshot "STEP/$modelName.step" "assets/$modelName.png" --width 1200 --height 900
        if ($LASTEXITCODE -ne 0) { throw "Snapshot failed: $modelName" }
    }
    if ($OpenViewer) {
        uv run --frozen cadgen viewer --host 127.0.0.1 --json --detach
        if ($LASTEXITCODE -ne 0) { throw 'Viewer failed.' }
    }
} finally {
    foreach ($name in $previousEnvironment.Keys) {
        [Environment]::SetEnvironmentVariable($name, $previousEnvironment[$name], 'Process')
    }
    Pop-Location
}
