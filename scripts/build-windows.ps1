$ErrorActionPreference = 'Stop'
Set-Location (Split-Path -Parent $PSScriptRoot)
npm ci
npm run test
npm run dist:win
Get-ChildItem .\release\*.exe | Select-Object Name, Length, LastWriteTime
