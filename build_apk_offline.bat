@echo off
setlocal enabledelayedexpansion

echo ========================================================
echo   Starting Android APK build process [Offline]
echo   (Using Virtual Drive to bypass Windows Path Limits)
echo ========================================================
echo.

:: Hardcode JAVA_HOME and ANDROID_HOME so it works even without restarting the terminal
set JAVA_HOME=C:\Program Files\Android\Android Studio\jbr
set ANDROID_HOME=C:\Users\Asus\AppData\Local\Android\Sdk
set PATH=%JAVA_HOME%\bin;%ANDROID_HOME%\platform-tools;%PATH%

:: Step 1: Create a temporary virtual drive (X:) to avoid long path issues in C++ compilation
set PROJ_DIR=%CD%
set DRIVE_LETTER=X:

:: If X: is already mapped, delete it first just in case
subst %DRIVE_LETTER% /D >nul 2>&1
echo Mapping %DRIVE_LETTER% to %PROJ_DIR%
subst %DRIVE_LETTER% "%PROJ_DIR%"

:: Step 2: Switch to the short path
%DRIVE_LETTER%
cd \mobile

:: Ensure the android folder exists
if not exist "android\" (
    echo Generating Android project files
    call npx expo prebuild --platform android
    if errorlevel 1 (
        echo Failed to generate Android project.
        c:
        subst %DRIVE_LETTER% /D
        pause
        exit /b 1
    )
)

cd android

:: Determine build type default is release
set BUILD_TYPE=%1
if "%BUILD_TYPE%"=="" set BUILD_TYPE=release

if "%BUILD_TYPE%"=="release" (
    echo Building Release APK
    call .\gradlew assembleRelease
    
    if exist "app\build\outputs\apk\release\app-release.apk" (
        set APK_PATH=app\build\outputs\apk\release\app-release.apk
    ) else if exist "app\build\outputs\apk\release\app-universal-release.apk" (
        set APK_PATH=app\build\outputs\apk\release\app-universal-release.apk
    ) else (
        set APK_PATH=Unknown Release APK Path
    )
) else (
    echo Building Debug APK
    call .\gradlew assembleDebug
    
    if exist "app\build\outputs\apk\debug\app-debug.apk" (
        set APK_PATH=app\build\outputs\apk\debug\app-debug.apk
    ) else if exist "app\build\outputs\apk\debug\app-universal-debug.apk" (
        set APK_PATH=app\build\outputs\apk\debug\app-universal-debug.apk
    ) else (
        set APK_PATH=Unknown Debug APK Path
    )
)

:: Step 3: Switch back to original drive and clean up
C:
cd "%PROJ_DIR%"
subst %DRIVE_LETTER% /D

echo.
echo =========================================
echo Build complete
echo Your APK should be located at:
echo mobile\android\!APK_PATH!
echo =========================================
pause
