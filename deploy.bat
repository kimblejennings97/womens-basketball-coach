@echo off
rem Optional Cloudflare deploy (the wrestling game's setup). GitHub Pages deploys by itself on every push (.github/workflows/pages.yml).
rem Builds dist\ (tools\build_deploy.py) and publishes ONLY dist\ (wrangler.jsonc).
cd /d "%~dp0"
py tools\build_deploy.py || goto :fail
call npx wrangler deploy || goto :fail
echo.
echo Deployed. If wrangler asks you to log in, run: npx wrangler login
pause
exit /b 0
:fail
echo.
echo Deploy failed - see the messages above.
pause
exit /b 1
