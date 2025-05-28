const express = require('express');
const { chromium } = require('playwright');
const cors = require('cors');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Store browser instance
let browser;

// Initialize browser
async function initBrowser() {
    browser = await chromium.launch({
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
}

// Scraping endpoint
app.post('/api/scrape', async (req, res) => {
    try {
        const { urls, credentials } = req.body;
        
        if (!urls || !Array.isArray(urls)) {
            return res.status(400).json({ error: 'URLs array is required' });
        }

        const results = [];
        const maxConcurrent = 5; // Adjust based on your needs

        // Process URLs in batches
        for (let i = 0; i < urls.length; i += maxConcurrent) {
            const batch = urls.slice(i, i + maxConcurrent);
            const batchPromises = batch.map(url => scrapePage(url, credentials));
            
            const batchResults = await Promise.all(batchPromises);
            results.push(...batchResults);
        }

        res.json({ results });
    } catch (error) {
        console.error('Scraping error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

async function scrapePage(url, credentials) {
    const context = await browser.newContext();
    const page = await context.newPage();
    
    try {
        // Login if credentials are provided
        if (credentials) {
            await login(page, credentials);
        }

        await page.goto(url);
        
        // Add your specific scraping logic here
        const data = await page.evaluate(() => {
            // Example: Get all text content
            return document.body.innerText;
        });

        return { url, success: true, data };
    } catch (error) {
        console.error(`Error scraping ${url}:`, error);
        return { url, success: false, error: error.message };
    } finally {
        await context.close();
    }
}

async function login(page, credentials) {
    // Implement your login logic here
    // This is a placeholder - you'll need to customize this
    // based on the specific website you're scraping
    try {
        await page.goto('https://example.com/login');
        await page.fill('#username', credentials.username);
        await page.fill('#password', credentials.password);
        await page.click('#login-button');
        await page.waitForNavigation();
    } catch (error) {
        throw new Error(`Login failed: ${error.message}`);
    }
}

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({ status: 'ok' });
});

// Start server
app.listen(port, async () => {
    console.log(`Server running on port ${port}`);
    await initBrowser();
    console.log('Browser initialized');
}); 