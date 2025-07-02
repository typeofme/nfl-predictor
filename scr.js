const puppeteer = require('puppeteer');
const cheerio = require('cheerio');
const fs = require('fs');
// Add CSV functionality
const createCsvWriter = require('csv-writer').createObjectCsvWriter;

class ComprehensiveNFLScraper {
    constructor() {
        this.years = [2022, 2023, 2024];
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
        this.csvExportEnabled = true;
        this.csvDirectory = './csv_exports/';
    }

    /**
     * Map abbreviated Super Bowl team names to full team names
     */
    mapToFullTeamName(shortName) {
        const teamMappings = {
            // Common abbreviations used in Super Bowl data
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
            'Los Angeles': 'Los Angeles Rams', // Common abbreviation for Rams
            'Green Bay': 'Green Bay Packers',
            'Washington': 'Washington Commanders',
            'Seattle': 'Seattle Seahawks',
            'Atlanta': 'Atlanta Falcons',
            'Arizona': 'Arizona Cardinals',
            'Dallas': 'Dallas Cowboys',
            'San Francisco': 'San Francisco 49ers',
            'San Francisco 49': 'San Francisco 49ers', // Sometimes shows as "San Francisco 49"
            'Chicago': 'Chicago Bears',
            'Carolina': 'Carolina Panthers',
            'New Orleans': 'New Orleans Saints',
            'New York Giants': 'New York Giants'
        };

        // Return the full name if mapping exists, otherwise return the original
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

            // Find the main results table (Table index 1 based on our previous analysis)
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

                    // Extract year from date text
                    const yearMatch = dateText.match(/\((\d{4})/);
                    if (yearMatch) {
                        const year = parseInt(yearMatch[1]);
                        
                        // Only collect data for our target years (2019-2024)
                        if (this.years.includes(year)) {
                            // Clean team names (remove parenthetical info and conference markers)
                            const winnerRaw = winnerText.replace(/[a-zA-Z]*\([^)]*\)/g, '').replace(/\[[^\]]*\]/g, '').trim();
                            const loserRaw = loserText.replace(/[a-zA-Z]*\([^)]*\)/g, '').replace(/\[[^\]]*\]/g, '').trim();
                            
                            // Map abbreviated Super Bowl names to full team names
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
                            console.log(`✅ ${year}: ${winner} defeated ${loser} (${score})`);
                        }
                    }
                }
            });

            // Sort by year
            this.data.superBowlWinners.sort((a, b) => a.year - b.year);
            console.log(`🎯 Successfully extracted ${this.data.superBowlWinners.length} Super Bowl results!`);

        } catch (error) {
            console.error('❌ Error scraping Super Bowl data:', error.message);
        }
    }

    /**
     * Scrape NFL standings for a specific year
     */
    async scrapeNFLStandingsForYear(year) {
        console.log(`\n🏈 Scraping ${year} NFL standings from NFL.com...`);
        
        try {
            const url = `https://www.nfl.com/standings/conference/${year}/REG`;
            console.log(`📊 Loading: ${url}`);
            
            await this.page.goto(url, {
                waitUntil: 'networkidle0',
                timeout: 45000
            });

            // Wait for dynamic content to load
            await new Promise(resolve => setTimeout(resolve, 8000));
            
            // Try to find and click any cookie/consent banners
            try {
                const cookieButton = await this.page.$('button[aria-label*="Accept"], button:contains("Accept"), .accept-cookies');
                if (cookieButton) {
                    await cookieButton.click();
                    await new Promise(resolve => setTimeout(resolve, 2000));
                }
            } catch (e) {
                // Ignore cookie banner errors
            }

            console.log('🔍 Extracting standings data...');
            
            // Extract standings data
            const standings = await this.page.evaluate((currentYear) => {
                const data = {
                    year: currentYear,
                    afc: [],
                    nfc: [],
                    scrapingMethod: 'table-extraction'
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
                    return text;
                }

                // Look for team data in tables with enhanced parameter extraction
                const tables = document.querySelectorAll('table');
                const teamData = [];

                // Helper function to parse decimal values
                function parseDecimal(str) {
                    if (!str) return 0;
                    const cleaned = str.replace(/[^\d.-]/g, '');
                    return parseFloat(cleaned) || 0;
                }

                // Helper function to parse record strings (e.g., "7-2-0")
                function parseRecord(recordStr) {
                    if (!recordStr || typeof recordStr !== 'string') return { wins: 0, losses: 0, ties: 0 };
                    const parts = recordStr.split('-').map(p => parseInt(p.trim()) || 0);
                    return {
                        wins: parts[0] || 0,
                        losses: parts[1] || 0,
                        ties: parts[2] || 0
                    };
                }

                tables.forEach((table, tableIndex) => {
                    const rows = table.querySelectorAll('tr');
                    
                    rows.forEach((row, rowIndex) => {
                        const cells = row.querySelectorAll('td, th');
                        const rowText = row.textContent;
                        
                        // Look for rows with comprehensive team data pattern
                        if (cells.length >= 10) { // Expect more columns for enhanced data
                            const cellTexts = Array.from(cells).map(cell => cell.textContent.trim());
                            
                            // Check if this looks like a team standings row
                            const hasTeamPattern = cellTexts.some(text => 
                                ['Chiefs', 'Bills', 'Patriots', 'Cowboys', 'Packers', '49ers', 'Eagles', 'Ravens', 'Steelers', 'Dolphins', 'Bengals'].some(team => text.includes(team))
                            );
                            
                            if (hasTeamPattern && cellTexts.length >= 10) {
                                const teamName = cleanTeamName(cellTexts[0] || rowText);
                                
                                // Enhanced data extraction based on typical NFL standings table structure
                                // Columns: Team, W, L, T, PCT, PF, PA, Net Pts, Home, Road, Div, Conf, Non-Conf, Strk, Last 5
                                const teamRecord = {
                                    team: teamName,
                                    // Basic record
                                    wins: parseInt(cellTexts[1]) || 0,
                                    losses: parseInt(cellTexts[2]) || 0,
                                    ties: parseInt(cellTexts[3]) || 0,
                                    
                                    // Win percentage
                                    winPct: parseDecimal(cellTexts[4]),
                                    
                                    // Points and differential
                                    pointsFor: parseInt(cellTexts[5]) || 0,
                                    pointsAgainst: parseInt(cellTexts[6]) || 0,
                                    netPoints: parseInt(cellTexts[7]) || 0,
                                    
                                    // Home/Road/Division/Conference records
                                    homeRecord: parseRecord(cellTexts[8]),
                                    roadRecord: parseRecord(cellTexts[9]),
                                    divisionRecord: parseRecord(cellTexts[10]),
                                    conferenceRecord: parseRecord(cellTexts[11]),
                                    nonConferenceRecord: parseRecord(cellTexts[12]),
                                    
                                    // Streak and recent form
                                    currentStreak: cellTexts[13] || '',
                                    lastFiveGames: parseRecord(cellTexts[14]),
                                    
                                    // Calculate additional metrics
                                    totalGames: (parseInt(cellTexts[1]) || 0) + (parseInt(cellTexts[2]) || 0) + (parseInt(cellTexts[3]) || 0),
                                    pointDifferential: (parseInt(cellTexts[5]) || 0) - (parseInt(cellTexts[6]) || 0),
                                    averagePointsFor: ((parseInt(cellTexts[5]) || 0) / Math.max(1, (parseInt(cellTexts[1]) || 0) + (parseInt(cellTexts[2]) || 0) + (parseInt(cellTexts[3]) || 0))).toFixed(1),
                                    averagePointsAgainst: ((parseInt(cellTexts[6]) || 0) / Math.max(1, (parseInt(cellTexts[1]) || 0) + (parseInt(cellTexts[2]) || 0) + (parseInt(cellTexts[3]) || 0))).toFixed(1),
                                    
                                    // Home/Road win percentages
                                    homeWinPct: cellTexts[8] ? parseRecord(cellTexts[8]).wins / Math.max(1, parseRecord(cellTexts[8]).wins + parseRecord(cellTexts[8]).losses + parseRecord(cellTexts[8]).ties) : 0,
                                    roadWinPct: cellTexts[9] ? parseRecord(cellTexts[9]).wins / Math.max(1, parseRecord(cellTexts[9]).wins + parseRecord(cellTexts[9]).losses + parseRecord(cellTexts[9]).ties) : 0,
                                    
                                    // Division/Conference win percentages
                                    divisionWinPct: cellTexts[10] ? parseRecord(cellTexts[10]).wins / Math.max(1, parseRecord(cellTexts[10]).wins + parseRecord(cellTexts[10]).losses + parseRecord(cellTexts[10]).ties) : 0,
                                    conferenceWinPct: cellTexts[11] ? parseRecord(cellTexts[11]).wins / Math.max(1, parseRecord(cellTexts[11]).wins + parseRecord(cellTexts[11]).losses + parseRecord(cellTexts[11]).ties) : 0,
                                    
                                    // Strength indicators
                                    strongFinish: cellTexts[14] ? parseRecord(cellTexts[14]).wins >= 3 : false,
                                    isOnWinStreak: cellTexts[13] ? cellTexts[13].includes('W') : false,
                                    isOnLossStreak: cellTexts[13] ? cellTexts[13].includes('L') : false,
                                    
                                    // Raw data for debugging
                                    rawData: cellTexts,
                                    tableIndex: tableIndex,
                                    rowIndex: rowIndex,
                                    extractionMethod: 'enhanced-nfl-parameters'
                                };

                                teamData.push(teamRecord);
                            }
                        }
                        // Fallback to basic extraction if enhanced fails
                        else if (cells.length >= 6) {
                            const cellTexts = Array.from(cells).map(cell => cell.textContent.trim());
                            
                            const hasTeamPattern = cellTexts.some(text => 
                                ['Chiefs', 'Bills', 'Patriots', 'Cowboys', 'Packers', '49ers', 'Eagles'].some(team => text.includes(team))
                            );
                            
                            if (hasTeamPattern) {
                                const numbers = cellTexts.filter(text => /^\d+$/.test(text) && parseInt(text) <= 17);
                                
                                if (numbers.length >= 2) {
                                    const teamName = cleanTeamName(cellTexts[0] || rowText);
                                    
                                    teamData.push({
                                        team: teamName,
                                        wins: parseInt(numbers[0]) || 0,
                                        losses: parseInt(numbers[1]) || 0,
                                        ties: numbers.length > 2 ? parseInt(numbers[2]) || 0 : 0,
                                        winPct: numbers.length > 3 ? parseFloat(`0.${numbers[3]}`) || 0 : 0,
                                        rawData: cellTexts,
                                        tableIndex: tableIndex,
                                        rowIndex: rowIndex,
                                        extractionMethod: 'basic-fallback'
                                    });
                                }
                            }
                        }
                    });
                });

                // Classify teams by conference
                const afcTeams = [
                    'Kansas City Chiefs', 'Buffalo Bills', 'Baltimore Ravens', 'Houston Texans',
                    'Pittsburgh Steelers', 'Cleveland Browns', 'Cincinnati Bengals', 'Tennessee Titans',
                    'Jacksonville Jaguars', 'Indianapolis Colts', 'Miami Dolphins', 'New York Jets',
                    'Denver Broncos', 'Las Vegas Raiders', 'Los Angeles Chargers', 'New England Patriots'
                ];

                teamData.forEach(team => {
                    if (afcTeams.includes(team.team)) {
                        data.afc.push(team);
                    } else {
                        data.nfc.push(team);
                    }
                });

                // Sort by wins (descending)
                data.afc.sort((a, b) => b.wins - a.wins);
                data.nfc.sort((a, b) => b.wins - a.wins);

                return data;
                
            }, year);

            console.log(`✅ ${year}: Found ${standings.afc.length} AFC teams, ${standings.nfc.length} NFC teams`);
            
            if (standings.afc.length > 0) {
                console.log(`   AFC Leader: ${standings.afc[0].team} (${standings.afc[0].wins}-${standings.afc[0].losses})`);
            }
            if (standings.nfc.length > 0) {
                console.log(`   NFC Leader: ${standings.nfc[0].team} (${standings.nfc[0].wins}-${standings.nfc[0].losses})`);
            }

            return standings;

        } catch (error) {
            console.error(`❌ Error scraping ${year} standings:`, error.message);
            return { year: year, afc: [], nfc: [], error: error.message };
        }
    }

    /**
     * Scrape all NFL standings
     */
    async scrapeAllNFLStandings() {
        console.log('\n📈 Scraping NFL conference standings for all years...');
        
        for (const year of this.years) {
            const standings = await this.scrapeNFLStandingsForYear(year);
            this.data.conferenceStandings[year] = standings;
            
            // Add delay between requests
            console.log('⏱️  Waiting 3 seconds before next request...');
            await new Promise(resolve => setTimeout(resolve, 3000));
        }

        // Now scrape division standings
        await this.scrapeAllDivisionStandings();
    }

    /**
     * Scrape NFL division standings for a specific year
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

            // Wait for dynamic content to load
            await new Promise(resolve => setTimeout(resolve, 8000));
            
            console.log('🔍 Extracting division standings data...');
            
            // Extract division standings data
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
                    },
                    rawData: []
                };

                function cleanTeamName(text) {
                    return text
                        .replace(/Go to|info page\.|\.$/g, '')
                        .replace(/\n/g, ' ')
                        .replace(/\s+/g, ' ')
                        .replace(/x[yz*]*\s*/g, '')  // Remove playoff indicators
                        .replace(/\s+x[yz*]*\s*/g, ' ')
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

                // Helper function to parse record strings (e.g., "7-2-0")
                function parseRecord(recordStr) {
                    if (!recordStr || typeof recordStr !== 'string') return { wins: 0, losses: 0, ties: 0 };
                    const parts = recordStr.split('-').map(p => parseInt(p.trim()) || 0);
                    return {
                        wins: parts[0] || 0,
                        losses: parts[1] || 0,
                        ties: parts[2] || 0
                    };
                }

                // Helper function to calculate win percentage from record string
                function calculateWinPct(recordStr) {
                    if (!recordStr) return 0;
                    const record = parseRecord(recordStr);
                    const totalGames = record.wins + record.losses + record.ties;
                    if (totalGames === 0) return 0;
                    return (record.wins + 0.5 * record.ties) / totalGames;
                }

                // Look for all tables and extract team data
                const tables = document.querySelectorAll('table');
                const teamData = [];

                tables.forEach((table, tableIndex) => {
                    const rows = table.querySelectorAll('tr');
                    
                    rows.forEach((row, rowIndex) => {
                        const cells = row.querySelectorAll('td, th');
                        const rowText = row.textContent;
                        
                        // Look for rows with team data pattern
                        if (cells.length >= 6) {
                            const cellTexts = Array.from(cells).map(cell => cell.textContent.trim());
                            
                            // Check if this looks like a team standings row
                            const hasTeamPattern = cellTexts.some(text => 
                                ['Chiefs', 'Bills', 'Patriots', 'Cowboys', 'Packers', '49ers', 'Eagles', 'Ravens', 'Steelers'].some(team => text.includes(team))
                            );
                            
                            if (hasTeamPattern) {
                                // Extract numeric data (wins, losses, etc.)
                                const numbers = cellTexts.filter(text => /^\d+$/.test(text) && parseInt(text) <= 17);
                                
                                if (numbers.length >= 2) {
                                    const teamName = cleanTeamName(cellTexts[0] || rowText);
                                    const division = getDivision(teamName);
                                    
                                    // Enhanced division standings data extraction
                                    const teamRecord = {
                                        team: teamName,
                                        // Basic record
                                        wins: parseInt(numbers[0]) || 0,
                                        losses: parseInt(numbers[1]) || 0,
                                        ties: numbers.length > 2 ? parseInt(numbers[2]) || 0 : 0,
                                        winPct: numbers.length > 3 ? parseFloat(`0.${numbers[3]}`) || 0 : 0,
                                        
                                        // Enhanced metrics for division standings
                                        pointsFor: parseInt(cellTexts[5]) || 0,
                                        pointsAgainst: parseInt(cellTexts[6]) || 0,
                                        netPoints: (parseInt(cellTexts[5]) || 0) - (parseInt(cellTexts[6]) || 0),
                                        
                                        // Parse records from text (Home, Road, Division, etc.)
                                        homeRecord: cellTexts[8] ? parseRecord(cellTexts[8]) : { wins: 0, losses: 0, ties: 0 },
                                        roadRecord: cellTexts[9] ? parseRecord(cellTexts[9]) : { wins: 0, losses: 0, ties: 0 },
                                        divisionRecord: cellTexts[10] ? parseRecord(cellTexts[10]) : { wins: 0, losses: 0, ties: 0 },
                                        conferenceRecord: cellTexts[11] ? parseRecord(cellTexts[11]) : { wins: 0, losses: 0, ties: 0 },
                                        
                                        // Additional analytics
                                        currentStreak: cellTexts[13] || '',
                                        lastFiveGames: cellTexts[14] ? parseRecord(cellTexts[14]) : { wins: 0, losses: 0, ties: 0 },
                                        
                                        // Calculated metrics
                                        pointDifferential: (parseInt(cellTexts[5]) || 0) - (parseInt(cellTexts[6]) || 0),
                                        averagePointsFor: (parseInt(cellTexts[5]) || 0) / Math.max(1, (parseInt(numbers[0]) || 0) + (parseInt(numbers[1]) || 0) + (parseInt(numbers[2]) || 0)),
                                        averagePointsAgainst: (parseInt(cellTexts[6]) || 0) / Math.max(1, (parseInt(numbers[0]) || 0) + (parseInt(numbers[1]) || 0) + (parseInt(numbers[2]) || 0)),
                                        
                                        // Home/Road efficiency
                                        homeWinPct: cellTexts[8] ? calculateWinPct(cellTexts[8]) : 0,
                                        roadWinPct: cellTexts[9] ? calculateWinPct(cellTexts[9]) : 0,
                                        divisionWinPct: cellTexts[10] ? calculateWinPct(cellTexts[10]) : 0,
                                        conferenceWinPct: cellTexts[11] ? calculateWinPct(cellTexts[11]) : 0,
                                        
                                        // Performance indicators
                                        isStrongAtHome: cellTexts[8] ? calculateWinPct(cellTexts[8]) > 0.6 : false,
                                        isStrongOnRoad: cellTexts[9] ? calculateWinPct(cellTexts[9]) > 0.5 : false,
                                        isDivisionLeader: false, // Will be calculated later
                                        hasPositivePointDiff: ((parseInt(cellTexts[5]) || 0) - (parseInt(cellTexts[6]) || 0)) > 0,
                                        
                                        // Metadata
                                        division: division,
                                        rawData: cellTexts,
                                        tableIndex: tableIndex,
                                        rowIndex: rowIndex,
                                        extractionMethod: 'enhanced-division-parameters'
                                    };

                                    teamData.push(teamRecord);
                                    
                                    // Add to appropriate division
                                    if (data.divisions[division]) {
                                        data.divisions[division].push(teamRecord);
                                    }
                                }
                            }
                        });
                    });
                });

                // Sort divisions by wins and mark division leaders
                Object.keys(data.divisions).forEach(division => {
                    data.divisions[division].sort((a, b) => {
                        // Sort by wins first, then by win percentage, then by point differential
                        if (b.wins !== a.wins) return b.wins - a.wins;
                        if (b.winPct !== a.winPct) return b.winPct - a.winPct;
                        return (b.pointDifferential || 0) - (a.pointDifferential || 0);
                    });
                    
                    // Mark division leader
                    if (data.divisions[division].length > 0) {
                        data.divisions[division][0].isDivisionLeader = true;
                    }
                });

                // Calculate league-wide statistics
                data.leagueStats = {
                    totalTeams: teamData.length,
                    averageWins: teamData.length > 0 ? teamData.reduce((sum, team) => sum + team.wins, 0) / teamData.length : 0,
                    averagePointsFor: teamData.length > 0 ? teamData.filter(t => t.pointsFor).reduce((sum, team) => sum + team.pointsFor, 0) / teamData.filter(t => t.pointsFor).length : 0,
                    averagePointsAgainst: teamData.length > 0 ? teamData.filter(t => t.pointsAgainst).reduce((sum, team) => sum + team.pointsAgainst, 0) / teamData.filter(t => t.pointsAgainst).length : 0,
                    topOffense: teamData.filter(t => t.pointsFor).sort((a, b) => b.pointsFor - a.pointsFor)[0],
                    topDefense: teamData.filter(t => t.pointsAgainst).sort((a, b) => a.pointsAgainst - b.pointsAgainst)[0],
                    bestPointDifferential: teamData.filter(t => t.pointDifferential !== undefined).sort((a, b) => b.pointDifferential - a.pointDifferential)[0],
                    bestHomeRecord: teamData.filter(t => t.homeWinPct).sort((a, b) => b.homeWinPct - a.homeWinPct)[0],
                    bestRoadRecord: teamData.filter(t => t.roadWinPct).sort((a, b) => b.roadWinPct - a.roadWinPct)[0]
                };

                data.rawData = teamData;
                data.totalTeams = teamData.length;

                return data;
                
            }, year);

            console.log(`✅ ${year} division standings: Found ${divisionStandings.totalTeams} teams across divisions`);
            
            return divisionStandings;

        } catch (error) {
            console.error(`❌ Error scraping ${year} division standings:`, error.message);
            return { 
                year: year, 
                divisions: {}, 
                error: error.message,
                totalTeams: 0
            };
        }
    }

    /**
     * Scrape all NFL division standings
     */
    async scrapeAllDivisionStandings() {
        console.log('\n📈 Scraping NFL division standings for all years...');
        
        for (const year of this.years) {
            const divisionStandings = await this.scrapeDivisionStandingsForYear(year);
            this.data.divisionStandings[year] = divisionStandings;
            
            // Add delay between requests
            console.log('⏱️  Waiting 3 seconds before next request...');
            await new Promise(resolve => setTimeout(resolve, 3000));
        }
    }

    /**
     * Analyze correlation between Super Bowl winners and regular season performance with enhanced metrics
     */
    analyzeData() {
        console.log('\n🔍 Analyzing correlation between Super Bowl winners and enhanced standings metrics...');
        
        const analysis = {
            correlations: {},
            patterns: {
                totalSuperBowls: this.data.superBowlWinners.length,
                topSeedWins: 0,
                wildCardWins: 0,
                averageRegularSeasonRank: 0,
                averagePointsFor: 0,
                averagePointsAgainst: 0,
                averagePointDifferential: 0,
                homeRecordAnalysis: { wins: 0, losses: 0, winPct: 0 },
                roadRecordAnalysis: { wins: 0, losses: 0, winPct: 0 },
                divisionWinnersCount: 0,
                strongFinishCount: 0
            },
            enhancedMetrics: {
                offensiveCorrelation: 0,
                defensiveCorrelation: 0,
                homePerformanceCorrelation: 0,
                roadPerformanceCorrelation: 0,
                divisionPerformanceCorrelation: 0,
                recentFormCorrelation: 0
            },
            summary: []
        };

        this.data.superBowlWinners.forEach(sb => {
            const standings = this.data.conferenceStandings[sb.year];
            const divisionStandings = this.data.divisionStandings[sb.year];
            
            if (!standings) {
                analysis.correlations[sb.year] = {
                    superBowl: sb,
                    standings: null,
                    error: 'No standings data available'
                };
                return;
            }

            // Find the Super Bowl winner in the standings
            const afcWinner = standings.afc.find(team => 
                this.teamNamesMatch(team.team, sb.winner)
            );
            const nfcWinner = standings.nfc.find(team => 
                this.teamNamesMatch(team.team, sb.winner)
            );

            const winner = afcWinner || nfcWinner;
            const conference = afcWinner ? 'AFC' : 'NFC';
            const conferenceStandings = afcWinner ? standings.afc : standings.nfc;
            const rank = winner ? conferenceStandings.indexOf(winner) + 1 : null;

            // Find enhanced division data
            let divisionWinner = null;
            if (divisionStandings && divisionStandings.rawData) {
                divisionWinner = divisionStandings.rawData.find(team => 
                    this.teamNamesMatch(team.team, sb.winner)
                );
            }

            const yearAnalysis = {
                superBowl: sb,
                regularSeason: winner,
                enhancedData: divisionWinner,
                conference: conference,
                rank: rank,
                topSeed: rank === 1,
                isDivisionLeader: divisionWinner ? divisionWinner.isDivisionLeader : false,
                enhancedMetrics: divisionWinner ? {
                    pointsFor: divisionWinner.pointsFor || 0,
                    pointsAgainst: divisionWinner.pointsAgainst || 0,
                    pointDifferential: divisionWinner.pointDifferential || 0,
                    homeWinPct: divisionWinner.homeWinPct || 0,
                    roadWinPct: divisionWinner.roadWinPct || 0,
                    divisionWinPct: divisionWinner.divisionWinPct || 0,
                    conferenceWinPct: divisionWinner.conferenceWinPct || 0,
                    strongFinish: divisionWinner.strongFinish || false,
                    currentStreak: divisionWinner.currentStreak || '',
                    isStrongAtHome: divisionWinner.isStrongAtHome || false,
                    isStrongOnRoad: divisionWinner.isStrongOnRoad || false
                } : null
            };

            analysis.correlations[sb.year] = yearAnalysis;

            // Update patterns with enhanced metrics
            if (rank) {
                if (rank === 1) analysis.patterns.topSeedWins++;
                if (rank > 4) analysis.patterns.wildCardWins++;
                
                if (divisionWinner) {
                    analysis.patterns.averagePointsFor += divisionWinner.pointsFor || 0;
                    analysis.patterns.averagePointsAgainst += divisionWinner.pointsAgainst || 0;
                    analysis.patterns.averagePointDifferential += divisionWinner.pointDifferential || 0;
                    
                    if (divisionWinner.homeRecord) {
                        analysis.patterns.homeRecordAnalysis.wins += divisionWinner.homeRecord.wins || 0;
                        analysis.patterns.homeRecordAnalysis.losses += divisionWinner.homeRecord.losses || 0;
                    }
                    
                    if (divisionWinner.roadRecord) {
                        analysis.patterns.roadRecordAnalysis.wins += divisionWinner.roadRecord.wins || 0;
                        analysis.patterns.roadRecordAnalysis.losses += divisionWinner.roadRecord.losses || 0;
                    }
                    
                    if (divisionWinner.isDivisionLeader) analysis.patterns.divisionWinnersCount++;
                    if (divisionWinner.strongFinish) analysis.patterns.strongFinishCount++;
                }
                
                analysis.summary.push({
                    year: sb.year,
                    winner: sb.winner,
                    rank: rank,
                    record: winner ? `${winner.wins}-${winner.losses}` : 'Unknown',
                    pointsFor: divisionWinner ? divisionWinner.pointsFor : 'N/A',
                    pointDifferential: divisionWinner ? divisionWinner.pointDifferential : 'N/A',
                    homeRecord: divisionWinner && divisionWinner.homeRecord ? 
                        `${divisionWinner.homeRecord.wins}-${divisionWinner.homeRecord.losses}` : 'N/A',
                    roadRecord: divisionWinner && divisionWinner.roadRecord ? 
                        `${divisionWinner.roadRecord.wins}-${divisionWinner.roadRecord.losses}` : 'N/A',
                    isDivisionLeader: divisionWinner ? divisionWinner.isDivisionLeader : false
                });
            }
        });

        // Calculate averages
        const validEntries = analysis.summary.length;
        if (validEntries > 0) {
            analysis.patterns.averageRegularSeasonRank = Object.values(analysis.correlations)
                .filter(c => c.rank)
                .map(c => c.rank)
                .reduce((a, b) => a + b, 0) / validEntries;
                
            analysis.patterns.averagePointsFor /= validEntries;
            analysis.patterns.averagePointsAgainst /= validEntries;
            analysis.patterns.averagePointDifferential /= validEntries;
            
            // Calculate home/road win percentages
            const homeTotal = analysis.patterns.homeRecordAnalysis.wins + analysis.patterns.homeRecordAnalysis.losses;
            const roadTotal = analysis.patterns.roadRecordAnalysis.wins + analysis.patterns.roadRecordAnalysis.losses;
            
            analysis.patterns.homeRecordAnalysis.winPct = homeTotal > 0 ? 
                analysis.patterns.homeRecordAnalysis.wins / homeTotal : 0;
            analysis.patterns.roadRecordAnalysis.winPct = roadTotal > 0 ? 
                analysis.patterns.roadRecordAnalysis.wins / roadTotal : 0;
        }

        this.data.analysis = analysis;
        return analysis;
    }

    /**
     * Helper function to match team names
     */
    teamNamesMatch(teamName1, teamName2) {
        const normalize = (name) => name.toLowerCase().replace(/[^a-z]/g, '');
        const name1 = normalize(teamName1);
        const name2 = normalize(teamName2);
        
        // Check if one name contains key parts of the other
        const words1 = name1.split(' ');
        const words2 = name2.split(' ');
        
        return words1.some(word => word.length > 3 && name2.includes(word)) ||
               words2.some(word => word.length > 3 && name1.includes(word));
    }

    /**
     * Save combined data to JSON file
     */
    saveData() {
        const timestamp = new Date().toISOString().replace(/:/g, '-').split('.')[0];
        const filename = `nfl-complete-data-${timestamp}.json`;
        
        // Add metadata
        this.data.metadata.totalSuperBowls = this.data.superBowlWinners.length;
        this.data.metadata.totalStandingsYears = Object.keys(this.data.conferenceStandings).length;
        this.data.metadata.totalDivisionStandingsYears = Object.keys(this.data.divisionStandings).length;
        this.data.metadata.hasAnalysis = Object.keys(this.data.analysis).length > 0;
        
        fs.writeFileSync(filename, JSON.stringify(this.data, null, 2));
        console.log(`\n💾 Complete NFL data saved to: ${filename}`);
        
        // Generate summary report
        this.generateReport(timestamp);
        
        return filename;
    }

    /**
     * Generate human-readable report
     */
    generateReport(timestamp) {
        let report = `COMPREHENSIVE NFL DATA ANALYSIS REPORT\n`;
        report += `Generated: ${new Date().toLocaleString()}\n`;
        report += `${'='.repeat(70)}\n\n`;

        // Super Bowl Winners Summary
        report += `SUPER BOWL WINNERS (2019-2024):\n`;
        report += `${'-'.repeat(50)}\n`;
        this.data.superBowlWinners.forEach(sb => {
            report += `${sb.superBowl} (${sb.season}): ${sb.winner} defeated ${sb.loser} ${sb.score}\n`;
        });

        // Standings Summary
        report += `\nREGULAR SEASON STANDINGS SUMMARY:\n`;
        report += `${'-'.repeat(50)}\n`;
        Object.entries(this.data.conferenceStandings).forEach(([year, standings]) => {
            report += `${year} Season:\n`;
            if (standings.afc.length > 0) {
                report += `  AFC Leader: ${standings.afc[0].team} (${standings.afc[0].wins}-${standings.afc[0].losses})\n`;
            }
            if (standings.nfc.length > 0) {
                report += `  NFC Leader: ${standings.nfc[0].team} (${standings.nfc[0].wins}-${standings.nfc[0].losses})\n`;
            }
        });

        // Division Standings Summary
        report += `\nDIVISION STANDINGS SUMMARY:\n`;
        report += `${'-'.repeat(50)}\n`;
        Object.entries(this.data.divisionStandings).forEach(([year, divisionData]) => {
            report += `${year} Season Division Winners:\n`;
            Object.entries(divisionData.divisions).forEach(([divisionName, teams]) => {
                if (teams.length > 0) {
                    const divisionLabel = divisionName.replace(/([A-Z])/g, ' $1').trim().toUpperCase();
                    report += `  ${divisionLabel}: ${teams[0].team} (${teams[0].wins}-${teams[0].losses})\n`;
                }
            });
        });

        // Analysis with Enhanced Metrics
        if (this.data.analysis.patterns) {
            report += `\nENHANCED CORRELATION ANALYSIS:\n`;
            report += `${'-'.repeat(50)}\n`;
            report += `Total Super Bowls analyzed: ${this.data.analysis.patterns.totalSuperBowls}\n`;
            report += `#1 seeds that won Super Bowl: ${this.data.analysis.patterns.topSeedWins}\n`;
            report += `Wild card teams that won: ${this.data.analysis.patterns.wildCardWins}\n`;
            report += `Division leaders that won: ${this.data.analysis.patterns.divisionWinnersCount}\n`;
            report += `Teams with strong finish (3+ wins in last 5): ${this.data.analysis.patterns.strongFinishCount}\n`;
            report += `Average regular season rank: ${this.data.analysis.patterns.averageRegularSeasonRank.toFixed(1)}\n\n`;

            report += `OFFENSIVE/DEFENSIVE ANALYSIS:\n`;
            report += `Average points scored: ${this.data.analysis.patterns.averagePointsFor.toFixed(1)}\n`;
            report += `Average points allowed: ${this.data.analysis.patterns.averagePointsAgainst.toFixed(1)}\n`;
            report += `Average point differential: ${this.data.analysis.patterns.averagePointDifferential > 0 ? '+' : ''}${this.data.analysis.patterns.averagePointDifferential.toFixed(1)}\n\n`;

            report += `HOME/ROAD PERFORMANCE:\n`;
            report += `Home record: ${this.data.analysis.patterns.homeRecordAnalysis.wins}-${this.data.analysis.patterns.homeRecordAnalysis.losses} (${(this.data.analysis.patterns.homeRecordAnalysis.winPct * 100).toFixed(1)}%)\n`;
            report += `Road record: ${this.data.analysis.patterns.roadRecordAnalysis.wins}-${this.data.analysis.patterns.roadRecordAnalysis.losses} (${(this.data.analysis.patterns.roadRecordAnalysis.winPct * 100).toFixed(1)}%)\n\n`;

            report += `DETAILED YEAR-BY-YEAR ANALYSIS:\n`;
            this.data.analysis.summary.forEach(item => {
                report += `  ${item.year}: ${item.winner}\n`;
                report += `    Seed: #${item.rank} | Record: ${item.record}\n`;
                report += `    Points For: ${item.pointsFor} | Point Diff: ${item.pointDifferential > 0 ? '+' : ''}${item.pointDifferential}\n`;
                report += `    Home: ${item.homeRecord} | Road: ${item.roadRecord}\n`;
                report += `    Division Leader: ${item.isDivisionLeader ? 'Yes' : 'No'}\n\n`;
            });
        }

        const reportFilename = `nfl-complete-report-${timestamp}.txt`;
        fs.writeFileSync(reportFilename, report);
        console.log(`📄 Report saved to: ${reportFilename}`);
    }

    /**
     * Export Super Bowl data to CSV
     */
    async exportSuperBowlDataToCSV() {
        if (!this.csvExportEnabled) return;
        
        console.log('\n📊 Exporting Super Bowl data to CSV...');
        
        const csvWriter = createCsvWriter({
            path: `${this.csvDirectory}super_bowl_winners.csv`,
            header: [
                { id: 'year', title: 'Year' },
                { id: 'superBowl', title: 'Super Bowl' },
                { id: 'date', title: 'Date' },
                { id: 'winner', title: 'Winner' },
                { id: 'loser', title: 'Loser' },
                { id: 'score', title: 'Score' },
                { id: 'season', title: 'Season' }
            ]
        });

        // Write data to CSV
        await csvWriter.writeRecords(this.data.superBowlWinners);
        console.log(`✅ Super Bowl data exported to: ${this.csvDirectory}super_bowl_winners.csv`);
    }

    /**
     * Export NFL standings data to CSV
     */
    async exportNFLStandingsToCSV() {
        if (!this.csvExportEnabled) return;
        
        console.log('\n📊 Exporting NFL standings data to CSV...');
        
        // Combine all standings data into a single array
        const allStandings = [];
        Object.values(this.data.conferenceStandings).forEach(standing => {
            if (standing.afc && standing.nfc) {
                allStandings.push(...standing.afc, ...standing.nfc);
            }
        });

        const csvWriter = createCsvWriter({
            path: `${this.csvDirectory}nfl_standings.csv`,
            header: [
                { id: 'year', title: 'Year' },
                { id: 'team', title: 'Team' },
                { id: 'wins', title: 'Wins' },
                { id: 'losses', title: 'Losses' },
                { id: 'ties', title: 'Ties' },
                { id: 'winPct', title: 'Win Pct' },
                { id: 'pointsFor', title: 'Points For' },
                { id: 'pointsAgainst', title: 'Points Against' },
                { id: 'netPoints', title: 'Net Points' },
                { id: 'homeRecord', title: 'Home Record' },
                { id: 'roadRecord', title: 'Road Record' },
                { id: 'divisionRecord', title: 'Division Record' },
                { id: 'conferenceRecord', title: 'Conference Record' },
                { id: 'nonConferenceRecord', title: 'Non-Conference Record' },
                { id: 'currentStreak', title: 'Current Streak' },
                { id: 'lastFiveGames', title: 'Last 5 Games' }
            ]
        });

        // Write data to CSV
        await csvWriter.writeRecords(allStandings);
        console.log(`✅ NFL standings data exported to: ${this.csvDirectory}nfl_standings.csv`);
    }

    /**
     * Export division standings data to CSV
     */
    async exportDivisionStandingsToCSV() {
        if (!this.csvExportEnabled) return;
        
        console.log('\n📊 Exporting NFL division standings data to CSV...');
        
        // Combine all division standings data into a single array
        const allDivisionStandings = [];
        Object.values(this.data.divisionStandings).forEach(divisionData => {
            if (divisionData.divisions) {
                Object.values(divisionData.divisions).forEach(teams => {
                    allDivisionStandings.push(...teams);
                });
            }
        });

        const csvWriter = createCsvWriter({
            path: `${this.csvDirectory}nfl_division_standings.csv`,
            header: [
                { id: 'year', title: 'Year' },
                { id: 'team', title: 'Team' },
                { id: 'wins', title: 'Wins' },
                { id: 'losses', title: 'Losses' },
                { id: 'ties', title: 'Ties' },
                { id: 'winPct', title: 'Win Pct' },
                { id: 'pointsFor', title: 'Points For' },
                { id: 'pointsAgainst', title: 'Points Against' },
                { id: 'netPoints', title: 'Net Points' },
                { id: 'homeRecord', title: 'Home Record' },
                { id: 'roadRecord', title: 'Road Record' },
                { id: 'divisionRecord', title: 'Division Record' },
                { id: 'conferenceRecord', title: 'Conference Record' },
                { id: 'nonConferenceRecord', title: 'Non-Conference Record' },
                { id: 'currentStreak', title: 'Current Streak' },
                { id: 'lastFiveGames', title: 'Last 5 Games' }
            ]
        });

        // Write data to CSV
        await csvWriter.writeRecords(allDivisionStandings);
        console.log(`✅ NFL division standings data exported to: ${this.csvDirectory}nfl_division_standings.csv`);
    }

    /**
     * Export all data to CSV
     */
    async exportAllDataToCSV() {
        await this.exportSuperBowlDataToCSV();
        await this.exportNFLStandingsToCSV();
        await this.exportDivisionStandingsToCSV();
    }

    /**
     * Main execution function
     */
    async run() {
        console.log('🚀 Starting Comprehensive NFL Data Scraper...');
        console.log('📋 Will scrape both Wikipedia (Super Bowl) AND NFL.com (Standings)');
        console.log(`🗓️  Years: ${this.years.join(', ')}\n`);
        
        try {
            await this.initBrowser();
            
            // Step 1: Scrape Super Bowl winners from Wikipedia
            await this.scrapeSuperBowlWinners();
            
            // Step 2: Scrape NFL standings from NFL.com
            await this.scrapeAllNFLStandings();
            
            // Step 3: Analyze correlations
            this.analyzeData();
            
            // Step 4: Save combined data
            const filename = this.saveData();
            
            // Step 5: Export data to CSV
            await this.exportAllDataToCSV();
            
            console.log('\n🎉 ENHANCED NFL DATA SCRAPING COMPLETED!');
            console.log(`📊 Comprehensive data includes:`);
            console.log(`   • ${this.data.superBowlWinners.length} Super Bowl winners`);
            console.log(`   • ${Object.keys(this.data.conferenceStandings).length} years of conference standings`);
            console.log(`   • ${Object.keys(this.data.divisionStandings).length} years of division standings`);
            console.log(`   • Enhanced metrics: PCT, PF, PA, Net Pts, Home/Road records`);
            console.log(`   • Division/Conference records, Current streaks, Last 5 games`);
            console.log(`   • Point differentials, Win percentages by situation`);
            console.log(`   • Performance indicators and team rankings`);
            console.log(`   • Advanced correlation analysis with 15+ parameters`);
            console.log(`📁 All enhanced data saved to: ${filename}`);
            
        } catch (error) {
            console.error('❌ Fatal error:', error);
        } finally {
            await this.closeBrowser();
        }
    }
}

// Execute the scraper
(async () => {
    const scraper = new ComprehensiveNFLScraper();
    await scraper.run();
})();

module.exports = ComprehensiveNFLScraper;
