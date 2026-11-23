@echo off
setlocal EnableExtensions EnableDelayedExpansion
chcp 65001 >nul
cd /d "%~dp0"
title 提瓦特元素猜谜 - 局域网房主服务

echo ============================================================
echo   提瓦特 · 元素猜谜 - 局域网一键启动
echo ============================================================
echo.

set "NODE_EXE="
set "NODE_MAJOR="
where node >nul 2>nul
if not errorlevel 1 (
  for /f "delims=" %%v in ('node -p "process.versions.node.split('.')[0]" 2^>nul') do set "NODE_MAJOR=%%v"
  if defined NODE_MAJOR if !NODE_MAJOR! GEQ 20 set "NODE_EXE=node"
)

if not defined NODE_EXE if exist "%~dp0.runtime\node.exe" set "NODE_EXE=%~dp0.runtime\node.exe"

if not defined NODE_EXE (
  echo [环境检测] 未检测到可用的 Node.js 20+。
  echo [环境检测] 将尝试自动下载便携版 Node.js，无需管理员权限。
  echo.
  powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0setup-node.ps1"
  if errorlevel 1 goto :env_fail
  if not exist "%~dp0.runtime\node.exe" goto :env_fail
  set "NODE_EXE=%~dp0.runtime\node.exe"
)

echo [环境检测] Node.js 已就绪。
echo [启动] 正在启动局域网服务，请勿关闭本窗口。
echo [日志] logs\lan-server.log
echo.
"%NODE_EXE%" server.js %*
set "EXIT_CODE=%ERRORLEVEL%"
echo.
if not "%EXIT_CODE%"=="0" (
  echo [异常] 服务已退出，退出码：%EXIT_CODE%
  echo [提示] 请查看 logs\lan-server.log，或检查端口是否被占用、防火墙是否拦截。
) else (
  echo [提示] 服务已停止。
)
if "%~1"=="" pause
exit /b %EXIT_CODE%

:env_fail
echo.
echo [异常] 未能准备 Node.js 运行环境。
echo [处理] 请手动安装 Node.js 20 或更高版本：
echo          https://nodejs.org/zh-cn/download
echo [处理] 安装完成后重新双击本启动文件。
echo.
pause
exit /b 1
