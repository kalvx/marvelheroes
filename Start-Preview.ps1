param([int]$Port = 8765)
$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot
Write-Host "Marvel Heroes Compendium: http://127.0.0.1:$Port/"
python -m http.server $Port --bind 127.0.0.1 --directory dist
