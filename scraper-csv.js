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
                    return text.replace(/Go to|info page\.|\.$/g, '').replace(/\n/g, ' ').replace(/\s+/g, ' ').replace(/x[yz*]*\s*/g, '').trim();
                }

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

                // Look for team data in tables
                const tables = document.querySelectorAll('table');
                const teamData = [];

                tables.forEach((table, tableIndex) => {
                    const rows = table.querySelectorAll('tr');
                    
                    rows.forEach((row, rowIndex) => {
                        const cells = row.querySelectorAll('td, th');
                        
                        if (cells.length >= 10) {
                            const cellTexts = Array.from(cells).map(cell => cell.textContent.trim());
                            
                            // Check if this looks like a team standings row
                            const hasTeamPattern = cellTexts.some(text => 
                                ['Chiefs', 'Bills', 'Patriots', 'Cowboys', 'Packers', '49ers', 'Eagles', 'Ravens', 'Steelers', 'Dolphins', 'Bengals'].some(team => text.includes(team))
                            );
                            
                            if (hasTeamPattern && cellTexts.length >= 10) {
                                const teamName = cleanTeamName(cellTexts[0]);
                                
                                const teamRecord = {
                                    team: teamName,
                                    wins: parseInt(cellTexts[1]) || 0,
                                    losses: parseInt(cellTexts[2]) || 0,
                                    ties: parseInt(cellTexts[3]) || 0,
                                    winPct: parseDecimal(cellTexts[4]),
                                    pointsFor: parseInt(cellTexts[5]) || 0,
                                    pointsAgainst: parseInt(cellTexts[6]) || 0,
                                    netPoints: parseInt(cellTexts[7]) || 0,
                                    
                                    // Parse records from text
                                    homeRecord: parseRecord(cellTexts[8]),
                                    roadRecord: parseRecord(cellTexts[9]),
                                    divisionRecord: parseRecord(cellTexts[10]),
                                    conferenceRecord: parseRecord(cellTexts[11]),
                                    nonConferenceRecord: parseRecord(cellTexts[12]),
                                    
                                    currentStreak: cellTexts[13] || '',
                                    lastFiveGames: parseRecord(cellTexts[14]),
                                    
                                    // Calculated metrics
                                    totalGames: (parseInt(cellTexts[1]) || 0) + (parseInt(cellTexts[2]) || 0) + (parseInt(cellTexts[3]) || 0),
                                    pointDifferential: (parseInt(cellTexts[5]) || 0) - (parseInt(cellTexts[6]) || 0),
                                    averagePointsFor: (parseInt(cellTexts[5]) || 0) / Math.max(1, (parseInt(cellTexts[1]) || 0) + (parseInt(cellTexts[2]) || 0) + (parseInt(cellTexts[3]) || 0)),
                                    averagePointsAgainst: (parseInt(cellTexts[6]) || 0) / Math.max(1, (parseInt(cellTexts[1]) || 0) + (parseInt(cellTexts[2]) || 0) + (parseInt(cellTexts[3]) || 0)),
                                    
                                    // Win percentages
                                    homeWinPct: cellTexts[8] ? parseRecord(cellTexts[8]).wins / Math.max(1, parseRecord(cellTexts[8]).wins + parseRecord(cellTexts[8]).losses + parseRecord(cellTexts[8]).ties) : 0,
                                    roadWinPct: cellTexts[9] ? parseRecord(cellTexts[9]).wins / Math.max(1, parseRecord(cellTexts[9]).wins + parseRecord(cellTexts[9]).losses + parseRecord(cellTexts[9]).ties) : 0,
                                    divisionWinPct: cellTexts[10] ? parseRecord(cellTexts[10]).wins / Math.max(1, parseRecord(cellTexts[10]).wins + parseRecord(cellTexts[10]).losses + parseRecord(cellTexts[10]).ties) : 0,
                                    conferenceWinPct: cellTexts[11] ? parseRecord(cellTexts[11]).wins / Math.max(1, parseRecord(cellTexts[11]).wins + parseRecord(cellTexts[11]).losses + parseRecord(cellTexts[11]).ties) : 0,
                                    
                                    // Performance indicators
                                    strongFinish: cellTexts[14] ? parseRecord(cellTexts[14]).wins >= 3 : false,
                                    isOnWinStreak: cellTexts[13] ? cellTexts[13].includes('W') : false,
                                    isOnLossStreak: cellTexts[13] ? cellTexts[13].includes('L') : false,
                                    
                                    // Metadata
                                    rawData: cellTexts,
                                    tableIndex: tableIndex,
                                    rowIndex: rowIndex,
                                    extractionMethod: 'enhanced-nfl-parameters'
                                };

                                teamData.push(teamRecord);
                            }
                        }
                    });
                });

                // Determine AFC vs NFC based on team names
                const afcTeams = ['Kansas City Chiefs', 'Buffalo Bills', 'Baltimore Ravens', 'Houston Texans', 'Pittsburgh Steelers', 'Cleveland Browns', 'Cincinnati Bengals', 'Tennessee Titans', 'Jacksonville Jaguars', 'Indianapolis Colts', 'Miami Dolphins', 'New York Jets', 'Denver Broncos', 'Las Vegas Raiders', 'Los Angeles Chargers', 'New England Patriots'];
                
                teamData.forEach(team => {
                    if (afcTeams.includes(team.team)) {
                        data.afc.push(team);
                    } else {
                        data.nfc.push(team);
                    }
                });

                // Sort by wins then by point differential
                data.afc.sort((a, b) => {
                    if (b.wins !== a.wins) return b.wins - a.wins;
                    return b.pointDifferential - a.pointDifferential;
                });
                
                data.nfc.sort((a, b) => {
                    if (b.wins !== a.wins) return b.wins - a.wins;
                    return b.pointDifferential - a.pointDifferential;
                });

                return data;

            }, year);

            console.log(`✅ ${year} standings extracted: ${standings.afc.length} AFC teams, ${standings.nfc.length} NFC teams`);
            
            // Display top teams from each conference
            if (standings.afc.length > 0) {
                console.log(`   AFC #1: ${standings.afc[0].team} (${standings.afc[0].wins}-${standings.afc[0].losses})`);
            }
            if (standings.nfc.length > 0) {
                console.log(`   NFC #1: ${standings.nfc[0].team} (${standings.nfc[0].wins}-${standings.nfc[0].losses})`);
            }

            return standings;

        } catch (error) {
            console.error(`❌ Error scraping ${year} standings:`, error.message);
            return { year: year, afc: [], nfc: [], error: error.message };
        }
    }

    /**
     * Scrape all NFL conference standings
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

            // Wait for dynamic content to load
            await new Promise(resolve => setTimeout(resolve, 8000));
            
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
            
            // Add delay between requests
            console.log('⏱️  Waiting 2 seconds before next request...');
            await new Promise(resolve => setTimeout(resolve, 2000));
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
        console.log('\n🎯 EXPORTING ALL DATA TO ONE COMPREHENSIVE CSV FILE');
        console.log('=' * 60);
        
        try {
            // Create one massive dataset with everything
            const masterData = [];
            
            // Process all teams with complete information
            Object.entries(this.data.conferenceStandings || {}).forEach(([year, yearData]) => {
                ['afc', 'nfc'].forEach(conference => {
                    if (yearData[conference]) {
                        yearData[conference].forEach((team, index) => {
                            // Check if this team won the Super Bowl
                            const superBowlWinner = this.data.superBowlWinners.find(sb => 
                                sb.year == year && sb.winner === team.team
                            );
                            
                            // Get division info if available
                            let divisionInfo = { name: 'Unknown', rank: null, isLeader: false };
                            const yearDivisions = this.data.divisionStandings[year];
                            if (yearDivisions && yearDivisions.divisions) {
                                Object.entries(yearDivisions.divisions).forEach(([divName, divTeams]) => {
                                    const found = divTeams.find(dt => dt.team === team.team);
                                    if (found) {
                                        divisionInfo = { 
                                            name: divName, 
                                            rank: divTeams.indexOf(found) + 1, 
                                            isLeader: found.isDivisionLeader || false 
                                        };
                                    }
                                });
                            }
                            
                            // Create complete record with ALL information
                            const masterRecord = {
                                // Basic Info
                                year: parseInt(year),
                                team: team.team,
                                conference: conference.toUpperCase(),
                                conference_rank: index + 1,
                                division: divisionInfo.name,
                                division_rank: divisionInfo.rank,
                                is_division_leader: divisionInfo.isLeader ? 1 : 0,
                                
                                // Record & Performance
                                wins: team.wins,
                                losses: team.losses,
                                ties: team.ties,
                                total_games: team.totalGames || (team.wins + team.losses + team.ties),
                                win_percentage: team.winPct,
                                
                                // Scoring
                                points_for: team.pointsFor,
                                points_against: team.pointsAgainst,
                                net_points: team.netPoints,
                                point_differential: team.pointDifferential,
                                average_points_for: team.averagePointsFor,
                                average_points_against: team.averagePointsAgainst,
                                
                                // Home Performance
                                home_wins: team.homeRecord?.wins || 0,
                                home_losses: team.homeRecord?.losses || 0,
                                home_ties: team.homeRecord?.ties || 0,
                                home_win_pct: team.homeWinPct,
                                home_record: team.homeRecord ? `${team.homeRecord.wins}-${team.homeRecord.losses}-${team.homeRecord.ties}` : '0-0-0',
                                
                                // Road Performance
                                road_wins: team.roadRecord?.wins || 0,
                                road_losses: team.roadRecord?.losses || 0,
                                road_ties: team.roadRecord?.ties || 0,
                                road_win_pct: team.roadWinPct,
                                road_record: team.roadRecord ? `${team.roadRecord.wins}-${team.roadRecord.losses}-${team.roadRecord.ties}` : '0-0-0',
                                
                                // Division Performance
                                division_wins: team.divisionRecord?.wins || 0,
                                division_losses: team.divisionRecord?.losses || 0,
                                division_ties: team.divisionRecord?.ties || 0,
                                division_win_pct: team.divisionWinPct,
                                division_record: team.divisionRecord ? `${team.divisionRecord.wins}-${team.divisionRecord.losses}-${team.divisionRecord.ties}` : '0-0-0',
                                
                                // Conference Performance
                                conference_wins: team.conferenceRecord?.wins || 0,
                                conference_losses: team.conferenceRecord?.losses || 0,
                                conference_ties: team.conferenceRecord?.ties || 0,
                                conference_win_pct: team.conferenceWinPct,
                                conference_record: team.conferenceRecord ? `${team.conferenceRecord.wins}-${team.conferenceRecord.losses}-${team.conferenceRecord.ties}` : '0-0-0',
                                
                                // Non-Conference Performance
                                non_conference_wins: team.nonConferenceRecord?.wins || 0,
                                non_conference_losses: team.nonConferenceRecord?.losses || 0,
                                non_conference_ties: team.nonConferenceRecord?.ties || 0,
                                non_conference_record: team.nonConferenceRecord ? `${team.nonConferenceRecord.wins}-${team.nonConferenceRecord.losses}-${team.nonConferenceRecord.ties}` : '0-0-0',
                                
                                // Recent Performance
                                current_streak: team.currentStreak || '',
                                last_five_wins: team.lastFiveGames?.wins || 0,
                                last_five_losses: team.lastFiveGames?.losses || 0,
                                last_five_ties: team.lastFiveGames?.ties || 0,
                                last_five_record: team.lastFiveGames ? `${team.lastFiveGames.wins}-${team.lastFiveGames.losses}-${team.lastFiveGames.ties}` : '0-0-0',
                                
                                // Performance Indicators
                                strong_finish: team.strongFinish ? 1 : 0,
                                is_on_win_streak: team.isOnWinStreak ? 1 : 0,
                                is_on_loss_streak: team.isOnLossStreak ? 1 : 0,
                                
                                // Super Bowl Information
                                won_superbowl: superBowlWinner ? 1 : 0,
                                superbowl_roman: superBowlWinner ? superBowlWinner.superBowl : '',
                                superbowl_date: superBowlWinner ? superBowlWinner.date : '',
                                superbowl_opponent: superBowlWinner ? superBowlWinner.loser : '',
                                superbowl_score: superBowlWinner ? superBowlWinner.score : '',
                                superbowl_season: superBowlWinner ? superBowlWinner.season : '',
                                
                                // Calculated Advanced Metrics
                                point_diff_per_game: team.totalGames > 0 ? (team.pointDifferential / team.totalGames).toFixed(2) : 0,
                                home_road_diff: team.homeWinPct - team.roadWinPct,
                                offensive_efficiency: team.pointsFor > 0 ? (team.pointsFor / team.totalGames).toFixed(1) : 0,
                                defensive_efficiency: team.pointsAgainst > 0 ? (team.pointsAgainst / team.totalGames).toFixed(1) : 0,
                                is_balanced_team: Math.abs(team.homeWinPct - team.roadWinPct) < 0.2 ? 1 : 0,
                                is_elite_offense: team.pointsFor > 450 ? 1 : 0,
                                is_elite_defense: team.pointsAgainst < 300 ? 1 : 0,
                                playoff_seed_estimate: index + 1,
                                
                                // Meta Information
                                data_source: 'comprehensive_scrape',
                                scrape_year: new Date().getFullYear(),
                                table_index: team.tableIndex,
                                row_index: team.rowIndex,
                                extraction_method: team.extractionMethod
                            };
                            
                            masterData.push(masterRecord);
                        });
                    }
                });
            });

            // Sort by year, then by conference, then by wins
            masterData.sort((a, b) => {
                if (a.year !== b.year) return a.year - b.year;
                if (a.conference !== b.conference) return a.conference.localeCompare(b.conference);
                return b.wins - a.wins;
            });

            if (masterData.length > 0) {
                const masterCSV = this.arrayToCSV(masterData);
                this.saveCSV('NFL_COMPLETE_ANALYSIS.csv', masterCSV);
                
                console.log('\n🎉 SINGLE COMPREHENSIVE CSV FILE CREATED!');
                console.log(`📁 File: ${this.csvDirectory}NFL_COMPLETE_ANALYSIS.csv`);
                console.log(`� Total Records: ${masterData.length}`);
                
                // Show summary stats
                const years = [...new Set(masterData.map(t => t.year))];
                const superBowlWinners = masterData.filter(t => t.won_superbowl === 1);
                const divisions = [...new Set(masterData.map(t => t.division).filter(d => d !== 'Unknown'))];
                
                console.log(`\n📈 DATA SUMMARY:`);
                console.log(`   Years: ${years.join(', ')}`);
                console.log(`   Teams: ${[...new Set(masterData.map(t => t.team))].length}`);
                console.log(`   Super Bowl Winners: ${superBowlWinners.length}`);
                console.log(`   Divisions: ${divisions.length}`);
                console.log(`   Total Columns: ${Object.keys(masterData[0]).length}`);
                
                console.log(`\n🏆 SUPER BOWL WINNERS IN FILE:`);
                superBowlWinners.forEach(winner => {
                    console.log(`   ${winner.year}: ${winner.team} (${winner.wins}-${winner.losses}, ${winner.point_differential > 0 ? '+' : ''}${winner.point_differential} pt diff)`);
                });
                
                console.log(`\n🎯 READY FOR ANALYSIS!`);
                console.log(`   This single file contains ALL data needed for prediction modeling:`);
                console.log(`   • Team performance metrics`);
                console.log(`   • Super Bowl winner flags`);
                console.log(`   • Home/road splits`);
                console.log(`   • Division/conference records`);
                console.log(`   • Advanced calculated metrics`);
                console.log(`   • Historical patterns`);
                
            } else {
                console.log('⚠️ No data to export');
            }
            
        } catch (error) {
            console.error('❌ Error during CSV export:', error.message);
        }
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
            const comprehensiveCSV = this.arrayToCSV(comprehensiveData);
            this.saveCSV('comprehensive_team_performance.csv', comprehensiveCSV);
            console.log(`✅ Comprehensive team performance CSV created (${comprehensiveData.length} team records)`);
            
            // Show summary stats
            const superBowlWinners = comprehensiveData.filter(t => t.won_superbowl === 1);
            console.log(`   🏆 Super Bowl winners in dataset: ${superBowlWinners.length}`);
            console.log(`   📊 Years covered: ${[...new Set(comprehensiveData.map(t => t.year))].join(', ')}`);
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
