@echo off
chcp 65001 >nul
echo =====================================================================
echo  [중앙 통제국 감정관리처] Chrome 키오스크 모드 실행
echo =====================================================================
echo.
echo * 대상 주소: http://localhost:8080
echo * 키오스크 종료 방법: Alt + F4 또는 키보드 Ctrl + W
echo.

set CHROME_PATH=""
if exist "C:\Program Files\Google\Chrome\Application\chrome.exe" (
    set CHROME_PATH="C:\Program Files\Google\Chrome\Application\chrome.exe"
) else if exist "C:\Program Files (x86)\Google\Chrome\Application\chrome.exe" (
    set CHROME_PATH="C:\Program Files (x86)\Google\Chrome\Application\chrome.exe"
) else if exist "%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe" (
    set CHROME_PATH="%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe"
) else (
    set CHROME_PATH="chrome.exe"
)

%CHROME_PATH% --kiosk --disable-pinch --overscroll-history-navigation=0 http://localhost:8080
