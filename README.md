# Web Scraping Backend

A Node.js backend service that uses Playwright for web scraping with authentication support.

## Setup

1. Install dependencies:
```bash
npm install
```

2. Create a `.env` file with the following variables:
```
PORT=3000
NODE_ENV=development
```

3. Install Playwright browsers:
```bash
npm install && PLAYWRIGHT_BROWSERS_PATH=/opt/render/project/.cache/playwright npx playwright install chromium
```

## Development

Run the development server:
```bash
npm run dev
```

## Deployment on Render.com

1. Create a new Web Service on Render.com
2. Connect your GitHub repository
3. Use the following settings:
   - Build Command: `npm install && PLAYWRIGHT_BROWSERS_PATH=/opt/render/project/.cache/playwright npx playwright install chromium`
   - Start Command: `npm start`
   - Environment Variables:
     - `NODE_ENV=production`
     - `PORT=10000`

## API Endpoints

### POST /api/scrape
Scrapes multiple URLs with optional authentication.

Request body:
```json
{
  "urls": ["https://example.com/page1", "https://example.com/page2"],
  "credentials": {
    "username": "user",
    "password": "pass"
  }
}
```

Response:
```json
{
  "results": [
    {
      "url": "https://example.com/page1",
      "success": true,
      "data": "..."
    }
  ]
}
```

### GET /health
Health check endpoint.

Response:
```json
{
  "status": "ok"
}
``` 