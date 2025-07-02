const fs = require('fs');
const path = require('path');

/**
 * Creates ONE MASTER CSV file with ALL NFL data combined
 */
class MasterCSVCreator {
    constructor() {
        this.allData = [];
    }

    /**
     * Load and process the dt.json file into one comprehensive dataset
     */
    async createMasterCSV(inputFile = 'dt.json', outputFile = 'NFL_MASTER_DATA.csv') {
        try {
            console.log('🏈 Creating ONE MASTER CSV with ALL NFL data...');
            
            // Read the JSON data
            const jsonData = JSON.parse(fs.readFileSync(inputFile, 'utf8'));
            
            // Process all data and combine into single records
            this.processAllData(jsonData);
            
            // Create the master CSV
            this.exportToCSV(outputFile);
            
            console.log(`✅ MASTER CSV created: ${outputFile}`);
            console.log(`📊 Total records: ${this.allData.length}`);
            
        } catch (error) {
            console.error('❌ Error creating master CSV:', error.message);
            throw error;
        }
    }

    /**
     * Process all JSON data and create comprehensive records
     */
    processAllData(data) {
        const years = data.metadata.years || [];
        const superBowls = this.indexSuperBowlsByYear(data.superBowlWinners || []);
        
        // Process each year
        years.forEach(year => {
            const conferenceData = data.conferenceStandings?.[year] || {};
            const divisionData = data.divisionStandings?.[year] || {};
            const superBowlInfo = superBowls[year] || {};
            
            // Get all teams from both conference and division data
            const allTeams = new Set();
            
            // Add teams from conference standings
            ['afc', 'nfc'].forEach(conf => {
                if (conferenceData[conf]) {
                    conferenceData[conf].forEach(team => allTeams.add(team.team));
                }
            });
            
            // Add teams from division standings
            ['afcEast', 'afcNorth', 'afcSouth', 'afcWest', 'nfcEast', 'nfcNorth', 'nfcSouth', 'nfcWest'].forEach(div => {
                if (divisionData[div]) {
                    divisionData[div].forEach(team => allTeams.add(team.team));
                }
            });
            
            // Create comprehensive record for each team
            allTeams.forEach(teamName => {
                const record = this.createComprehensiveRecord(
                    year, 
                    teamName, 
                    conferenceData, 
                    divisionData, 
                    superBowlInfo
                );
                this.allData.push(record);
            });
        });
    }

    /**
     * Create a comprehensive record with ALL available data for a team
     */
    createComprehensiveRecord(year, teamName, conferenceData, divisionData, superBowlInfo) {
        // Find team in conference standings
        let conferenceTeam = null;
        let conference = '';
        ['afc', 'nfc'].forEach(conf => {
            if (conferenceData[conf]) {
                const found = conferenceData[conf].find(t => t.team === teamName);
                if (found) {
                    conferenceTeam = found;
                    conference = conf.toUpperCase();
                }
            }
        });

        // Find team in division standings
        let divisionTeam = null;
        let division = '';
        const divisions = {
            'afcEast': 'AFC East', 'afcNorth': 'AFC North', 'afcSouth': 'AFC South', 'afcWest': 'AFC West',
            'nfcEast': 'NFC East', 'nfcNorth': 'NFC North', 'nfcSouth': 'NFC South', 'nfcWest': 'NFC West'
        };
        
        Object.entries(divisions).forEach(([divKey, divName]) => {
            if (divisionData[divKey]) {
                const found = divisionData[divKey].find(t => t.team === teamName);
                if (found) {
                    divisionTeam = found;
                    division = divName;
                }
            }
        });

        // Use the most complete team data available
        const teamData = conferenceTeam || divisionTeam || { team: teamName };

        // Super Bowl information
        const isSuperbowlWinner = superBowlInfo.winner === teamName;
        const isSuperbowlLoser = superBowlInfo.loser === teamName;
        const wasInSuperbowl = isSuperbowlWinner || isSuperbowlLoser;

        // Create comprehensive record
        return {
            // Basic Info
            year: year,
            team: teamName,
            conference: conference,
            year_winner: superBowlInfo.winner || '',
            
            // Standings Data
            wins: this.safeInt(teamData.wins),
            losses: this.safeInt(teamData.losses),
            ties: this.safeInt(teamData.ties) || 0,
            win_percentage: this.safeFloat(teamData.winPercentage),
            
            // Conference Position
            conference_rank: this.safeInt(conferenceTeam?.conferenceRank),
            
            // Points
            points_for: this.safeInt(teamData.pointsFor),
            points_against: this.safeInt(teamData.pointsAgainst),
            point_differential: this.safeInt(teamData.pointDifferential),
            
            // Playoff Status
            playoff_seed: this.safeInt(teamData.playoffSeed),
            made_playoffs: teamData.madePlayoffs === true ? 1 : 0,
            
            // Super Bowl Data
            superbowl_winner: isSuperbowlWinner ? 1 : 0,
            superbowl_loser: isSuperbowlLoser ? 1 : 0,
            superbowl_participant: wasInSuperbowl ? 1 : 0,
            superbowl_name: wasInSuperbowl ? superBowlInfo.superBowl : '',
            superbowl_score: wasInSuperbowl ? superBowlInfo.score : '',
            superbowl_date: wasInSuperbowl ? superBowlInfo.date : '',
            
            // Advanced Metrics
            strength_of_victory: this.safeFloat(teamData.strengthOfVictory),
            strength_of_schedule: this.safeFloat(teamData.strengthOfSchedule),
            
            // Conference Record
            conference_wins: this.safeInt(teamData.conferenceRecord?.wins),
            conference_losses: this.safeInt(teamData.conferenceRecord?.losses),
            conference_ties: this.safeInt(teamData.conferenceRecord?.ties) || 0,
            
            // Performance Flags
            winning_season: (this.safeInt(teamData.wins) > this.safeInt(teamData.losses)) ? 1 : 0,
            above_500: (this.safeFloat(teamData.winPercentage) > 0.5) ? 1 : 0,
            
            // Meta Information
            data_source: 'NFL.com + Wikipedia',
            scraped_from_conference: conferenceTeam ? 1 : 0,
            scraped_from_division: divisionTeam ? 1 : 0
        };
    }

    /**
     * Index Super Bowl winners by year
     */
    indexSuperBowlsByYear(superBowls) {
        const indexed = {};
        superBowls.forEach(sb => {
            indexed[sb.year] = sb;
        });
        return indexed;
    }

    /**
     * Safe integer conversion
     */
    safeInt(value) {
        if (value === null || value === undefined || value === '') return 0;
        const parsed = parseInt(value);
        return isNaN(parsed) ? 0 : parsed;
    }

    /**
     * Safe float conversion
     */
    safeFloat(value) {
        if (value === null || value === undefined || value === '') return 0.0;
        const parsed = parseFloat(value);
        return isNaN(parsed) ? 0.0 : parsed;
    }

    /**
     * Export all data to ONE master CSV file
     */
    exportToCSV(filename) {
        if (this.allData.length === 0) {
            throw new Error('No data to export');
        }

        // Get all possible headers from the data
        const headers = Object.keys(this.allData[0]);
        
        // Create CSV content
        let csvContent = headers.join(',') + '\n';
        
        this.allData.forEach(record => {
            const row = headers.map(header => {
                let value = record[header];
                if (value === null || value === undefined) {
                    value = '';
                }
                // Escape commas and quotes in CSV
                if (typeof value === 'string' && (value.includes(',') || value.includes('"'))) {
                    value = `"${value.replace(/"/g, '""')}"`;
                }
                return value;
            });
            csvContent += row.join(',') + '\n';
        });

        // Write the file
        fs.writeFileSync(filename, csvContent, 'utf8');
        
        console.log(`📊 CSV Headers: ${headers.join(', ')}`);
        console.log(`📈 Sample record count: ${this.allData.length}`);
    }
}

// Main execution
async function main() {
    try {
        const creator = new MasterCSVCreator();
        await creator.createMasterCSV('dt.json', 'NFL_MASTER_DATA.csv');
        
        console.log('\n🎉 SUCCESS! ONE master CSV file created with ALL NFL data!');
        console.log('📁 File: NFL_MASTER_DATA.csv');
        console.log('📊 Contains: Team standings, Super Bowl data, playoffs, divisions, conferences - EVERYTHING!');
        
    } catch (error) {
        console.error('❌ Failed to create master CSV:', error.message);
        process.exit(1);
    }
}

// Run if called directly
if (require.main === module) {
    main();
}

module.exports = MasterCSVCreator;
