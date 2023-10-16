const express = require('express');
const axios = require('axios');
const puppeteer = require('puppeteer');
const fs = require('fs');
const app = express();
app.use(express.json());
const port = 3000; // You can specify your desired port
let isScraping = false;
let scrapeInterval;


// Define an array of categories
const categories = ['football', 'tennis'];
// const categories = ['football', 'tennis', 'basketball', 'golf', 'cricket', 'volleyball', 'baseball', 'ice-hockey'];


async function scrappedata(category = 'football') {
    // Launch a headless browser
    const browser = await puppeteer.launch();

    // Open a new page
    const page = await browser.newPage();

    // Define the URL based on the category
    const url = `https://1xlite-792232.top/en/live/${category}`;
    await page.goto(url);

    // Function to scroll down the page to load more content
    const scrollDown = async () => {
        let previousHeight = 0;
        for (let i = 0; i < 10; i++) { // Scroll up to 10 times or until no more new content
            await page.evaluate(() => {
                window.scrollBy(0, window.innerHeight); // Scroll down by one viewport height
            });

            await page.waitForTimeout(9000); // Wait for a moment for new content to load

            const newHeight = await page.evaluate(() => document.body.scrollHeight);
            if (newHeight === previousHeight) {
                break; // No more new content loaded
            }
            previousHeight = newHeight;
        }
    }

    await scrollDown();
    const extractCaptionLabels = async () => {
        const captionLabels = await page.evaluate(() => {
            const captionLabelElements = Array.from(document.querySelectorAll('span.caption__label'));
            const startIndex = 31;
            const endIndex = captionLabelElements.length - 19;

            // Remove the filter, just map the labels
            const labels = captionLabelElements
                .slice(startIndex, endIndex)
                .map((span) => span.textContent.trim());

            return labels;
        });

        return captionLabels;
    };


    // Function to extract the content of <span class="market__value"> elements
    const extractMarketValues = async () => {
        // Wait for the first <span class="market__value"> element to appear
        await page.waitForSelector('span.market__value');

        const marketValues = await page.evaluate(() => {
            const marketValueElements = Array.from(document.querySelectorAll('span.market__value'));
            const startIndex = 23;
            const endIndex = marketValueElements.length - 5;
            return marketValueElements.slice(startIndex, endIndex).map((span) => span.textContent.trim());
        });

        return marketValues;
    };
    const [captionLabels, marketValues] = await Promise.all([
        extractCaptionLabels(),
        extractMarketValues()
    ]);
    // Close the browser
    await browser.close();
    console.log(`Scrapped ${category} data successfully.Total ${captionLabels.length} items.`);
    // Return the scrapped data
    return { category, captionLabels, marketValues };
}

async function scrapeAllCategories(start, end) {
    const allscrappedData = [];

    for (let i = start; i <= end; i++) {
        const category = categories[i];
        console.log(`Scraping data for category: ${category}`);
        const scrappedData = await scrappedata(category);
        allscrappedData.push(scrappedData);
    }

    return allscrappedData;
}
function writeDataToJSON(data) {
    fs.writeFileSync('scrapped_data.json', JSON.stringify(data, null, 2), 'utf-8');
}

function convertToAmericanOdds(decimalOdds) {
    if (decimalOdds < 2.00) {
        return parseInt((decimalOdds - 1) * 100);
    } else {
        return parseInt(100 * (decimalOdds - 1));
    }
    return decimalOdds;
}
app.get('/start', async (req, res) => {
    if (isScraping) {
        res.json({ message: 'Scraping is already in progress.' });
        return;
    }

    isScraping = true;

    const scrappedData = [];
    // Continuously scrape and post data every 10 minutes 
    const interval = .5 * 60 * 1000; // 10 minutes
    const startCategory = 0;
    const endCategory = categories.length - 1;

    async function scrapeAndSaveData() {
        if (!isScraping) {
            clearInterval(scrapeInterval);
            isScraping = false;
            return;
        }
        let success = false;
        try {
            const scrapedData = await scrapeAllCategories(0, categories.length - 1);
            const formattedData = formatData(scrapedData);
            writeDataToJSON(formattedData);
            await axios.post('https://limber-scissors-production.up.railway.app/api/live/', formattedData);

            success = true;
        } catch (error) {
            console.error(error);
        }

        if (success) {
            console.log('Data has been scraped and posted successfully.');
            if (!isScraping) {
                console.log('Scraping stopped.');

            }
        } else {
            console.log('Data scraping and posting failed.');
        }
    }



    // Initial data scraping and posting
    scrapeAndSaveData();

    // Schedule periodic scraping and posting
    scrapeInterval = setInterval(scrapeAndSaveData, interval);

    res.json({ message: 'Scraping and posting started.' });
});


app.get('/stop', (req, res) => {
    if (isScraping) {
        isScraping = false;
        res.json({ message: 'Scraping will stop after this cycle.' });
    } else {
        res.json({ message: 'Scraping is not in progress.' });
    }
});

app.get('/data', (req, res) => {
    try {
        const rawData = fs.readFileSync('scrapped_data.json', 'utf-8');
        if (!rawData) {
            // Handle the case where the data is empty or null
            res.status(404).json({ error: 'No data found.' });
            return;
        }
        const data = JSON.parse(rawData);
        res.json(data);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.get('/data/clear', (req, res) => {
    fs.writeFileSync('scrapped_data.json', '[]', 'utf-8');
    res.json({ message: 'scrapped data cleared.' });
});
app.get('/1x/all', async (req, res) => {
    if (isScraping) {
        res.json({ message: 'Scraping is already in progress. Use /stop to stop continuous scraping.' });
        return;
    }

    try {
        const scrapedData = await scrapeAllCategories(0, categories.length - 1);
        const formattedData = formatData(scrapedData);
        // const formattedData = scrapedData;
        writeDataToJSON(formattedData);
        res.json(formattedData);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.get('/1x/:category', async (req, res) => {
    const category = req.params.category;

    try {
        const scrappedData = await scrappedata(category);

        // Format the scraped data
        const formattedData = formatData(scrappedData);

        // Write the formatted data to the JSON file
        const jsonData = JSON.stringify(formattedData, null, 2);
        fs.writeFileSync('scrapped_data.json', jsonData, 'utf-8');

        res.json(formattedData);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.get('/xx/:category', async (req, res) => {
    const category = req.params.category;

    try {
        const scrappedData = await scrappedata(category);
        // Format the scraped data
        const formattedData = formatData(scrappedData);

        // Write the formatted data to the JSON file
        const jsonData = JSON.stringify(formattedData, null, 2);
        fs.writeFileSync('scrapped_data.json', jsonData, 'utf-8');

        res.json(formattedData);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
app.get('/x/:category', async (req, res) => {
    const category = req.params.category;

    try {
        const scrappedData = await scrappedata(category);
        // Format the scraped data
        const formattedData = scrappedData;
        // Write the formatted data to the JSON file
        const jsonData = JSON.stringify(formattedData, null, 2);
        fs.writeFileSync('scrapped_data.json', jsonData, 'utf-8');

        res.json(formattedData);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// const scrapeAndPostData = async () => {
//     if (isScraping) {
//         console.log('Scraping is already in progress. Use /stop to stop continuous scraping.');
//         return;
//     }

//     try {
//         const scrapedData = await scrapeAllCategories(0, categories.length - 1);
//         const formattedData = formatData(scrapedData);
//         writeDataToJSON(formattedData);

//         // Post the data to another endpoint
//         const postData = { data: formattedData }; // Adjust the data format as needed
//         await axios.post('https://limber-scissors-production.up.railway.app/api/live/', postData);

//         console.log('Data has been scraped and posted successfully.');
//     } catch (error) {
//         console.error('Error:', error);
//     }
// };

// // Schedule the scraping and posting to run every 5 minutes (300,000 milliseconds)
// const minutes = 1;
// const scrapingIntervalInMilliseconds = minutes * 60 * 1000;
// setInterval(scrapeAndPostData, scrapingIntervalInMilliseconds);

function formatData(data) {
    // Wrap single data in an array if it's not already an array
    if (!Array.isArray(data)) {
        data = [data];
    }

    const formattedData = [];

    data.forEach((categoryData) => {
        const category = categoryData.category;
        const captionLabels = categoryData.captionLabels;
        const marketValues = categoryData.marketValues;

        let currentSportTitle = null;
        let currentSport = null;
        let currentEvents = [];

        for (let i = 0; i < captionLabels.length; i++) {
            if (captionLabels[i].startsWith("+")) {
                const sportTitle = captionLabels[i - 1];
                const team1 = captionLabels[i + 1];
                const team2 = captionLabels[i + 2];

                const oddsTeam1 = marketValues[i];
                const draw = marketValues[i + 1];
                const oddsTeam2 = marketValues[i + 2];

                if (oddsTeam1 !== "-" && oddsTeam2 !== "-") {
                    if (currentSportTitle !== sportTitle) {
                        // Start a new sport
                        if (currentSport) {
                            currentSport.sports.push({
                                sport_title: currentSportTitle,
                                events: currentEvents,
                            });
                            formattedData.push(currentSport);
                        }
                        currentSportTitle = sportTitle;
                        currentEvents = [];
                        currentSport = {
                            sport_type: category,
                            sports: [],
                        };
                    }

                    // Add event to the current sport
                    currentEvents.push({
                        event: `${team1} vs ${team2}`,
                        odds: [
                            {
                                name: team1,
                                price: convertToAmericanOdds(parseFloat(oddsTeam1)),
                            },
                            {
                                name: "Draw",
                                price: convertToAmericanOdds(parseFloat(draw)),
                            },
                            {
                                name: team2,
                                price: convertToAmericanOdds(parseFloat(oddsTeam2)),
                            },
                        ],
                    });
                }
            }
        }

        if (currentSport) {
            // Add the last sport
            currentSport.sports.push({
                sport_title: currentSportTitle,
                events: currentEvents,
            });
            formattedData.push(currentSport);
        }
    });

    return formattedData;
}


app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
});