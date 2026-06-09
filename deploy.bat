@echo off
chcp 65001 >nul 2>&1
setlocal enabledelayedexpansion

echo ============================================
echo   Nimbalyst Agent Work OS - 一键部署
echo ============================================
echo.

:: ---- 检查 Node.js ----
where node >nul 2>&1
if %errorlevel% neq 0 (
    echo [错误] 未检测到 Node.js，请先安装 Node.js 22+
    echo        下载: https://nodejs.org/
    pause
    exit /b 1
)
for /f "tokens=*" %%v in ('node -v') do set NODE_VER=%%v
echo [OK] Node.js %NODE_VER%

:: ---- 检查 Git ----
where git >nul 2>&1
if %errorlevel% neq 0 (
    echo [错误] 未检测到 Git，请先安装 Git
    echo        下载: https://git-scm.com/
    pause
    exit /b 1
)
echo [OK] Git 已安装

:: ---- 定位项目根目录 ----
set "ROOT=%~dp0"
cd /d "%ROOT%"

:: ---- 安装依赖 ----
echo.
echo [1/3] 安装依赖 (npm install) ...
call npm install
if %errorlevel% neq 0 (
    echo [错误] npm install 失败
    pause
    exit /b 1
)
echo [OK] 依赖安装完成

:: ---- 构建桌面应用 ----
echo.
echo [2/3] 构建桌面应用 (免安装版) ...
echo      这可能需要几分钟，请耐心等待...
call npm run agent-work-os:desktop:win-dir
if %errorlevel% neq 0 (
    echo [错误] 构建失败
    pause
    exit /b 1
)

set "EXE_PATH=%ROOT%packages\electron\release\win-unpacked\Nimbalyst.exe"
if not exist "%EXE_PATH%" (
    echo [错误] 构建产物未找到: %EXE_PATH%
    pause
    exit /b 1
)
echo [OK] 构建完成

:: ---- 创建桌面快捷方式 ----
echo.
echo [3/3] 创建桌面快捷方式 ...
set "DESKTOP=%USERPROFILE%\Desktop"
set "SHORTCUT=%DESKTOP%\Nimbalyst.lnk"

powershell -NoProfile -Command ^
  "$ws = New-Object -ComObject WScript.Shell; $s = $ws.CreateShortcut('%SHORTCUT%'); $s.TargetPath = '%EXE_PATH%'; $s.WorkingDirectory = '%ROOT%packages\electron\release\win-unpacked'; $s.Description = 'Nimbalyst Agent Work OS'; $s.Save()"

if exist "%SHORTCUT%" (
    echo [OK] 桌面快捷方式已创建: %SHORTCUT%
) else (
    echo [警告] 快捷方式创建失败，你可以手动运行:
    echo        %EXE_PATH%
)

:: ---- 完成 ----
echo.
echo ============================================
echo   部署完成!
echo ============================================
echo.
echo   可执行文件: packages\electron\release\win-unpacked\Nimbalyst.exe
echo   桌面快捷方式: %SHORTCUT%
echo.
echo   双击桌面的 Nimbalyst 图标即可启动。
echo   首次使用会触发中文快速入门引导。
echo.

pause
