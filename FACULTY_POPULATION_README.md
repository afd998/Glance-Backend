# Faculty Table Population Script

This script populates a Supabase table with faculty data from the Kellogg School of Management directory, including scraping individual faculty pages for bio information.

## Prerequisites

1. **Supabase Setup**: You need a Supabase project with the following environment variables:
   - `SUPABASE_URL`: Your Supabase project URL
   - `SUPABASE_ANON_KEY`: Your Supabase anonymous key

2. **Environment Variables**: Add these to your `.env` file:
   ```
   SUPABASE_URL=your_supabase_project_url
   SUPABASE_ANON_KEY=your_supabase_anon_key
   ```

3. **Dependencies**: The script requires the following packages (already installed):
   - `@supabase/supabase-js`
   - `playwright`
   - `dotenv`

## Table Structure

The script creates a `faculty` table with the following columns:

- `id` (SERIAL PRIMARY KEY)
- `kelloggdirectory_name` (TEXT) - Faculty name from Kellogg directory
- `kelloggdirectory_title` (TEXT) - Faculty title from Kellogg directory
- `kelloggdirectory_subtitle` (TEXT) - Scraped subtitle from faculty page
- `kelloggdirectory_bio` (TEXT) - Scraped bio from faculty page
- `kelloggdirectory_image_url` (TEXT) - Faculty image URL
- `kelloggdirectory_bio_url` (TEXT) - URL to faculty's bio page
- `twentyfivelive_name` (TEXT) - Name from 25Live (initially null, to be populated later)
- `created_at` (TIMESTAMP)
- `updated_at` (TIMESTAMP)

## How to Execute

1. **Make sure your environment variables are set** in the `.env` file

2. **Run the script**:
   ```bash
   node populate-faculty-table.js
   ```

## What the Script Does

1. **Fetches Faculty Directory Data**: Gets all faculty members from the Kellogg API across all pages
2. **Scrapes Individual Pages**: For each faculty member, visits their bio page to extract:
   - Subtitle (additional title information)
   - Bio text (biography/description)
3. **Creates Supabase Table**: Creates the `faculty` table if it doesn't exist
4. **Inserts Data**: Inserts all faculty data into the Supabase table in batches

## Expected Output

The script will show progress like:
```
Starting faculty table population...
Launching browser...
Browser initialized successfully
Creating faculty table...
Faculty table created successfully
Fetching faculty directory data...
Found 150 faculty members across 5 pages
Successfully fetched 150 faculty members
Scraping individual faculty pages for bio information...
Processing 1/150: John Doe
Processing 2/150: Jane Smith
...
Inserting 150 faculty members into Supabase...
Inserted batch 1 (10 records)
Inserted batch 2 (10 records)
...
All faculty data inserted successfully
Faculty table population completed successfully!
Total faculty members processed: 150
Script completed successfully
```

## Notes

- The script includes delays between requests to be respectful to the Kellogg website
- It processes faculty pages sequentially to avoid overwhelming the server
- Data is inserted in batches of 10 to avoid overwhelming the database
- The `twentyfivelive_name` field is initially set to `null` and can be populated later when you have 25Live data
- The script will create the table if it doesn't exist, so it's safe to run multiple times

## Troubleshooting

- **Missing environment variables**: Make sure `SUPABASE_URL` and `SUPABASE_ANON_KEY` are set in your `.env` file
- **Browser issues**: The script uses Playwright with headless mode. If you encounter browser issues, check that Playwright is properly installed
- **Network errors**: The script includes retry logic and error handling for network issues
- **Rate limiting**: The script includes delays to avoid being rate-limited by the Kellogg website

## Next Steps

After running this script, you can:
1. Query the faculty table to verify the data
2. Create a separate script to populate the `twentyfivelive_name` field when you have 25Live data
3. Use the faculty table in your application for faculty-related features 