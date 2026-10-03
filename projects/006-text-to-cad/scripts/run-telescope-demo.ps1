param([switch]$SkipSnapshots)
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$savedEnvironment = @{}
foreach ($name in @('OPENBLAS_NUM_THREADS','OMP_NUM_THREADS','MKL_NUM_THREADS','CADGEN_CACHE_DIR')) {
    $savedEnvironment[$name] = [Environment]::GetEnvironmentVariable($name,'Process')
}
Push-Location -LiteralPath $projectRoot
$records = [System.Collections.Generic.List[object]]::new()
try {
    $env:OPENBLAS_NUM_THREADS='1'
    $env:OMP_NUM_THREADS='1'
    $env:MKL_NUM_THREADS='1'
    $env:CADGEN_CACHE_DIR=Join-Path $projectRoot '.cache/cadgen'
    New-Item -ItemType Directory -Path tmp -Force | Out-Null
    foreach ($modelName in @('telescope_assembly','telescope_extended','telescope_exploded')) {
        $started = Get-Date
        $logPath = "tmp/$modelName-build.log"
        uv run --frozen python "src/$modelName.py" *> $logPath
        $exitCode = $LASTEXITCODE
        $records.Add(@{stage='build';responsible='cadgen / build123d / OpenCascade';command="uv run --frozen python src/$modelName.py";started_at=$started.ToString('o');elapsed_seconds=[Math]::Round(((Get-Date)-$started).TotalSeconds,3);exit_code=$exitCode;log_tail=@(Get-Content -LiteralPath $logPath -Tail 8)})
        if ($exitCode -ne 0) { Get-Content -LiteralPath $logPath -Tail 20; throw "Model failed: $modelName" }
        Write-Output "Generated $modelName"
    }
    uv run --frozen python checks/verify_telescope.py
    $records.Add(@{stage='validate';responsible='Agent-authored independent check / CAD geometry queries';command='uv run --frozen python checks/verify_telescope.py';exit_code=$LASTEXITCODE})
    if ($LASTEXITCODE -ne 0) { throw 'Saved telescope geometry checks failed.' }
    if (-not $SkipSnapshots) {
        foreach ($name in @('telescope_tube','telescope_objective','telescope_focuser','telescope_focus_unit','telescope_cradle','telescope_mount','telescope_assembly','telescope_extended','telescope_exploded')) {
            uv run --frozen cadgen step snapshot "STEP/$name.step" "assets/$name.png" --width 1200 --height 900
            if ($LASTEXITCODE -ne 0) { throw "Snapshot failed: $name" }
        }
        foreach ($poseName in @('focused','observing')) {
            uv run --frozen cadgen step snapshot STEP/telescope_assembly.step "assets/telescope_pose_$poseName.png" --kinematics $poseName --width 1200 --height 900
            if ($LASTEXITCODE -ne 0) { throw "Pose snapshot failed: $poseName" }
        }
        $records.Add(@{stage='snapshot';responsible='cadgen snapshot renderer';model_snapshots=9;pose_snapshots=2;exit_code=0;visual_review='Separate human/agent image inspection required'})
    }
} finally {
    @{created_at=(Get-Date).ToString('o');records=@($records.ToArray())} | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath notes/telescope-build-log.json -Encoding utf8
    foreach ($name in $savedEnvironment.Keys) { [Environment]::SetEnvironmentVariable($name,$savedEnvironment[$name],'Process') }
    Pop-Location
}
