const puppeteer = require('puppeteer');
const cheerio = require('cheerio');
const fs = require('fs');
const path = require('path');

class EnhancedNFLScraperWithCSV {
    constructor() {
        this.years = [2019, 2020, 2021, 2022, 2023, 2024];
        this.data = {
            metadata: {
                scrapedAt: new Date().toISOString(),
                years: this.years,
                sources: {
                    superBowl: 'https://en.wikipedia.org/wiki/List_of_Super_Bowl_champions',
                    conferenceStandings: 'https://www.nfl.com/standings/conference/{year}/REG',
                    divisionStandings: 'https://www.nfl.com/standings/division/{year}/REG'
                }
            },
            superBowlWinners: [],
            conferenceStandings: {},
            divisionStandings: {},
            analysis: {}
        };
        this.browser = null;
        this.page = null;
        
        // CSV export settings
        this.csvDirectory = './csv_exports/';
        this.ensureCSVDirectory();
    }

    /**
     * Ensure CSV export directory exists
     */
    ensureCSVDirectory() {
        if (!fs.existsSync(this.csvDirectory)) {
            fs.mkdirSync(this.csvDirectory, { recursive: true });
            console.log(`📁 Created CSV export directory: ${this.csvDirectory}`);
        }
    }

    /**
     * Convert array of objects to CSV string
     */
    arrayToCSV(data, headers) {
        if (!data || data.length === 0) return '';
        
        // Use provided headers or extract from first object
        const csvHeaders = headers || Object.keys(data[0]);
        
        // Create header row
        const headerRow = csvHeaders.map(header => `"${header}"`).join(',');
        
        // Create data rows
        const dataRows = data.map(row => {
            return csvHeaders.map(header => {
                let value = row[header];
                if (value === null || value === undefined) value = '';
                // Escape quotes and wrap in quotes if contains comma or quote
                if (typeof value === 'string' && (value.includes(',') || value.includes('"') || value.includes('\n'))) {
                    value = `"${value.replace(/"/g, '""')}"`;
                } else if (typeof value === 'string') {
                    value = `"${value}"`;
                }
                return value;
            }).join(',');
        });
        
        return [headerRow, ...dataRows].join('\n');
    }

    /**
     * Save CSV file
     */
    saveCSV(filename, csvContent) {
        const filePath = path.join(this.csvDirectory, filename);
        fs.writeFileSync(filePath, csvContent, 'utf8');
        console.log(`💾 CSV saved: ${filename}`);
        return filePath;
    }

    /**
     * Map abbreviated Super Bowl team names to full team names
     */
    mapToFullTeamName(shortName) {
        const teamMappings = {
            'Kansas City': 'Kansas City Chiefs',
            'Buffalo': 'Buffalo Bills',
            'Baltimore': 'Baltimore Ravens',
            'Houston': 'Houston Texans',
            'Pittsburgh': 'Pittsburgh Steelers',
            'Cleveland': 'Cleveland Browns',
            'Cincinnati': 'Cincinnati Bengals',
            'Tennessee': 'Tennessee Titans',
            'Jacksonville': 'Jacksonville Jaguars',
            'Indianapolis': 'Indianapolis Colts',
            'Miami': 'Miami Dolphins',
            'New York Jets': 'New York Jets',
            'Denver': 'Denver Broncos',
            'Las Vegas': 'Las Vegas Raiders',
            'Los Angeles Chargers': 'Los Angeles Chargers',
            'New England': 'New England Patriots',
            'Detroit': 'Detroit Lions',
            'Philadelphia': 'Philadelphia Eagles',
            'Minnesota': 'Minnesota Vikings',
            'Tampa Bay': 'Tampa Bay Buccaneers',
            'Los Angeles Rams': 'Los Angeles Rams',
            'Los Angeles': 'Los Angeles Rams',
            'Green Bay': 'Green Bay Packers',
            'Washington': 'Washington Commanders',
            'Seattle': 'Seattle Seahawks',
            'Atlanta': 'Atlanta Falcons',
            'Arizona': 'Arizona Cardinals',
            'Dallas': 'Dallas Cowboys',
            'San Francisco': 'San Francisco 49ers',
            'San Francisco 49': 'San Francisco 49ers',
            'Chicago': 'Chicago Bears',
            'Carolina': 'Carolina Panthers',
            'New Orleans': 'New Orleans Saints',
            'New York Giants': 'New York Giants'
        };

        return teamMappings[shortName] || shortName;
    }

    async initBrowser() {
        console.log('🚀 Launching browser...');
        this.browser = await puppeteer.launch({
            headless: false,
            defaultViewport: null,
            args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-blink-features=AutomationControlled'],
            userDataDir: './tmp'
        });
        this.page = await this.browser.newPage();
        await this.page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
        await this.page.setExtraHTTPHeaders({
            'Accept-Language': 'en-US,en;q=0.9'
        });
    }

    async closeBrowser() {
        if (this.browser) {
            await this.browser.close();
        }
    }

    /**
     * Scrape Super Bowl winners from Wikipedia
     */
    async scrapeSuperBowlWinners() {
        console.log('\n🏆 Scraping Super Bowl winners from Wikipedia...');
        
        try {
            await this.page.goto('https://en.wikipedia.org/wiki/List_of_Super_Bowl_champions', {
                waitUntil: 'networkidle2',
                timeout: 30000
            });

            const content = await this.page.content();
            const $ = cheerio.load(content);

            const table = $('table').eq(1);
            console.log('📊 Processing Super Bowl results...');
            
            table.find('tr').each((i, row) => {
                if (i === 0) return; // Skip header row
                
                const cells = $(row).find('td');
                if (cells.length >= 5) {
                    const romanNumeral = $(cells[0]).text().trim();
                    const dateText = $(cells[1]).text().trim();
                    const winnerText = $(cells[2]).text().trim();
                    const score = $(cells[3]).text().trim();
                    const loserText = $(cells[4]).text().trim();

                    const yearMatch = dateText.match(/\((\d{4})/);
                    if (yearMatch) {
                        const year = parseInt(yearMatch[1]);
                        
                        if (this.years.includes(year)) {
                            const winnerRaw = winnerText.replace(/[a-zA-Z]*\([^)]*\)/g, '').replace(/\[[^\]]*\]/g, '').trim();
                            const loserRaw = loserText.replace(/[a-zA-Z]*\([^)]*\)/g, '').replace(/\[[^\]]*\]/g, '').trim();
                            
                            const winner = this.mapToFullTeamName(winnerRaw);
                            const loser = this.mapToFullTeamName(loserRaw);

                            const superBowlEntry = {
                                year: year,
                                superBowl: romanNumeral.replace(/\[[^\]]*\]/g, ''),
                                date: dateText,
                                winner: winner,
                                loser: loser,
                                score: score,
                                season: `${year - 1}-${year}`
                            };

                            this.data.superBowlWinners.push(superBowlEntry);
                            console.log(`   ✓ ${year}: ${winner} beat ${loser} (${score})`);
                        }
                    }
                }
            });

            console.log(`🎯 Found ${this.data.superBowlWinners.length} Super Bowl winners for target years`);
            
        } catch (error) {
            console.error('❌ Error scraping Super Bowl data:', error.message);
        }
    }

    /**
     * Scrape NFL conference standings for a specific year
     */
    async scrapeNFLStandingsForYear(year) {
        console.log(`\n🏈 Scraping ${year} NFL standings from multiple sources...`);
        
        // Try multiple sources for comprehensive data
        let standings = await this.scrapeWikipediaStandings(year);
        
        if (!standings || standings.afc.length === 0 || standings.nfc.length === 0) {
            console.log(`⚠️ Wikipedia incomplete for ${year}, trying NFL.com...`);
            standings = await this.scrapeNFLStandingsFromNFLCom(year);
        }
        
        if (!standings || standings.afc.length === 0 || standings.nfc.length === 0) {
            console.log(`⚠️ NFL.com incomplete for ${year}, trying Pro Football Reference...`);
            standings = await this.scrapeProFootballReference(year);
        }
        
        // Ensure all Super Bowl winners are included
        standings = await this.ensureSuperBowlWinnerIncluded(year, standings);
        
        console.log(`✅ Found ${standings.afc.length} AFC teams and ${standings.nfc.length} NFC teams for ${year}`);
        return standings;
    }

    async scrapeWikipediaStandings(year) {
        try {
            console.log(`� Trying Wikipedia for ${year}...`);
            const url = `https://en.wikipedia.org/wiki/${year}_NFL_season`;
            
            await this.page.goto(url, {
                waitUntil: 'networkidle0',
                timeout: 30000
            });

            const standings = await this.page.evaluate((currentYear) => {
                const data = {
                    year: currentYear,
                    afc: [],
                    nfc: [],
                    scrapingMethod: 'wikipedia-extraction'
                };

                // Look for standings tables
                const tables = document.querySelectorAll('table.wikitable');
                
                tables.forEach(table => {
                    const caption = table.querySelector('caption')?.textContent?.toLowerCase() || '';
                    const prevHeading = table.previousElementSibling?.textContent?.toLowerCase() || '';
                    
                    if (caption.includes('standings') || prevHeading.includes('standings') || 
                        caption.includes('afc') || caption.includes('nfc')) {
                        
                        const conference = caption.includes('afc') || prevHeading.includes('afc') ? 'afc' : 'nfc';
                        
                        const rows = table.querySelectorAll('tbody tr');
                        rows.forEach((row, index) => {
                            const cells = row.querySelectorAll('td');
                            if (cells.length >= 4) {
                                const teamLink = cells[0].querySelector('a');
                                let teamName = teamLink ? teamLink.textContent.trim() : cells[0].textContent.trim();
                                
                                // Clean team name
                                teamName = teamName.replace(/^\d+\.\s*/, '').replace(/\s*\([^)]*\)/, '').replace(/\s*[*†]+$/, '').trim();
                                
                                if (teamName && teamName.length > 2) {
                                    const wins = parseInt(cells[1]?.textContent) || 0;
                                    const losses = parseInt(cells[2]?.textContent) || 0;
                                    const ties = parseInt(cells[3]?.textContent) || 0;
                                    
                                    const teamData = {
                                        team: teamName,
                                        wins: wins,
                                        losses: losses,
                                        ties: ties,
                                        winPct: wins / (wins + losses + ties),
                                        source: 'wikipedia'
                                    };
                                    
                                    data[conference].push(teamData);
                                }
                            }
                        });
                    }
                });

                return data;
            }, year);

            return standings;
        } catch (error) {
            console.log(`❌ Wikipedia scraping failed for ${year}:`, error.message);
            return { year: year, afc: [], nfc: [], scrapingMethod: 'wikipedia-failed' };
        }
    }

    async scrapeProFootballReference(year) {
        try {
            console.log(`� Trying Pro Football Reference for ${year}...`);
            const url = `https://www.pro-football-reference.com/years/${year}/`;
            
            await this.page.goto(url, {
                waitUntil: 'networkidle0',
                timeout: 30000
            });

            const standings = await this.page.evaluate((currentYear) => {
                const data = {
                    year: currentYear,
                    afc: [],
                    nfc: [],
                    scrapingMethod: 'pro-football-reference'
                };

                // Look for AFC and NFC standings tables
                ['AFC', 'NFC'].forEach(conference => {
                    const table = document.querySelector(`#${conference.toLowerCase()}`);
                    if (table) {
                        const rows = table.querySelectorAll('tbody tr');
                        rows.forEach(row => {
                            const cells = row.querySelectorAll('td');
                            if (cells.length >= 3) {
                                const teamLink = cells[0].querySelector('a');
                                const teamName = teamLink ? teamLink.textContent.trim() : cells[0].textContent.trim();
                                
                                if (teamName) {
                                    const wins = parseInt(cells[1]?.textContent) || 0;
                                    const losses = parseInt(cells[2]?.textContent) || 0;
                                    const ties = parseInt(cells[3]?.textContent) || 0;
                                    
                                    data[conference.toLowerCase()].push({
                                        team: teamName,
                                        wins: wins,
                                        losses: losses,
                                        ties: ties,
                                        winPct: wins / (wins + losses + ties),
                                        source: 'pro-football-reference'
                                    });
                                }
                            }
                        });
                    }
                });

                return data;
            }, year);

            return standings;
        } catch (error) {
            console.log(`❌ Pro Football Reference scraping failed for ${year}:`, error.message);
            return { year: year, afc: [], nfc: [], scrapingMethod: 'pfr-failed' };
        }
    }

    async scrapeNFLStandingsFromNFLCom(year) {
        try {
            console.log(`🏈 Trying NFL.com for ${year}...`);
            const url = `https://www.nfl.com/standings/conference/${year}/REG`;
            
            await this.page.goto(url, {
                waitUntil: 'networkidle0',
                timeout: 45000
            });

            // Wait for dynamic content to load - reduced delay
            await this.page.waitForSelector('table, .standings-table', { timeout: 10000 });
            
            // Try to find and click any cookie/consent banners
            try {
                const cookieButton = await this.page.$('button[aria-label*="Accept"], button:contains("Accept"), .accept-cookies');
                if (cookieButton) {
                    await cookieButton.click();
                    await this.page.waitForTimeout(500); // Minimal delay
                }
            } catch (e) {
                // Ignore cookie banner errors
            }

            // Extract standings data with all available columns
            const standings = await this.page.evaluate((currentYear) => {
                const data = {
                    year: currentYear,
                    afc: [],
                    nfc: [],
                    scrapingMethod: 'nfl-com-extraction'
                };

                // Helper function to clean team names
                function cleanTeamName(text) {
                    const teamMappings = {
                        'Kansas City': 'Kansas City Chiefs',
                        'Buffalo': 'Buffalo Bills',
                        'Baltimore': 'Baltimore Ravens',
                        'Houston': 'Houston Texans',
                        'Pittsburgh': 'Pittsburgh Steelers',
                        'Cleveland': 'Cleveland Browns',
                        'Cincinnati': 'Cincinnati Bengals',
                        'Tennessee': 'Tennessee Titans',
                        'Jacksonville': 'Jacksonville Jaguars',
                        'Indianapolis': 'Indianapolis Colts',
                        'Miami': 'Miami Dolphins',
                        'New York Jets': 'New York Jets',
                        'Denver': 'Denver Broncos',
                        'Las Vegas': 'Las Vegas Raiders',
                        'Los Angeles Chargers': 'Los Angeles Chargers',
                        'New England': 'New England Patriots',
                        'Detroit': 'Detroit Lions',
                        'Philadelphia': 'Philadelphia Eagles',
                        'Minnesota': 'Minnesota Vikings',
                        'Tampa Bay': 'Tampa Bay Buccaneers',
                        'Los Angeles Rams': 'Los Angeles Rams',
                        'Green Bay': 'Green Bay Packers',
                        'Washington': 'Washington Commanders',
                        'Seattle': 'Seattle Seahawks',
                        'Atlanta': 'Atlanta Falcons',
                        'Arizona': 'Arizona Cardinals',
                        'Dallas': 'Dallas Cowboys',
                        'San Francisco': 'San Francisco 49ers',
                        'Chicago': 'Chicago Bears',
                        'Carolina': 'Carolina Panthers',
                        'New Orleans': 'New Orleans Saints',
                        'New York Giants': 'New York Giants'
                    };

                    for (const [key, fullName] of Object.entries(teamMappings)) {
                        if (text.includes(key)) {
                            return fullName;
                        }
                    }
                    return text.replace(/Go to|info page\.|\.$/g, '').replace(/\n/g, ' ').replace(/\s+/g, ' ').replace(/x[yz*]*\s*/g, '').trim();
                }

                // Helper function to parse numeric values
                function parseNumeric(text) {
                    if (!text || text === '-') return 0;
                    const cleaned = text.replace(/[^\d.-]/g, '');
                    const parsed = parseFloat(cleaned);
                    return isNaN(parsed) ? 0 : parsed;
                }

                // Helper function to parse percentage values
                function parsePercentage(text) {
                    if (!text || text === '-') return 0;
                    const cleaned = text.replace(/[^\d.]/g, '');
                    const parsed = parseFloat(cleaned);
                    return isNaN(parsed) ? 0 : parsed / 100;
                }

                // Look for team data in tables - try multiple selectors
                const selectors = [
                    'table tbody tr',
                    '.nfl-c-standings-table tbody tr',
                    '[data-testid="standings-table"] tbody tr',
                    '.standings-table tbody tr'
                ];

                let headerColumns = [];
                
                for (const selector of selectors) {
                    const table = document.querySelector(selector.replace(' tbody tr', ''));
                    const rows = document.querySelectorAll(selector);
                    
                    if (table && rows.length > 0) {
                        // First, get the header columns to understand what data is available
                        const headerRow = table.querySelector('thead tr, tr');
                        if (headerRow) {
                            const headers = headerRow.querySelectorAll('th, td');
                            headerColumns = Array.from(headers).map(h => h.textContent.trim().toLowerCase());
                            console.log('Found table headers:', headerColumns);
                        }
                        
                        rows.forEach((row, index) => {
                            const cells = row.querySelectorAll('td, th');
                            if (cells.length >= 4) {
                                const teamText = cells[0].textContent.trim();
                                const teamName = cleanTeamName(teamText);
                                
                                if (teamName && teamName.length > 3) {
                                    // Base team data - only extract what's actually in NFL.com table
                                    const teamData = {
                                        team: teamName,
                                        wins: parseNumeric(cells[1]?.textContent),
                                        losses: parseNumeric(cells[2]?.textContent),
                                        ties: parseNumeric(cells[3]?.textContent),
                                        source: 'nfl-com'
                                    };

                                    // Add winPct from table or calculate it
                                    const totalGames = teamData.wins + teamData.losses + teamData.ties;
                                    teamData.winPct = totalGames > 0 ? teamData.wins / totalGames : 0;

                                    // Only extract columns that are actually present in NFL.com standings table
                                    if (cells.length > 4) {
                                        // PCT column (index 4)
                                        if (cells[4]) teamData.pct = parsePercentage(cells[4].textContent);
                                        
                                        // PF - Points For (index 5)
                                        if (cells[5]) teamData.pointsFor = parseNumeric(cells[5].textContent);
                                        
                                        // PA - Points Against (index 6)  
                                        if (cells[6]) teamData.pointsAgainst = parseNumeric(cells[6].textContent);
                                        
                                        // Net Points (index 7)
                                        if (cells[7]) {
                                            teamData.netPoints = parseNumeric(cells[7].textContent);
                                        } else if (teamData.pointsFor && teamData.pointsAgainst) {
                                            teamData.netPoints = teamData.pointsFor - teamData.pointsAgainst;
                                        }
                                        
                                        // Home record (index 8) - keep as string only
                                        if (cells[8]) {
                                            const homeText = cells[8].textContent.trim();
                                            teamData.homeRecord = homeText;
                                        }
                                        
                                        // Road record (index 9) - keep as string only
                                        if (cells[9]) {
                                            const roadText = cells[9].textContent.trim();
                                            teamData.roadRecord = roadText;
                                        }
                                        
                                        // Division record (index 10) - keep as string only
                                        if (cells[10]) {
                                            const divText = cells[10].textContent.trim();
                                            teamData.divisionRecord = divText;
                                        }
                                        
                                        // Conference record (index 11) - keep as string only
                                        if (cells[11]) {
                                            const confText = cells[11].textContent.trim();
                                            teamData.conferenceRecord = confText;
                                        }
                                        
                                        // Non-Conference record (index 12) - keep as string only
                                        if (cells[12]) {
                                            const nonConfText = cells[12].textContent.trim();
                                            teamData.nonConferenceRecord = nonConfText;
                                        }
                                        
                                        // Streak (index 13)
                                        if (cells[13]) {
                                            teamData.streak = cells[13].textContent.trim();
                                        }
                                        
                                        // Last 5 games (index 14) - keep as string only
                                        if (cells[14]) {
                                            const last5Text = cells[14].textContent.trim();
                                            teamData.last5 = last5Text;
                                        }
                                    }
                                    
                                    // Determine conference - try to identify from page context or position
                                    let conference = 'nfc'; // default
                                    
                                    // Try to determine conference from page structure
                                    const pageText = document.body.textContent.toLowerCase();
                                    if (pageText.includes('afc')) {
                                        // Look for AFC teams
                                        const afcTeams = ['kansas city chiefs', 'buffalo bills', 'baltimore ravens', 'houston texans', 
                                                         'pittsburgh steelers', 'cleveland browns', 'cincinnati bengals', 'tennessee titans',
                                                         'jacksonville jaguars', 'indianapolis colts', 'miami dolphins', 'new york jets',
                                                         'denver broncos', 'las vegas raiders', 'los angeles chargers', 'new england patriots'];
                                        if (afcTeams.includes(teamName.toLowerCase())) {
                                            conference = 'afc';
                                        }
                                    }
                                    
                                    data[conference].push(teamData);
                                }
                            }
                        });
                        break; // If we found data, stop trying other selectors
                    }
                }

                // Add metadata about what columns were found
                data.availableColumns = headerColumns;
                console.log(`Extracted ${data.afc.length} AFC teams and ${data.nfc.length} NFC teams with columns:`, headerColumns.slice(0, 10));
                
                return data;
            }, year);

            return standings;
        } catch (error) {
            console.log(`❌ NFL.com scraping failed for ${year}:`, error.message);
            return { year: year, afc: [], nfc: [], scrapingMethod: 'nfl-com-failed' };
        }
    }

    async ensureSuperBowlWinnerIncluded(year, standings) {
        // Find the Super Bowl winner for this year
        const superBowlWinner = this.data.superBowlWinners.find(sb => sb.year == year);
        
        if (superBowlWinner) {
            const winnerName = superBowlWinner.winner;
            
            // Check if winner exists in AFC or NFC
            const afcWinner = standings.afc.find(team => team.team === winnerName);
            const nfcWinner = standings.nfc.find(team => team.team === winnerName);
            
            if (!afcWinner && !nfcWinner) {
                console.log(`⚠️ Super Bowl winner ${winnerName} missing from ${year} standings, adding manually...`);
                
                // Add the missing Super Bowl winner
                // Default to NFC, but you could enhance this logic
                const conference = winnerName.includes('Kansas City') || winnerName.includes('Buffalo') || 
                                  winnerName.includes('Pittsburgh') || winnerName.includes('Baltimore') ? 'afc' : 'nfc';
                
                standings[conference].push({
                    team: winnerName,
                    wins: 0, // Would need to scrape actual stats
                    losses: 0,
                    ties: 0,
                    winPct: 0,
                    source: 'superbowl-winner-manual-addition',
                    note: 'Added because missing from scraped data'
                });
                
                console.log(`✅ Added ${winnerName} to ${conference.toUpperCase()} standings`);
            }
        }
        
        return standings;
    }

    /**
     * Scrape all NFL conference standings
     */
    async scrapeAllNFLStandings() {
        console.log('\n📈 Scraping NFL conference standings for all years...');
        
        for (const year of this.years) {
            const standings = await this.scrapeNFLStandingsForYear(year);
            this.data.conferenceStandings[year] = standings;
            
            // No delay between requests for faster processing
            console.log(`✅ Completed scraping for ${year}`);
        }

        // Now scrape division standings
        await this.scrapeAllDivisionStandings();
    }

    /**
     * Scrape division standings for a specific year
     */
    async scrapeDivisionStandingsForYear(year) {
        console.log(`\n🏈 Scraping ${year} NFL division standings from NFL.com...`);
        
        try {
            const url = `https://www.nfl.com/standings/division/${year}/REG`;
            console.log(`📊 Loading: ${url}`);
            
            await this.page.goto(url, {
                waitUntil: 'networkidle0',
                timeout: 45000
            });

            // Wait for dynamic content to load - reduced delay
            await this.page.waitForSelector('table, .standings-table', { timeout: 10000 });
            
            console.log('🔍 Extracting division standings data...');
            
            // Extract division standings data with the same detailed approach as original
            const divisionStandings = await this.page.evaluate((currentYear) => {
                const data = {
                    year: currentYear,
                    divisions: {
                        afcEast: [],
                        afcNorth: [],
                        afcSouth: [],
                        afcWest: [],
                        nfcEast: [],
                        nfcNorth: [],
                        nfcSouth: [],
                        nfcWest: []
                    }
                };

                function cleanTeamName(text) {
                    return text
                        .replace(/Go to|info page\.|\.$/g, '')
                        .replace(/\n/g, ' ')
                        .replace(/\s+/g, ' ')
                        .replace(/x[yz*]*\s*/g, '')
                        .trim();
                }

                function getDivision(teamName) {
                    const cleanName = teamName.toLowerCase();
                    
                    const divisions = {
                        afcEast: ['bills', 'dolphins', 'patriots', 'jets'],
                        afcNorth: ['ravens', 'bengals', 'browns', 'steelers'],
                        afcSouth: ['texans', 'colts', 'jaguars', 'titans'],
                        afcWest: ['chiefs', 'chargers', 'raiders', 'broncos'],
                        nfcEast: ['cowboys', 'giants', 'eagles', 'washington', 'commanders'],
                        nfcNorth: ['packers', 'lions', 'bears', 'vikings'],
                        nfcSouth: ['saints', 'falcons', 'panthers', 'buccaneers'],
                        nfcWest: ['49ers', 'seahawks', 'rams', 'cardinals']
                    };

                    for (const [division, teams] of Object.entries(divisions)) {
                        if (teams.some(team => cleanName.includes(team))) {
                            return division;
                        }
                    }
                    return 'unknown';
                }

                function parseRecord(recordStr) {
                    if (!recordStr || typeof recordStr !== 'string') return { wins: 0, losses: 0, ties: 0 };
                    const parts = recordStr.split('-').map(p => parseInt(p.trim()) || 0);
                    return {
                        wins: parts[0] || 0,
                        losses: parts[1] || 0,
                        ties: parts[2] || 0
                    };
                }

                const tables = document.querySelectorAll('table');
                const teamData = [];

                tables.forEach((table, tableIndex) => {
                    const rows = table.querySelectorAll('tr');
                    
                    rows.forEach((row, rowIndex) => {
                        const cells = row.querySelectorAll('td, th');
                        
                        if (cells.length >= 6) {
                            const cellTexts = Array.from(cells).map(cell => cell.textContent.trim());
                            
                            const hasTeamPattern = cellTexts.some(text => 
                                ['Chiefs', 'Bills', 'Patriots', 'Cowboys', 'Packers', '49ers', 'Eagles', 'Ravens', 'Steelers'].some(team => text.includes(team))
                            );
                            
                            if (hasTeamPattern) {
                                const numbers = cellTexts.filter(text => /^\d+$/.test(text) && parseInt(text) <= 17);
                                
                                if (numbers.length >= 2) {
                                    const teamName = cleanTeamName(cellTexts[0]);
                                    const division = getDivision(teamName);
                                    
                                    const teamRecord = {
                                        team: teamName,
                                        wins: parseInt(numbers[0]) || 0,
                                        losses: parseInt(numbers[1]) || 0,
                                        ties: numbers.length > 2 ? parseInt(numbers[2]) || 0 : 0,
                                        winPct: numbers.length > 3 ? parseFloat(`0.${numbers[3]}`) || 0 : 0,
                                        pointsFor: parseInt(cellTexts[5]) || 0,
                                        pointsAgainst: parseInt(cellTexts[6]) || 0,
                                        pointDifferential: (parseInt(cellTexts[5]) || 0) - (parseInt(cellTexts[6]) || 0),
                                        homeRecord: cellTexts[8] ? parseRecord(cellTexts[8]) : { wins: 0, losses: 0, ties: 0 },
                                        roadRecord: cellTexts[9] ? parseRecord(cellTexts[9]) : { wins: 0, losses: 0, ties: 0 },
                                        divisionRecord: cellTexts[10] ? parseRecord(cellTexts[10]) : { wins: 0, losses: 0, ties: 0 },
                                        conferenceRecord: cellTexts[11] ? parseRecord(cellTexts[11]) : { wins: 0, losses: 0, ties: 0 },
                                        currentStreak: cellTexts[13] || '',
                                        lastFiveGames: cellTexts[14] ? parseRecord(cellTexts[14]) : { wins: 0, losses: 0, ties: 0 },
                                        division: division,
                                        isDivisionLeader: false,
                                        rawData: cellTexts
                                    };

                                    teamData.push(teamRecord);
                                    
                                    if (data.divisions[division]) {
                                        data.divisions[division].push(teamRecord);
                                    }
                                }
                            }
                        }
                    });
                });

                // Sort divisions and mark leaders
                Object.keys(data.divisions).forEach(division => {
                    data.divisions[division].sort((a, b) => {
                        if (b.wins !== a.wins) return b.wins - a.wins;
                        if (b.winPct !== a.winPct) return b.winPct - a.winPct;
                        return (b.pointDifferential || 0) - (a.pointDifferential || 0);
                    });
                    
                    if (data.divisions[division].length > 0) {
                        data.divisions[division][0].isDivisionLeader = true;
                    }
                });

                return data;

            }, year);

            console.log(`✅ ${year} division standings extracted`);
            return divisionStandings;

        } catch (error) {
            console.error(`❌ Error scraping ${year} division standings:`, error.message);
            return { year: year, divisions: {}, error: error.message };
        }
    }

    /**
     * Scrape all division standings
     */
    async scrapeAllDivisionStandings() {
        console.log('\n📈 Scraping NFL division standings for all years...');
        
        for (const year of this.years) {
            const divisionStandings = await this.scrapeDivisionStandingsForYear(year);
            this.data.divisionStandings[year] = divisionStandings;
            
            // No delay for faster processing
            console.log(`✅ Completed division standings for ${year}`);
        }
    }

    /**
     * Export Super Bowl data to CSV
     */
    exportSuperBowlCSV() {
        console.log('\n📋 Exporting Super Bowl data to CSV...');
        
        if (this.data.superBowlWinners.length === 0) {
            console.log('⚠️ No Super Bowl data to export');
            return;
        }

        const csvContent = this.arrayToCSV(this.data.superBowlWinners, [
            'year', 'superBowl', 'date', 'winner', 'loser', 'score', 'season'
        ]);

        this.saveCSV('superbowl_winners.csv', csvContent);
        console.log(`✅ Exported ${this.data.superBowlWinners.length} Super Bowl records to CSV`);
    }

    /**
     * Export team standings to CSV (enhanced with both conference and division data)
     */
    exportTeamStandingsCSV() {
        console.log('\n📋 Exporting team standings to CSV...');
        
        const allTeamData = [];
        
        // Process conference standings
        Object.entries(this.data.conferenceStandings).forEach(([year, yearData]) => {
            ['afc', 'nfc'].forEach(conference => {
                if (yearData[conference]) {
                    yearData[conference].forEach((team, index) => {
                        allTeamData.push({
                            year: parseInt(year),
                            conference: conference.toUpperCase(),
                            conference_rank: index + 1,
                            team: team.team,
                            wins: team.wins,
                            losses: team.losses,
                            ties: team.ties,
                            win_percentage: team.winPct,
                            points_for: team.pointsFor,
                            points_against: team.pointsAgainst,
                            net_points: team.netPoints,
                            point_differential: team.pointDifferential,
                            home_wins: team.homeRecord?.wins || 0,
                            home_losses: team.homeRecord?.losses || 0,
                            road_wins: team.roadRecord?.wins || 0,
                            road_losses: team.roadRecord?.losses || 0,
                            division_wins: team.divisionRecord?.wins || 0,
                            division_losses: team.divisionRecord?.losses || 0,
                            conference_wins: team.conferenceRecord?.wins || 0,
                            conference_losses: team.conferenceRecord?.losses || 0,
                            home_win_pct: team.homeWinPct,
                            road_win_pct: team.roadWinPct,
                            division_win_pct: team.divisionWinPct,
                            conference_win_pct: team.conferenceWinPct,
                            current_streak: team.currentStreak,
                            average_points_for: team.averagePointsFor,
                            average_points_against: team.averagePointsAgainst,
                            strong_finish: team.strongFinish,
                            is_on_win_streak: team.isOnWinStreak,
                            is_on_loss_streak: team.isOnLossStreak,
                            data_source: 'conference_standings'
                        });
                    });
                }
            });
        });

        // Process division standings data
        Object.entries(this.data.divisionStandings).forEach(([year, yearData]) => {
            Object.entries(yearData.divisions || {}).forEach(([divisionName, teams]) => {
                teams.forEach((team, index) => {
                    // Check if this team is already in the data (from conference standings)
                    const existingTeam = allTeamData.find(t => 
                        t.year === parseInt(year) && t.team === team.team
                    );
                    
                    if (existingTeam) {
                        // Add division-specific data to existing team
                        existingTeam.division = divisionName;
                        existingTeam.division_rank = index + 1;
                        existingTeam.is_division_leader = team.isDivisionLeader || false;
                        existingTeam.data_source = 'both_sources';
                    } else {
                        // Add as new team (division data only)
                        allTeamData.push({
                            year: parseInt(year),
                            division: divisionName,
                            division_rank: index + 1,
                            team: team.team,
                            wins: team.wins,
                            losses: team.losses,
                            ties: team.ties,
                            win_percentage: team.winPct,
                            points_for: team.pointsFor,
                            points_against: team.pointsAgainst,
                            point_differential: team.pointDifferential,
                            home_record: team.homeRecord ? `${team.homeRecord.wins}-${team.homeRecord.losses}-${team.homeRecord.ties}` : '',
                            road_record: team.roadRecord ? `${team.roadRecord.wins}-${team.roadRecord.losses}-${team.roadRecord.ties}` : '',
                            division_record: team.divisionRecord ? `${team.divisionRecord.wins}-${team.divisionRecord.losses}-${team.divisionRecord.ties}` : '',
                            conference_record: team.conferenceRecord ? `${team.conferenceRecord.wins}-${team.conferenceRecord.losses}-${team.conferenceRecord.ties}` : '',
                            current_streak: team.currentStreak,
                            last_five_games: team.lastFiveGames ? `${team.lastFiveGames.wins}-${team.lastFiveGames.losses}-${team.lastFiveGames.ties}` : '',
                            is_division_leader: team.isDivisionLeader || false,
                            data_source: 'division_standings'
                        });
                    }
                });
            });
        });

        if (allTeamData.length > 0) {
            const csvContent = this.arrayToCSV(allTeamData);
            this.saveCSV('nfl_comprehensive_standings.csv', csvContent);
            console.log(`✅ Exported ${allTeamData.length} team records to CSV`);
        } else {
            console.log('⚠️ No team standings data to export');
        }
    }

    /**
     * Export enhanced analysis data to CSV
     */
    exportAnalysisCSV() {
        console.log('\n📋 Exporting analysis data to CSV...');
        
        if (!this.data.analysis.summary) {
            console.log('⚠️ No analysis data to export');
            return;
        }

        // Export summary analysis
        const summaryCSV = this.arrayToCSV(this.data.analysis.summary, [
            'year', 'winner', 'rank', 'record', 'pointsFor', 'pointDifferential', 
            'homeRecord', 'roadRecord', 'isDivisionLeader'
        ]);
        this.saveCSV('superbowl_analysis.csv', summaryCSV);

        // Export patterns analysis if available
        if (this.data.analysis.patterns) {
            const patterns = this.data.analysis.patterns;
            const patternsData = [{
                total_superbowls: patterns.totalSuperBowls,
                top_seed_wins: patterns.topSeedWins,
                wild_card_wins: patterns.wildCardWins,
                division_winners_count: patterns.divisionWinnersCount,
                strong_finish_count: patterns.strongFinishCount,
                average_regular_season_rank: patterns.averageRegularSeasonRank,
                average_points_for: patterns.averagePointsFor,
                average_points_against: patterns.averagePointsAgainst,
                average_point_differential: patterns.averagePointDifferential,
                home_wins: patterns.homeRecordAnalysis?.wins || 0,
                home_losses: patterns.homeRecordAnalysis?.losses || 0,
                home_win_pct: patterns.homeRecordAnalysis?.winPct || 0,
                road_wins: patterns.roadRecordAnalysis?.wins || 0,
                road_losses: patterns.roadRecordAnalysis?.losses || 0,
                road_win_pct: patterns.roadRecordAnalysis?.winPct || 0
            }];

            const patternsCSV = this.arrayToCSV(patternsData);
            this.saveCSV('superbowl_patterns.csv', patternsCSV);
        }

        console.log('✅ Analysis data exported to CSV');
    }

    /**
     * Export all data to ONE comprehensive CSV file for easier analysis
     */
    exportAllToCSV() {
        console.log('\n🎯 EXPORTING ONLY NFL.COM TABLE PARAMETERS + YEAR_WINNER TO CSV');
        console.log('=' * 60);
        
        try {
            // Create simplified dataset with only NFL.com table parameters
            const masterData = [];
            const processedTeams = new Set(); // Track processed teams to avoid duplicates
            
            // Process all teams from conference standings with ONLY NFL.com table parameters
            Object.entries(this.data.conferenceStandings || {}).forEach(([year, yearData]) => {
                ['afc', 'nfc'].forEach(conference => {
                    if (yearData[conference]) {
                        yearData[conference].forEach((team, index) => {
                            // Track this team as processed
                            processedTeams.add(`${year}-${team.team}`);
                            
                            // Check if this team won the Super Bowl this year
                            const superBowlWinner = this.data.superBowlWinners.find(sb => 
                                sb.year == year && sb.winner === team.team
                            );
                            
                            // Get the Super Bowl winner for this year
                            const yearWinner = this.data.superBowlWinners.find(sb => sb.year == year);
                            const year_winner_name = yearWinner ? yearWinner.winner : '';
                            
                            // Only include parameters actually present in NFL.com standings table
                            const teamRecord = {
                                year: parseInt(year),
                                team: team.team,
                                conference: conference.toUpperCase(),
                                wins: team.wins || 0,
                                losses: team.losses || 0,
                                ties: team.ties || 0,
                                winPct: team.winPct || 0,
                                pct: team.pct || team.winPct || 0,
                                pointsFor: team.pointsFor || 0,
                                pointsAgainst: team.pointsAgainst || 0,
                                netPoints: team.netPoints || 0,
                                homeRecord: team.homeRecord || '',
                                roadRecord: team.roadRecord || '',
                                divisionRecord: team.divisionRecord || '',
                                conferenceRecord: team.conferenceRecord || '',
                                nonConferenceRecord: team.nonConferenceRecord || '',
                                streak: team.streak || '',
                                last5: team.last5 || '',
                                year_winner: superBowlWinner ? 1 : 0,
                                year_winner_name: year_winner_name
                            };
                            
                            masterData.push(teamRecord);
                        });
                    }
                });
            });

            // Ensure all Super Bowl winners are included
            this.ensureSuperBowlWinnersIncluded(masterData, processedTeams);

            // Sort by year, then by conference, then by wins
            masterData.sort((a, b) => {
                if (a.year !== b.year) return a.year - b.year;
                if (a.conference !== b.conference) return a.conference.localeCompare(b.conference);
                return b.wins - a.wins;
            });

            if (masterData.length > 0) {
                // Clean the data by removing columns with only undefined/NaN/empty values
                const cleanedData = this.cleanCSVData(masterData);
                
                const masterCSV = this.arrayToCSV(cleanedData);
                this.saveCSV('NFL_COMPLETE_ANALYSIS.csv', masterCSV);
                
                console.log('\n🎉 SIMPLIFIED CSV FILE CREATED WITH ONLY NFL.COM TABLE PARAMETERS!');
                console.log(`📁 File: ${this.csvDirectory}NFL_COMPLETE_ANALYSIS.csv`);
                console.log(`📊 Total Records: ${cleanedData.length}`);
                
                // Show summary stats
                const years = [...new Set(cleanedData.map(t => t.year))];
                const superBowlWinners = cleanedData.filter(t => t.year_winner === 1);
                
                console.log(`\n📈 DATA SUMMARY:`);
                console.log(`   Years: ${years.join(', ')}`);
                console.log(`   Teams: ${[...new Set(cleanedData.map(t => t.team))].length}`);
                console.log(`   Super Bowl Winners: ${superBowlWinners.length}`);
                console.log(`   Total Columns: ${Object.keys(cleanedData[0]).length}`);
                
                console.log(`\n🏆 SUPER BOWL WINNERS IN FILE:`);
                superBowlWinners.forEach(winner => {
                    console.log(`   ${winner.year}: ${winner.team} (${winner.wins}-${winner.losses}, ${winner.netPoints > 0 ? '+' : ''}${winner.netPoints} net pts)`);
                });
                
                console.log(`\n🎯 CSV CONTAINS ONLY NFL.COM PARAMETERS:`);
                console.log(`   • Team, Year, Conference`);
                console.log(`   • Wins, Losses, Ties, Win PCT`);
                console.log(`   • Points For, Points Against, Net Points`);
                console.log(`   • Home Record, Road Record`);
                console.log(`   • Division Record, Conference Record, Non-Conference Record`);
                console.log(`   • Streak, Last 5 Games`);
                console.log(`   • year_winner (1 if Super Bowl winner, 0 if not)`);
                console.log(`   • year_winner_name (name of Super Bowl winner for each year)`);
                console.log(`   • NO derived statistics or calculated fields`);
                
            } else {
                console.log('⚠️ No data to export');
            }
            
        } catch (error) {
            console.error('❌ Error during CSV export:', error.message);
        }
    }

    /**
     * Ensure Super Bowl winners are included in the CSV export
     */
    ensureSuperBowlWinnersIncluded(masterData, processedTeams) {
        // CRITICAL FIX: Ensure all Super Bowl winners are included even if missing from standings
        console.log('\n🔍 Checking for missing Super Bowl winners...');
        
        this.data.superBowlWinners.forEach(sb => {
            const teamKey = `${sb.year}-${sb.winner}`;
            
            if (!processedTeams.has(teamKey)) {
                console.log(`⚠️ MISSING Super Bowl winner found: ${sb.winner} (${sb.year}) - Adding manually`);
                
                // Create a simplified record for the missing Super Bowl winner with NFL.com table parameters
                const missingWinnerRecord = {
                    year: parseInt(sb.year),
                    team: sb.winner,
                    conference: sb.winner.includes('Chiefs') || sb.winner.includes('Bills') || 
                               sb.winner.includes('Ravens') || sb.winner.includes('Steelers') || 
                               sb.winner.includes('Bengals') || sb.winner.includes('Patriots') ? 'AFC' : 'NFC',
                    wins: 0,
                    losses: 0,
                    ties: 0, 
                    winPct: 0,
                    pointsFor: 0,
                    pointsAgainst: 0,
                    netPoints: 0,
                    homeRecord: '',
                    roadRecord: '',
                    divisionRecord: '',
                    conferenceRecord: '',
                    nonConferenceRecord: '',
                    streak: '',
                    last5: '',
                    year_winner: 1,
                    year_winner_name: sb.winner
                };
                
                masterData.push(missingWinnerRecord);
            }
        });
        
        return masterData;
    }

    /**
     * Create comprehensive team performance CSV with Super Bowl indicators
     */
    createComprehensiveTeamCSV() {
        console.log('\n📋 Creating comprehensive team performance CSV...');
        
        const comprehensiveData = [];
        
        // Process all teams from conference standings
        Object.entries(this.data.conferenceStandings || {}).forEach(([year, yearData]) => {
            ['afc', 'nfc'].forEach(conference => {
                if (yearData[conference]) {
                    yearData[conference].forEach((team, index) => {
                        // Check if this team won the Super Bowl
                        const superBowlWinner = this.data.superBowlWinners.find(sb => 
                            sb.year == year && sb.winner === team.team
                        );
                        
                        // Get division info if available
                        let divisionInfo = null;
                        const yearDivisions = this.data.divisionStandings[year];
                        if (yearDivisions && yearDivisions.divisions) {
                            Object.entries(yearDivisions.divisions).forEach(([divName, divTeams]) => {
                                const found = divTeams.find(dt => dt.team === team.team);
                                if (found) {
                                    divisionInfo = { name: divName, rank: divTeams.indexOf(found) + 1, isLeader: found.isDivisionLeader };
                                }
                            });
                        }
                        
                        const comprehensiveTeam = {
                            year: parseInt(year),
                            team: team.team,
                            conference: conference.toUpperCase(),
                            conference_rank: index + 1,
                            division: divisionInfo ? divisionInfo.name : 'Unknown',
                            division_rank: divisionInfo ? divisionInfo.rank : null,
                            is_division_leader: divisionInfo ? divisionInfo.isLeader : false,
                            wins: team.wins,
                            losses: team.losses,
                            ties: team.ties,
                            win_percentage: team.winPct,
                            points_for: team.pointsFor,
                            points_against: team.pointsAgainst,
                            point_differential: team.pointDifferential,
                            home_wins: team.homeRecord?.wins || 0,
                            home_losses: team.homeRecord?.losses || 0,
                            home_win_pct: team.homeWinPct,
                            road_wins: team.roadRecord?.wins || 0,
                            road_losses: team.roadRecord?.losses || 0,
                            road_win_pct: team.roadWinPct,
                            division_wins: team.divisionRecord?.wins || 0,
                            division_losses: team.divisionRecord?.losses || 0,
                            division_win_pct: team.divisionWinPct,
                            conference_wins: team.conferenceRecord?.wins || 0,
                            conference_losses: team.conferenceRecord?.losses || 0,
                            conference_win_pct: team.conferenceWinPct,
                            won_superbowl: superBowlWinner ? 1 : 0,
                            superbowl_opponent: superBowlWinner ? superBowlWinner.loser : '',
                            superbowl_score: superBowlWinner ? superBowlWinner.score : '',
                            current_streak: team.currentStreak,
                            strong_finish: team.strongFinish ? 1 : 0,
                            is_on_win_streak: team.isOnWinStreak ? 1 : 0,
                            is_on_loss_streak: team.isOnLossStreak ? 1 : 0,
                            average_points_for: team.averagePointsFor,
                            average_points_against: team.averagePointsAgainst,
                            total_games: team.totalGames
                        };
                        
                        comprehensiveData.push(comprehensiveTeam);
                    });
                }
            });
        });

        if (comprehensiveData.length > 0) {
            // Clean the data by removing columns with only undefined/NaN/empty values
            const cleanedComprehensiveData = this.cleanCSVData(comprehensiveData);
            
            const comprehensiveCSV = this.arrayToCSV(cleanedComprehensiveData);
            this.saveCSV('comprehensive_team_performance.csv', comprehensiveCSV);
            console.log(`✅ Comprehensive team performance CSV created (${cleanedComprehensiveData.length} team records)`);
            
            // Show summary stats
            const superBowlWinners = cleanedComprehensiveData.filter(t => t.won_superbowl === 1);
            console.log(`   🏆 Super Bowl winners in dataset: ${superBowlWinners.length}`);
            console.log(`   📊 Years covered: ${[...new Set(cleanedComprehensiveData.map(t => t.year))].join(', ')}`);
        } else {
            console.log('⚠️ No comprehensive team data to export');
        }
    }

    /**
     * Enhanced data analysis for CSV export
     */
    analyzeData() {
        console.log('\n📊 Analyzing scraped data...');
        
        if (this.data.superBowlWinners.length === 0) {
            console.log('⚠️ No Super Bowl data to analyze');
            return;
        }

        // Create enhanced summary analysis
        this.data.analysis.summary = this.data.superBowlWinners.map(sb => {
            // Find corresponding team data from conference standings
            const yearStandings = this.data.conferenceStandings[sb.year];
            let teamData = null;
            
            if (yearStandings) {
                // Look in both AFC and NFC
                teamData = [...(yearStandings.afc || []), ...(yearStandings.nfc || [])]
                    .find(team => team.team === sb.winner);
            }
            
            // Also check division standings for additional data
            const yearDivisions = this.data.divisionStandings[sb.year];
            let divisionData = null;
            
            if (yearDivisions && yearDivisions.divisions) {
                Object.values(yearDivisions.divisions).forEach(divisionTeams => {
                    const found = divisionTeams.find(team => team.team === sb.winner);
                    if (found) divisionData = found;
                });
            }
            
            return {
                year: sb.year,
                winner: sb.winner,
                rank: teamData ? 1 : 'Unknown', // Simplified ranking - could be enhanced
                record: teamData ? `${teamData.wins}-${teamData.losses}` : 'Unknown',
                pointsFor: teamData ? teamData.pointsFor : 0,
                pointDifferential: teamData ? teamData.pointDifferential : 0,
                homeRecord: teamData && teamData.homeRecord ? 
                    `${teamData.homeRecord.wins}-${teamData.homeRecord.losses}` : 'Unknown',
                roadRecord: teamData && teamData.roadRecord ? 
                    `${teamData.roadRecord.wins}-${teamData.roadRecord.losses}` : 'Unknown',
                isDivisionLeader: divisionData ? divisionData.isDivisionLeader : true, // Assumption
                conference: teamData ? (teamData.team && ['Kansas City Chiefs', 'Buffalo Bills', 'Baltimore Ravens'].includes(teamData.team) ? 'AFC' : 'NFC') : 'Unknown',
                division: divisionData ? divisionData.division : 'Unknown',
                averagePointsFor: teamData ? teamData.averagePointsFor : 0,
                averagePointsAgainst: teamData ? teamData.averagePointsAgainst : 0,
                homeWinPct: teamData ? teamData.homeWinPct : 0,
                roadWinPct: teamData ? teamData.roadWinPct : 0,
                divisionWinPct: teamData ? teamData.divisionWinPct : 0,
                conferenceWinPct: teamData ? teamData.conferenceWinPct : 0,
                strongFinish: teamData ? teamData.strongFinish : false
            };
        });

        // Calculate patterns if we have enough data
        if (this.data.analysis.summary.length > 0) {
            const summaries = this.data.analysis.summary;
            
            this.data.analysis.patterns = {
                totalSuperBowls: summaries.length,
                topSeedWins: summaries.filter(s => s.rank === 1).length,
                wildCardWins: summaries.filter(s => s.rank > 4).length,
                divisionWinnersCount: summaries.filter(s => s.isDivisionLeader).length,
                strongFinishCount: summaries.filter(s => s.strongFinish).length,
                averageRegularSeasonRank: summaries.reduce((sum, s) => sum + (typeof s.rank === 'number' ? s.rank : 1), 0) / summaries.length,
                averagePointsFor: summaries.reduce((sum, s) => sum + s.pointsFor, 0) / summaries.length,
                averagePointsAgainst: summaries.reduce((sum, s) => sum + s.averagePointsAgainst, 0) / summaries.length,
                averagePointDifferential: summaries.reduce((sum, s) => sum + s.pointDifferential, 0) / summaries.length,
                homeRecordAnalysis: {
                    wins: summaries.reduce((sum, s) => sum + (s.homeRecord !== 'Unknown' ? parseInt(s.homeRecord.split('-')[0]) : 0), 0),
                    losses: summaries.reduce((sum, s) => sum + (s.homeRecord !== 'Unknown' ? parseInt(s.homeRecord.split('-')[1]) : 0), 0),
                    winPct: summaries.reduce((sum, s) => sum + s.homeWinPct, 0) / summaries.length
                },
                roadRecordAnalysis: {
                    wins: summaries.reduce((sum, s) => sum + (s.roadRecord !== 'Unknown' ? parseInt(s.roadRecord.split('-')[0]) : 0), 0),
                    losses: summaries.reduce((sum, s) => sum + (s.roadRecord !== 'Unknown' ? parseInt(s.roadRecord.split('-')[1]) : 0), 0),
                    winPct: summaries.reduce((sum, s) => sum + s.roadWinPct, 0) / summaries.length
                }
            };
        }

        console.log(`✅ Enhanced analysis complete for ${this.data.analysis.summary.length} Super Bowl winners`);
        if (this.data.analysis.patterns) {
            console.log(`   📈 Pattern analysis includes ${this.data.analysis.patterns.totalSuperBowls} championships`);
            console.log(`   🏆 Division leaders who won: ${this.data.analysis.patterns.divisionWinnersCount}/${this.data.analysis.patterns.totalSuperBowls}`);
        }
    }

    /**
     * Clean CSV data by removing columns where all values are undefined, empty, "NaN", or similar invalid values
     */
    cleanCSVData(data) {
        if (!data || data.length === 0) {
            return data;
        }
        
        const headers = Object.keys(data[0]);
        const columnsToKeep = [];
        const columnsToRemove = [];
        
        // Check each column to see if all values are invalid
        headers.forEach(header => {
            const columnValues = data.map(row => row[header]);
            
            // Check if all values in this column are undefined, "undefined-undefined-undefined", "NaN", or empty
            const allInvalid = columnValues.every(value => {
                if (value === null || value === undefined) return true;
                
                const stringValue = String(value).trim();
                return (
                    stringValue === '' ||
                    stringValue === 'undefined' ||
                    stringValue === 'undefined-undefined-undefined' ||
                    stringValue === 'NaN' ||
                    stringValue === 'null' ||
                    stringValue === '0' && header.includes('record') && stringValue === '0-0-0' // Keep 0-0-0 records
                );
            });
            
            if (allInvalid) {
                columnsToRemove.push(header);
            } else {
                columnsToKeep.push(header);
            }
        });
        
        console.log(`🧹 CSV Cleaning: Removing ${columnsToRemove.length} columns with only invalid values`);
        if (columnsToRemove.length > 0) {
            console.log(`   Removed columns: ${columnsToRemove.slice(0, 5).join(', ')}${columnsToRemove.length > 5 ? ` and ${columnsToRemove.length - 5} more` : ''}`);
        }
        
        // Create cleaned data with only valid columns
        const cleanedData = data.map(row => {
            const cleanedRow = {};
            columnsToKeep.forEach(header => {
                cleanedRow[header] = row[header];
            });
            return cleanedRow;
        });
        
        console.log(`✅ CSV Cleaning complete: Kept ${columnsToKeep.length} columns with valid data`);
        return cleanedData;
    }

    /**
     * Save data to JSON (existing functionality)
     */
    saveData() {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const filename = `dt.json`;
        
        this.data.metadata.totalSuperBowls = this.data.superBowlWinners.length;
        this.data.metadata.totalStandingsYears = Object.keys(this.data.conferenceStandings).length;
        this.data.metadata.totalDivisionStandingsYears = Object.keys(this.data.divisionStandings).length;
        this.data.metadata.hasAnalysis = Object.keys(this.data.analysis).length > 0;

        fs.writeFileSync(filename, JSON.stringify(this.data, null, 2));
        console.log(`💾 Enhanced data saved to: ${filename}`);
        return filename;
    }

    /**
     * Main execution function - comprehensive scraping from both websites + CSV export
     */
    async run() {
        console.log('🚀 Starting Enhanced NFL Data Scraper with CSV Export...');
        console.log('📋 Will scrape both Wikipedia (Super Bowl) AND NFL.com (Standings)');
        console.log(`🗓️  Years: ${this.years.join(', ')}\n`);
        
        try {
            await this.initBrowser();
            
            // Step 1: Scrape Super Bowl winners from Wikipedia
            await this.scrapeSuperBowlWinners();
            
            // Step 2: Scrape NFL standings from NFL.com (BOTH conference and division)
            await this.scrapeAllNFLStandings();
            
            // Step 3: Analyze data
            this.analyzeData();
            
            // Step 4: Save JSON data
            this.saveData();
            
            // Step 5: Export to CSV
            this.exportAllToCSV();
            
            console.log('\n🎉 ENHANCED NFL DATA SCRAPING WITH CSV EXPORT COMPLETED!');
            console.log(`📊 Comprehensive data includes:`);
            console.log(`   • ${this.data.superBowlWinners.length} Super Bowl winners`);
            console.log(`   • ${Object.keys(this.data.conferenceStandings).length} years of conference standings`);
            console.log(`   • ${Object.keys(this.data.divisionStandings).length} years of division standings`);
            console.log(`   • JSON format: dt.json`);
            console.log(`   • CSV format: Multiple files in ${this.csvDirectory}`);
            
        } catch (error) {
            console.error('❌ Fatal error:', error);
        } finally {
            await this.closeBrowser();
        }
    }
}

// Execute the enhanced scraper
(async () => {
    const scraper = new EnhancedNFLScraperWithCSV();
    await scraper.run();
})();

module.exports = EnhancedNFLScraperWithCSV;
