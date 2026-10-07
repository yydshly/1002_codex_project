param([ValidateSet(20,30)][int]$Steps = 20)
$ErrorActionPreference = 'Stop'
$tryonProject = Split-Path -Parent $PSScriptRoot
$tryonRuntime = Join-Path $tryonProject '.runtime/tryon'
$tryonPython = Join-Path $tryonRuntime '.venv/Scripts/python.exe'
if (-not (Test-Path -LiteralPath $tryonPython)) { throw 'The isolated try-on Python environment is missing. See notes/real-person-tryon-plan.md.' }
$tryonListener = Get-NetTCPConnection -LocalAddress '127.0.0.1' -LocalPort 4197 -State Listen -ErrorAction SilentlyContinue
if ($tryonListener) { Write-Output 'A local process is already listening on 127.0.0.1:4197. Recheck the page service status.'; return }
$tryonScript = Join-Path $PSScriptRoot 'tryon-service.py'
$tryonCache = Join-Path $tryonRuntime 'hf-cache'
$tryonOut = Join-Path $tryonRuntime 'service.stdout.log'
$tryonErr = Join-Path $tryonRuntime 'service.stderr.log'
$tryonArguments = @('-u', ('"' + $tryonScript + '"'), '--hf-home', ('"' + $tryonCache + '"'), '--steps', $Steps)
$tryonProcess = Start-Process -FilePath $tryonPython -ArgumentList $tryonArguments -WorkingDirectory $tryonProject -WindowStyle Hidden -RedirectStandardOutput $tryonOut -RedirectStandardError $tryonErr -PassThru
$tryonProcess.Id | Set-Content -LiteralPath (Join-Path $tryonRuntime 'service.pid')
Write-Output ('Started local try-on process ' + $tryonProcess.Id + '. The page checks actual dependencies and model files before enabling generation.')
