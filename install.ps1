$Repo = "realozk/ARKENAR"
$ToolName = "arkenar"
$InstallDir = "$env:USERPROFILE\.arkenar"
$BinDir = "$InstallDir\bin"
$ZipPath = "$env:TEMP\arkenar.zip"

$LatestReleaseUrl = "https://github.com/$Repo/releases/latest/download/arkenar-windows-amd64.zip"

Write-Host " Installing $ToolName..." -ForegroundColor Cyan

if (Test-Path "$BinDir\Arkenar\arkenar.exe") {
    Write-Host "Fixing nested folder structure..." -ForegroundColor Yellow
    Move-Item -Path "$BinDir\Arkenar\*" -Destination $BinDir -Force
    Remove-Item -Path "$BinDir\Arkenar" -Recurse -Force
}

Write-Host "Downloading latest release from $Repo..."
try {
    Invoke-WebRequest -Uri $LatestReleaseUrl -OutFile $ZipPath
} catch {
    Write-Error "Failed to download. The release asset '$LatestReleaseUrl' was not found (404)."
    exit
}

Write-Host "Extracting files..."
Expand-Archive -Path $ZipPath -DestinationPath $BinDir -Force
Remove-Item $ZipPath

$UserPath = [Environment]::GetEnvironmentVariable("Path", "User")
if ($UserPath -notlike "*$BinDir*") {
    [Environment]::SetEnvironmentVariable("Path", "$UserPath;$BinDir", "User")
    Write-Host " Added $ToolName to User PATH." -ForegroundColor Green
} else {
    Write-Host " $ToolName is already in PATH." -ForegroundColor Yellow
}

Write-Host " Installation Complete! Restart your terminal and type '$ToolName'." -ForegroundColor Green