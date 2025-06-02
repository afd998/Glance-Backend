const express = require('express');
const { chromium } = require('playwright');
const cors = require('cors');
require('dotenv').config();
const axios = require('axios');


app.use(cors());

const app = express();
const port = process.env.PORT || 3002;

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
async function fetchData(startDate) {
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
            
            // Fetch the availability data with the provided date
            const response = await fetch(`https://25live.collegenet.com/25live/data/northwestern/run/availability/availabilitydata.json?obj_cache_accl=0&start_dt=${startDate}&comptype=availability_home&compsubject=location&page_size=100&space_favorite=T&include=closed+blackouts+pending+related+empty&caller=pro-AvailService.getData`, {
                headers: {
                    'Cookie': cookieString
                }
            });
            const rawData = await response.json();
            
           
           
            if (rawData.subjects) {
            
                const firstSubject = rawData.subjects[0];
               
              
            }
          
            // Check if we have valid data
            if (!rawData || !rawData.subjects) {
                throw new Error('Invalid data received from API: ' + JSON.stringify(rawData));
            }
           
            
            // Log each subject's structure
            rawData.subjects.forEach((subject, index) => {
               
                if (subject.items) {
                    console.log('Items length:', subject.items.length);
                }
            });
           
            
            // Process the data
            const processedData = rawData.subjects
                .filter(subject => subject.items && Array.isArray(subject.items)) // Only keep subjects with items array
                .reduce((acc, subject) => {
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
                    const eventWithUrl = {
                        ...item,
                        itemDetails: itemDetails.evdetail,
                        eventUrl: `https://25live.collegenet.com/pro/northwestern#!/home/event/${item.itemId}/details`
                    };
                    console.log('Event with URL:', JSON.stringify(eventWithUrl, null, 2));
                    return eventWithUrl;
                } catch (error) {
                    console.error(`Error processing item ${item.itemId}:`, error.message);
                    const eventWithUrl = {
                        ...item,
                        itemDetails: null,
                        eventUrl: `https://25live.collegenet.com/pro/northwestern#!/home/event/${item.itemId}/details`,
                        error: error.message
                    };
                    console.log('Event with URL (error case):', JSON.stringify(eventWithUrl, null, 2));
                    return eventWithUrl;
                }
            });

            // Wait for all requests to complete
            const finalData = await Promise.all(detailPromises);
            
            // Log the final data structure
            console.log('\n=== Final Data Structure ===');
            console.log('Number of events:', finalData.length);
            if (finalData.length > 0) {
                console.log('First event structure:', JSON.stringify(finalData[0], null, 2));
            }
            console.log('=== End Final Data Structure ===\n');
            
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
            return fetchData(startDate);
        }
        throw error;
    }
}

// Endpoint to get data
app.get('/api/availability', async (req, res) => {
    try {
        // Get date from query parameter, default to 2025-05-23 if not provided
        const startDate = req.query.date || '2025-05-23T00:00:00';
        console.log('Fetching data for date:', startDate);
        const data = await fetchData(startDate);
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




// Proxy endpoint for faculty directory
app.get('/api/faculty', async (req, res) => {
  try {
    // First, get the first page to determine total results
    const firstPageResponse = await axios.get('https://www.kellogg.northwestern.edu/api/facultylisting', {
      params: {
        listingId: 'e9eb7e22-b0ce-4907-be8b-9e73c3347c55',
        pageId: 'ec51f47e-4843-4eb7-a5d5-15ec09593247',
        page: 1
      }
    });
    
    const totalResults = firstPageResponse.data.totalResults;
    const perPage = firstPageResponse.data.results.length;
    const totalPages = Math.ceil(totalResults / perPage);
    
    // Fetch all pages in parallel
    const pagePromises = [];
    for (let page = 1; page <= totalPages; page++) {
      pagePromises.push(
        axios.get('https://www.kellogg.northwestern.edu/api/facultylisting', {
          params: {
            listingId: 'e9eb7e22-b0ce-4907-be8b-9e73c3347c55',
            pageId: 'ec51f47e-4843-4eb7-a5d5-15ec09593247',
            page
          }
        })
      );
    }
    
    const pageResponses = await Promise.all(pagePromises);
    
    // Combine all results
    const allFaculty = pageResponses.flatMap(response => response.data.results);
    
    // Transform the data to match our expected format
    const faculty = allFaculty.map(member => ({
      name: member.name,
      title: member.title,
      imageUrl: member.images?.desktop1X ? new URL(member.images.desktop1X, 'https://www.kellogg.northwestern.edu').toString() : null,
      department: member.title.split(' of ')[1] || null, // Extract department from title
      bioUrl: member.url ? new URL(member.url, 'https://www.kellogg.northwestern.edu').toString() : null // Use the URL directly since it's already a full URL
    }));
    
    res.json(faculty);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch faculty directory' });
  }
});

// Proxy endpoint for events
app.get('/api/events', async (req, res) => {
  try {
    const response = await axios.get('https://www.kellogg.northwestern.edu/api/events');
    res.json(response.data);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch events' });
  }
});

const PORT = process.env.PORT || 3003;
app.listen(PORT, () => {
  console.log(`[Proxy] Server running on port ${PORT}`);
}); 