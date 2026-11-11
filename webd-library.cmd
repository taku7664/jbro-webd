@echo off
rem WebD 라이브러리 서버를 연다. 더블클릭하거나 터미널에서 실행한다.
rem   webd-library.cmd                 이 PC 브라우저로 목록을 연다
rem   webd-library.cmd --lan           같은 와이파이의 폰·태블릿에서도 열리게(주소가 따로 나옴)
rem   webd-library.cmd --port 47360    포트 고정
rem 라이브러리 폴더는 환경변수 WEBD_LIBRARY(없으면 %%USERPROFILE%%\.webd\library), 바꾸려면 --lib "경로".
rem 닫으려면 이 창에서 Ctrl+C.
chcp 65001 >nul
setlocal
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js를 찾지 못했습니다. Node 22 이상을 설치한 뒤 다시 실행하세요.
  pause
  exit /b 1
)
node "%~dp0skills\webd-library\scripts\library.mjs" open %*
if errorlevel 1 pause
endlocal
