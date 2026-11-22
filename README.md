# [axeloft-interactive.com](https://axeloft-interactive.com)
This is the Github repo for the axeloft-interactive website. You can view it [here](https://axeloft-interactive.com).

It features a dynamic pixel grid, information about us, and more. You can also draw your own shapes in the pixel grid by typing `sandbox` anywhere on the page.
The website is made with raw html, css, and js. It also uses vite to minify assets and provide certain features.
## Running locally

### Docker (recommended)
```sh
git clone https://github.com/Axeloft-Interactive/axeloft-interactive.com.git
cd axeloft-interactive.com
docker build -t axeloft-interactive.com . && docker run -p "3000:3000" -v ./data:/app/data axeloft-interactive.com
```
Open localhost:3000 in your browser.

### Linux/Windows/MacOS
1. Install Node 18+
2. Run the command below
```sh
git clone https://github.com/Axeloft-Interactive/axeloft-interactive.com.git
cd axeloft-interactive.com
npm install
npm run build && npm start
# or for development:
# npm run dev
```