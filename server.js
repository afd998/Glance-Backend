const express = require('express');
const { chromium } = require('playwright');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Store browser instance and cached data
let browser;
let cachedData = null;
let lastFetchTime = null;
const CACHE_DURATION = 5 * 60 * 1000; // 10 minutes in milliseconds

// Initialize browser
async function initBrowser() {
    try {
        const launchOptions = {
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-accelerated-2d-canvas',
                '--no-first-run',
                '--no-zygote',
                '--single-process',
                '--disable-gpu'
            ],
            headless: true,
            chromiumSandbox: false
        };

        console.log('Launching browser with options:', launchOptions);
        browser = await chromium.launch(launchOptions);
        console.log('Browser initialized successfully');
    } catch (error) {
        console.error('Failed to initialize browser:', error);
        throw error;
    }
}

// Function to fetch and cache data
async function fetchAndCacheData() {
    try {
        console.log('Starting data fetch...');
        const context = await browser.newContext();
        const page = await context.newPage();
        
        try {
            // Start at 25Live
            await page.goto('https://25live.collegenet.com/pro/northwestern#!/home/availability');
            
            // Wait for and click the Sign In button
            await page.waitForSelector('.c-nav-signin');
            await page.click('.c-nav-signin');
            
            // Wait for the login form and fill credentials
            await page.waitForSelector('input[id="idToken1"]');
            await page.fill('input[id="idToken1"]', process.env.NORTHWESTERN_USERNAME);
            await page.fill('input[id="idToken2"]', process.env.NORTHWESTERN_PASSWORD);
            
            // Click login and wait for navigation
            await page.click('input[id="loginButton_0"]');
            await page.waitForNavigation();
            
            // Wait for the main 25Live page to load
            await page.waitForSelector('div[ui-view="availability"]');
            
            // Fetch the availability data
            const response = await page.goto('https://25live.collegenet.com/25live/data/northwestern/run/availability/availabilitydata.json?obj_cache_accl=0&start_dt=2025-05-23T00:00:00&comptype=availability_home&compsubject=location&page_size=100&space_favorite=T&include=closed+blackouts+pending+related+empty&caller=pro-AvailService.getData');
            const rawData = await response.json();
            
            // Process the data
            const processedData = rawData.subjects.reduce((acc, subject) => {
                const subjectData = Object.entries(subject).reduce((obj, [key, value]) => {
                    if (key !== 'items') {
                        obj[`subject_${key}`] = value;
                    }
                    return obj;
                }, {});
                
                const itemsWithSubject = subject.items.map(item => ({
                    ...item,
                    ...subjectData
                }));
                return [...acc, ...itemsWithSubject];
            }, []);

            // For testing: truncate to 3 items
            const testData = processedData.slice(0, 3);
            console.log(`Processing ${testData.length} items (truncated for testing)...`);
            
            // Process each item sequentially to get additional details
            const finalData = [];
            for (const item of testData) {
                try {
                    console.log(`Fetching details for item ${item.itemId}...`);
                    
                    // Navigate to the item's details page
                    const itemUrl = `https://25live.collegenet.com/pro/northwestern#!/home/event/${item.itemId}/details`;
                    await page.goto(itemUrl);
                    
                    // Wait for the details element
                    await page.waitForSelector(`#evdetail-${item.itemId} > evd-defn > div > div > div > div.c-objectDetails--columnOne`, { timeout: 30000 });
                    
                    // Add a small delay to ensure content is loaded
                    await new Promise(resolve => setTimeout(resolve, 2000));
                    
                    // Extract the data from the details page
                    const itemDetails = await page.evaluate(() => {
                        return {
                            tasks: "working" // Replace with actual data extraction
                        };
                    });
                    
                    finalData.push({
                        ...item,
                        itemDetails
                    });
                    
                    // Add a small delay between items to prevent overwhelming the server
                    await new Promise(resolve => setTimeout(resolve, 1000));
                    
                } catch (error) {
                    console.error(`Error processing item ${item.itemId}:`, error.message);
                    finalData.push({
                        ...item,
                        itemDetails: null,
                        error: error.message
                    });
                }
            }

            // Update cache with the complete data
            cachedData = finalData;
            lastFetchTime = Date.now();
            console.log('Data fetch and cache update complete');
            
        } finally {
            await context.close();
        }
    } catch (error) {
        console.error('Error fetching data:', error);
        // If browser is closed, try to reinitialize it
        if (error.message.includes('Target page, context or browser has been closed')) {
            console.log('Browser was closed, reinitializing...');
            await initBrowser();
            // Retry the fetch
            return fetchAndCacheData();
        }
        throw error;
    }
}

// Endpoint to get data
app.get('/api/availability', async (req, res) => {
    try {
        // Check if we need to refresh the cache
        if (!cachedData || !lastFetchTime || (Date.now() - lastFetchTime) > CACHE_DURATION) {
            console.log('Cache expired or missing, fetching new data...');
            await fetchAndCacheData();
        }
        
        res.json({ 
            success: true, 
            data: cachedData,
            lastUpdated: lastFetchTime
        });
    } catch (error) {
        console.error('Error serving data:', error);
        res.status(500).json({ error: 'Failed to get availability data' });
    }
});

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({ 
        status: 'ok',
        lastDataFetch: lastFetchTime ? new Date(lastFetchTime).toISOString() : null
    });
});

// Start server and initial data fetch
async function startServer() {
    try {
        console.log('Initializing browser...');
        await initBrowser();
        console.log('Browser initialized successfully');
        
        // Initial data fetch
        await fetchAndCacheData();
        
        // Set up periodic data refresh
        setInterval(async () => {
            try {
                await fetchAndCacheData();
            } catch (error) {
                console.error('Error in periodic data refresh:', error);
            }
        }, CACHE_DURATION);
        
        app.listen(port, () => {
            console.log(`Server running on port ${port}`);
        });
    } catch (error) {
        console.error('Failed to start server:', error);
        process.exit(1);
    }
}

startServer(); 