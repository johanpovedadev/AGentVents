@echo off
REM Muda AGentVents (informes y redes) al servidor de Oracle, igual que Leo y la heladeria. Doble clic.
REM Johan, 19 nov 2026: "subelo como subimos los demas" (con el .env del PC, sin cargar claves en GitHub).
REM Sube el codigo de esta carpeta + .env; en el servidor corre deploy/oracle/instalar_agentvents.sh.
REM El importador de chats de WhatsApp se queda en el PC (lee data\chats_entrantes de este PC).
REM Si algo falla, los informes siguen en el PC. Log en mudar_agentvents_oracle.log (esta carpeta).
setlocal EnableDelayedExpansion
set LOG=%~dp0mudar_agentvents_oracle.log
for %%I in ("%~dp0..\..") do set AV=%%~fI
for %%I in ("%AV%\..") do set DOCS=%%~fI
set STAGE=%TEMP%\agentvents_oracle
echo ==== %date% %time% ==== > "%LOG%"

if not exist "%DOCS%\lion-platform-api\.env.oracle" ( echo FALTA lion-platform-api\.env.oracle con ORACLE_IP >> "%LOG%" & goto fin )
for /f "usebackq tokens=1,* delims==" %%a in ("%DOCS%\lion-platform-api\.env.oracle") do set "%%a=%%b"
if not exist "%AV%\.env" ( echo FALTA %AV%\.env >> "%LOG%" & goto fin )
set KEY=%DOCS%\empanadas\.oracle\oracle_lion
if not exist "%KEY%" ( echo FALTA la llave %KEY% >> "%LOG%" & goto fin )
REM OpenSSH de Windows solo acepta llaves que lee unicamente este usuario: se usa una copia propia en %TEMP%.
taskkill /im ssh.exe /f >nul 2>&1
if exist "%TEMP%\oracle_av_key" ( icacls "%TEMP%\oracle_av_key" /grant "%USERNAME%:F" >nul & del /q "%TEMP%\oracle_av_key" )
copy /y "%KEY%" "%TEMP%\oracle_av_key" >nul
set KEY=%TEMP%\oracle_av_key
icacls "%KEY%" /inheritance:r /grant:r "%USERNAME%:R" >nul
set SSH=-i "%KEY%" -o StrictHostKeyChecking=accept-new -o ConnectTimeout=20 -o BatchMode=yes -o ServerAliveInterval=30
set SRV=ubuntu@!ORACLE_IP!

echo 1. Probando la conexion con !ORACLE_IP! ... >> "%LOG%"
ssh -n %SSH% !SRV! "echo conectado" >> "%LOG%" 2>&1 || ( echo NO HAY CONEXION con el servidor: no se toco nada >> "%LOG%" & goto fin )

echo 2. Empacando el codigo de esta carpeta y el .env ^(sin node_modules, .git ni datos^)... >> "%LOG%"
cd /d "%AV%"
if exist "%STAGE%" rmdir /s /q "%STAGE%"
robocopy "%AV%" "%STAGE%" /e /np /nfl /ndl /njh /njs /xd node_modules .git data .claude /xf *.log *.bundle test-data.json >> "%LOG%" 2>&1
if errorlevel 8 ( echo FALLO al copiar el codigo >> "%LOG%" & goto fin )
if not exist "%STAGE%\.env" ( echo FALTA el .env en el paquete >> "%LOG%" & goto fin )
tar -czf "%TEMP%\agentvents_oracle.tgz" -C "%STAGE%" . >> "%LOG%" 2>&1 || ( echo FALLO al empacar >> "%LOG%" & goto fin )
rmdir /s /q "%STAGE%"

echo 3. Subiendo... >> "%LOG%"
scp %SSH% "%TEMP%\agentvents_oracle.tgz" "%AV%\deploy\oracle\instalar_agentvents.sh" !SRV!:~/ >> "%LOG%" 2>&1 || ( echo FALLO scp >> "%LOG%" & goto fin )
del /q "%TEMP%\agentvents_oracle.tgz"

echo 4. Instalando en el servidor... >> "%LOG%"
ssh -n %SSH% !SRV! "tr -d '\r' < ~/instalar_agentvents.sh > ~/.ia.sh && bash ~/.ia.sh" >> "%LOG%" 2>&1
findstr /c:"LISTO_AGENTVENTS" "%LOG%" >nul || ( echo FALLO la instalacion en el servidor: los informes siguen en el PC >> "%LOG%" & goto fin )

echo 5. Ya corre en Oracle: quito los informes del PC ^(el importador de chats se queda^) >> "%LOG%"
call pm2 delete agentvents-seguimientos agentvents-ventas agentvents-marketing >> "%LOG%" 2>&1
call pm2 save --force >> "%LOG%" 2>&1
echo LISTO: AGentVents corre en el servidor de Oracle >> "%LOG%"
:fin
echo FIN >> "%LOG%"
