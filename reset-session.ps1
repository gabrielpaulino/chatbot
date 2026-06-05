# Encerra instâncias do bot e do Chrome ligadas à sessão wwebjs
Get-Process node -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 1

Get-CimInstance Win32_Process -Filter "Name='chrome.exe'" |
  Where-Object { $_.CommandLine -and $_.CommandLine.Contains("wwebjs_auth") } |
  ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }

Start-Sleep -Seconds 2

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
Remove-Item -Recurse -Force (Join-Path $root ".wwebjs_auth") -ErrorAction SilentlyContinue
Remove-Item -Recurse -Force (Join-Path $root ".wwebjs_cache") -ErrorAction SilentlyContinue

Write-Host "Sessao limpa. Rode: node chatbot.js"
