@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"
title NOVA AI - تشغيل

echo ======================================
echo        تشغيل NOVA AI
 echo ======================================
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo لم يتم العثور على Node.js.
  echo افتح https://nodejs.org وثبّته، ثم أغلق هذه النافذة وشغّل هذا الملف مرة أخرى.
  echo.
  pause
  exit /b 1
)

if not exist ".env" (
  copy ".env.example" ".env" >nul
)

echo سنفتح ملف الإعداد. ضع مفتاح API في السطر الأول بعد علامة = واحفظ الملف.
echo لا ترسل المفتاح لأي شخص.
start /wait notepad.exe "%CD%\.env"
echo.
echo إذا حفظت المفتاح، اضغط Enter للمتابعة.
pause >nul

echo.
echo جارٍ تجهيز الموقع (قد يستغرق هذا بضع دقائق في أول مرة)...
if not exist "node_modules" (
  call npm install
  if errorlevel 1 (
    echo.
    echo تعذر تثبيت الملفات. تأكد من اتصال الإنترنت ثم جرّب مرة أخرى.
    pause
    exit /b 1
  )
)

echo.
echo سيعمل الموقع الآن على http://localhost:3000
echo اترك هذه النافذة مفتوحة أثناء الاستخدام. للإيقاف اضغط Ctrl+C.
start "" http://localhost:3000
call npm start
pause
