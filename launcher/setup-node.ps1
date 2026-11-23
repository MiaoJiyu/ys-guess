$ErrorActionPreference = 'Stop'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$root = Split-Path -Parent $PSScriptRoot
$runtime = Join-Path $root '.runtime'
$version = 'v22.11.0'
$arch = if ($env:PROCESSOR_ARCHITECTURE -eq 'ARM64') { 'win-arm64' } else { 'win-x64' }
$folder = "node-$version-$arch"
$archive = Join-Path $runtime 'node.zip'

New-Item -ItemType Directory -Force -Path $runtime | Out-Null
Write-Host "正在下载 Node.js $version ($arch)..."
Write-Host '首次启动需要联网下载约 30MB，请稍候。'
$url = "https://nodejs.org/dist/$version/$folder.zip"
Invoke-WebRequest -Uri $url -OutFile $archive -UseBasicParsing
Write-Host '下载完成，正在解压...'
Expand-Archive -LiteralPath $archive -DestinationPath $runtime -Force
$nodeExe = Get-ChildItem -LiteralPath (Join-Path $runtime $folder) -Filter node.exe -Recurse | Select-Object -First 1
if (-not $nodeExe) { throw '未找到 node.exe，下载包可能不完整。' }
Copy-Item -LiteralPath $nodeExe.FullName -Destination (Join-Path $runtime 'node.exe') -Force
Remove-Item -LiteralPath $archive -Force -ErrorAction SilentlyContinue
Write-Host '便携 Node.js 准备完成。'
