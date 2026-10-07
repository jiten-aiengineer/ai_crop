$ErrorActionPreference = 'Stop'

$javaHome = Join-Path $PSScriptRoot '.toolchains\temurin-17'
$androidHome = Join-Path $env:LOCALAPPDATA 'Android\Sdk'
$gradleHome = Join-Path $env:LOCALAPPDATA 'CLSL\gradle'

$requiredFiles = @(
    (Join-Path $javaHome 'bin\java.exe'),
    (Join-Path $androidHome 'platform-tools\adb.exe'),
    (Join-Path $androidHome 'ndk\27.1.12297006\source.properties'),
    (Join-Path $androidHome 'cmake\3.22.1\bin\cmake.exe')
)

foreach ($requiredFile in $requiredFiles) {
    if (-not (Test-Path -LiteralPath $requiredFile)) {
        throw "Required Android build tool was not found: $requiredFile"
    }
}

[Environment]::SetEnvironmentVariable('JAVA_HOME', $javaHome, 'User')
[Environment]::SetEnvironmentVariable('ANDROID_HOME', $androidHome, 'User')
[Environment]::SetEnvironmentVariable('ANDROID_SDK_ROOT', $androidHome, 'User')
[Environment]::SetEnvironmentVariable('GRADLE_USER_HOME', $gradleHome, 'User')

$requiredPathEntries = @(
    (Join-Path $javaHome 'bin'),
    (Join-Path $androidHome 'platform-tools'),
    (Join-Path $androidHome 'emulator'),
    (Join-Path $androidHome 'cmdline-tools\latest\bin')
)

$userPath = [Environment]::GetEnvironmentVariable('Path', 'User')
$pathEntries = @($userPath -split ';' | Where-Object { $_ -and $_.Trim() })
foreach ($requiredEntry in $requiredPathEntries) {
    if (-not ($pathEntries | Where-Object { $_.TrimEnd('\') -ieq $requiredEntry.TrimEnd('\') })) {
        $pathEntries += $requiredEntry
    }
}
[Environment]::SetEnvironmentVariable('Path', ($pathEntries -join ';'), 'User')

$env:JAVA_HOME = $javaHome
$env:ANDROID_HOME = $androidHome
$env:ANDROID_SDK_ROOT = $androidHome
$env:GRADLE_USER_HOME = $gradleHome
$env:Path = (($requiredPathEntries + @($env:Path)) -join ';')

New-Item -ItemType Directory -Force -Path $gradleHome | Out-Null

Write-Host 'Android build environment configured successfully.' -ForegroundColor Green
Write-Host "JAVA_HOME=$javaHome"
Write-Host "ANDROID_HOME=$androidHome"
Write-Host "GRADLE_USER_HOME=$gradleHome"
Write-Host 'NDK=27.1.12297006'
Write-Host 'CMake=3.22.1'
Write-Host ''
& (Join-Path $javaHome 'bin\java.exe') -version
Write-Host ''
Write-Host 'Close and reopen PowerShell and Android Studio before building the APK.' -ForegroundColor Yellow
