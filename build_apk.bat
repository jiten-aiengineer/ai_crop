@echo off
rem Windows local Android builds use the pinned JDK/NDK/CMake toolchain.
rem EAS local builds are not used here because they are not supported natively
rem on Windows and can silently select a different Java version.
call "%~dp0build_apk_offline.bat" %*
