@echo off
chcp 65001 > nul
echo 正在啟動 Comic Manager 前後端服務...
echo.

:: 暫時設定 JAVA_HOME 變數供本次執行使用
set JAVA_HOME=C:\Users\ml042\.jdks\temurin-17.0.13

:: 啟動 Spring Boot 後端 (開新視窗)
echo [1/2] 啟動 Spring Boot 後端伺服器 (Port 8080)...
start "Comic Manager Backend" cmd /k "cd server && mvnw spring-boot:run"

:: 啟動 Vue 3 前端 (開新視窗)
echo [2/2] 啟動 Vue 前端介面 (Port 5173)...
start "Comic Manager Frontend" cmd /k "cd client && npm run dev"

echo.
echo 啟動指令已送出！
echo 請等兩個視窗跑完之後，即可開啟您的瀏覽器，
echo 或直接前往網址: http://localhost:5173
echo.
pause
