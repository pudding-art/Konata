npm install

@if %errorlevel% neq 0 (
    @echo Installation failed. If you have not installed node.js, please install node.js from "https://nodejs.org"
    exit 1
)
