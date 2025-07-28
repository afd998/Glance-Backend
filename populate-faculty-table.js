const { createClient } = require('@supabase/supabase-js');
const { chromium } = require('playwright');
require('dotenv').config();

// Initialize Supabase client
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('Missing Supabase environment variables. Please set SUPABASE_URL and SUPABASE_ANON_KEY');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

// Initialize browser and context
let browser;
let context;

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

        console.log('Launching browser...');
        browser = await chromium.launch(launchOptions);
        context = await browser.newContext();
        console.log('Browser and context initialized successfully');
    } catch (error) {
        console.error('Failed to initialize browser:', error);
        throw error;
    }
}

// Function to fetch all faculty from Kellogg directory
async function fetchAllFaculty() {
    try {
        console.log('Fetching faculty directory data...');
        
        // First, get the first page to determine total results
        const firstPageResponse = await fetch('https://www.kellogg.northwestern.edu/api/facultylisting?' + new URLSearchParams({
            listingId: 'e9eb7e22-b0ce-4907-be8b-9e73c3347c55',
            pageId: 'ec51f47e-4843-4eb7-a5d5-15ec09593247',
            page: 1
        }));
        
        const firstPageData = await firstPageResponse.json();
        const totalResults = firstPageData.totalResults;
        const perPage = firstPageData.results.length;
        const totalPages = Math.ceil(totalResults / perPage);
        
        console.log(`Found ${totalResults} faculty members across ${totalPages} pages`);
        
        // Fetch all pages in parallel
        const pagePromises = [];
        for (let page = 1; page <= totalPages; page++) {
            pagePromises.push(
                fetch('https://www.kellogg.northwestern.edu/api/facultylisting?' + new URLSearchParams({
                    listingId: 'e9eb7e22-b0ce-4907-be8b-9e73c3347c55',
                    pageId: 'ec51f47e-4843-4eb7-a5d5-15ec09593247',
                    page
                })).then(res => res.json())
            );
        }
        
        const pageResponses = await Promise.all(pagePromises);
        
        // Combine all results
        const allFaculty = pageResponses.flatMap(response => response.results);
        
        console.log(`Successfully fetched ${allFaculty.length} faculty members`);
        return allFaculty;
        
    } catch (error) {
        console.error('Error fetching faculty directory:', error);
        throw error;
    }
}

// Function to scrape individual faculty page for bio and subtitle
async function scrapeFacultyPage(bioUrl) {
    if (!bioUrl) return { subtitle: null, bio: null };
    
    try {
        const page = await context.newPage();
        
        await page.goto(bioUrl, { waitUntil: 'networkidle' });
        
        // Extract subtitle (usually under the name)
        let subtitle = null;
        try {
            subtitle = await page.$eval('.faculty-subtitle, .faculty-title, h2, .subtitle', el => el.textContent.trim());
        } catch (e) {
            // Try alternative selectors
            try {
                subtitle = await page.$eval('.faculty-info h2, .profile-subtitle, .title', el => el.textContent.trim());
            } catch (e2) {
                console.log(`Could not find subtitle for ${bioUrl}`);
            }
        }
        
        // Extract bio text
        let bio = null;
        try {
            bio = await page.$eval('.faculty-bio, .bio-content, .profile-bio, .biography', el => el.textContent.trim());
        } catch (e) {
            // Try alternative selectors
            try {
                bio = await page.$eval('.faculty-description, .profile-description, .about-content', el => el.textContent.trim());
            } catch (e2) {
                console.log(`Could not find bio for ${bioUrl}`);
            }
        }
        
        await page.close();
        
        return { subtitle, bio };
        
    } catch (error) {
        console.error(`Error scraping faculty page ${bioUrl}:`, error.message);
        return { subtitle: null, bio: null };
    }
}

// Function to insert a single faculty member into Supabase
async function insertFacultyMember(facultyData) {
    try {
        const { data, error } = await supabase
            .from('faculty')
            .insert(facultyData)
            .select();
        
        if (error) {
            console.error(`Error inserting faculty member ${facultyData.kelloggdirectory_name}:`, error);
            throw error;
        }
        
        console.log(`✅ Inserted: ${facultyData.kelloggdirectory_name}`);
        return data;
        
    } catch (error) {
        console.error('Error inserting faculty member:', error);
        throw error;
    }
}

// Main function to populate the table
async function populateFacultyTable() {
    try {
        console.log('Starting faculty table population...');
        
        // Initialize browser
        await initBrowser();
        
        // Fetch all faculty from Kellogg directory
        const allFaculty = await fetchAllFaculty();
        
        // Process each faculty member and insert immediately
        console.log('Scraping individual faculty pages and inserting data...');
        let successCount = 0;
        let errorCount = 0;
        
        for (let i = 0; i < allFaculty.length; i++) {
            const faculty = allFaculty[i];
            console.log(`\nProcessing ${i + 1}/${allFaculty.length}: ${faculty.name}`);
            
            try {
                // Get bio URL
                const bioUrl = faculty.url ? new URL(faculty.url, 'https://www.kellogg.northwestern.edu').toString() : null;
                
                // Scrape individual page for bio and subtitle
                const { subtitle, bio } = await scrapeFacultyPage(bioUrl);
                
                // Prepare faculty data for insertion
                const facultyData = {
                    kelloggdirectory_name: faculty.name,
                    kelloggdirectory_title: faculty.title,
                    kelloggdirectory_subtitle: subtitle,
                    kelloggdirectory_bio: bio,
                    kelloggdirectory_image_url: faculty.images?.desktop1X ? new URL(faculty.images.desktop1X, 'https://www.kellogg.northwestern.edu').toString() : null,
                    kelloggdirectory_bio_url: bioUrl,
                    twentyfivelive_name: null // This will be populated later when we have 25Live data
                };
                
                // Insert immediately into Supabase
                await insertFacultyMember(facultyData);
                successCount++;
                
            } catch (error) {
                console.error(`❌ Failed to process ${faculty.name}:`, error.message);
                errorCount++;
            }
            
            // Add a small delay between requests to be respectful
            await new Promise(resolve => setTimeout(resolve, 500));
        }
        
        console.log('\n=== FACULTY TABLE POPULATION COMPLETED ===');
        console.log(`✅ Successfully processed: ${successCount} faculty members`);
        console.log(`❌ Errors: ${errorCount} faculty members`);
        console.log(`📊 Total processed: ${successCount + errorCount}/${allFaculty.length}`);
        
    } catch (error) {
        console.error('Error populating faculty table:', error);
        throw error;
    } finally {
        if (context) {
            await context.close();
        }
        if (browser) {
            await browser.close();
        }
    }
}

// Run the script
if (require.main === module) {
    populateFacultyTable()
        .then(() => {
            console.log('Script completed successfully');
            process.exit(0);
        })
        .catch((error) => {
            console.error('Script failed:', error);
            process.exit(1);
        });
}

module.exports = { populateFacultyTable }; 