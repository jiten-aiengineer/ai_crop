@echo off
setlocal

set "CLSL_ROOT=%~dp0"
set "JAVA_HOME=%CLSL_ROOT%.toolchains\temurin-17"
set "ANDROID_HOME=%LOCALAPPDATA%\Android\Sdk"
set "ANDROID_SDK_ROOT=%ANDROID_HOME%"
set "GRADLE_USER_HOME=%LOCALAPPDATA%\CLSL\gradle"
set "PATH=%JAVA_HOME%\bin;%ANDROID_HOME%\platform-tools;%PATH%"
set "STUDIO_EXE=C:\Program Files\Android\Android Studio\bin\studio64.exe"

if not exist "%JAVA_HOME%\bin\java.exe" (
    echo ERROR: Pinned Java 17 was not found at:
    echo %JAVA_HOME%
    pause
    exit /b 1
)

if not exist "%STUDIO_EXE%" (
    echo ERROR: Android Studio was not found at:
    echo %STUDIO_EXE%
    pause
    exit /b 1
)

if exist R:\nul (
    echo ERROR: Drive R: is already in use. Close that drive mapping and retry.
    pause
    exit /b 1
)

if not exist "%GRADLE_USER_HOME%" mkdir "%GRADLE_USER_HOME%" >nul 2>&1

subst R: "%CLSL_ROOT:~0,-1%"
if errorlevel 1 (
    echo ERROR: Could not create the short Android build path R:.
    pause
    exit /b 1
)

echo Clearing generated CMake caches from earlier long-path builds...
for %%D in (
    "R:\mobile\android\.cxx"
    "R:\mobile\android\app\.cxx"
    "R:\mobile\node_modules\react-native-worklets\android\.cxx"
    "R:\mobile\node_modules\react-native-reanimated\android\.cxx"
    "R:\mobile\node_modules\react-native-screens\android\.cxx"
) do (
    if exist "%%~D" rmdir /s /q "%%~D"
)

echo Opening Android Studio with Java 17 and the short native-build path...
start "CLSL AI Android Studio" /wait "%STUDIO_EXE%" "R:\mobile\android"

subst R: /d >nul 2>&1
exit /b 0
