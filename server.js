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

// Function to fetch data
async function fetchData() {
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
            
            // Get cookies for authentication
            const cookies = await context.cookies();
            const cookieString = cookies.map(cookie => `${cookie.name}=${cookie.value}`).join('; ');
            
            // Fetch the availability data
            const response = await fetch('https://25live.collegenet.com/25live/data/northwestern/run/availability/availabilitydata.json?obj_cache_accl=0&start_dt=2025-05-23T00:00:00&comptype=availability_home&compsubject=location&page_size=100&space_favorite=T&include=closed+blackouts+pending+related+empty&caller=pro-AvailService.getData', {
                headers: {
                    'Cookie': cookieString
                }
            });
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

            console.log(`Processing ${processedData.length} items...`);
            
            // Make all API requests in parallel using fetch
            const detailPromises = processedData.map(async (item) => {
                try {
                    console.log(`Fetching details for item ${item.itemId}...`);
                    const itemDetailsResponse = await fetch(
                        `https://25live.collegenet.com/25live/data/northwestern/run/event/detail/evdetail.json?event_id=${item.itemId}&caller=pro-EvdetailDao.get`,
                        {
                            headers: {
                                'Cookie': cookieString
                            }
                        }
                    );
                    const itemDetails = await itemDetailsResponse.json();
                    return {
                        ...item,
                        itemDetails: itemDetails.evdetail
                    };
                } catch (error) {
                    console.error(`Error processing item ${item.itemId}:`, error.message);
                    return {
                        ...item,
                        itemDetails: null,
                        error: error.message
                    };
                }
            });

            // Wait for all requests to complete
            const finalData = await Promise.all(detailPromises);
            return finalData;
            
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
            return fetchData();
        }
        throw error;
    }
}

// Endpoint to get data
app.get('/api/availability', async (req, res) => {
    try {
        const data = await fetchData();
        res.json({ 
            success: true, 
            data: data
        });
    } catch (error) {
        console.error('Error serving data:', error);
        res.status(500).json({ error: 'Failed to get availability data' });
    }
});

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({ 
        status: 'ok'
    });
});

// Start server
async function startServer() {
    try {
        console.log('Initializing browser...');
        await initBrowser();
        console.log('Browser initialized successfully');
        
        app.listen(port, () => {
            console.log(`Server running on port ${port}`);
        });
    } catch (error) {
        console.error('Failed to start server:', error);
        process.exit(1);
    }
}

startServer(); 