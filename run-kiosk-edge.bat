@echo off
chcp 65001 >nul
echo =====================================================================
echo  [중앙 통제국 감정관리처] Microsoft Edge 키오스크 모드 실행
echo =====================================================================
echo.
echo * 대상 주소: http://localhost:8080
echo * 키오스크 종료 방법: Alt + F4
echo.

set EDGE_PATH=""
if exist "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe" (
    set EDGE_PATH="C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
) else if exist "C:\Program Files\Microsoft\Edge\Application\msedge.exe" (
    set EDGE_PATH="C:\Program Files\Microsoft\Edge\Application\msedge.exe"
) else (
    set EDGE_PATH="msedge.exe"
)

%EDGE_PATH% --kiosk http://localhost:8080 --edge-kiosk-type=fullscreen
