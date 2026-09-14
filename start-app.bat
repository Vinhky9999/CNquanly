@echo off
title CardNest - dang chay...
cd /d "%~dp0"
echo Dang khoi dong CardNest...
echo Sau khi thay dong "Ready in ..." ben duoi, mo trinh duyet vao: http://localhost:3000
echo (Dung dong cua so nay khi con dang dung app - dong lai la app tat theo)
echo.
call npm run dev
pause
