const fs = require('fs');
const path = require('path');

class JSONToCSVConverter {
    constructor() {
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
                // Handle objects and arrays
                if (typeof value === 'object') {
                    value = JSON.stringify(value).replace(/"/g, '""');
                }
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
        console.log(`💾 CSV saved: ${filename} (${csvContent.split('\n').length - 1} records)`);
        return filePath;
    }

    /**
     * Flatten team standings data for CSV export
     */
    flattenTeamStandings(conferenceStandings) {
        const flattenedData = [];
        
        Object.entries(conferenceStandings).forEach(([year, yearData]) => {
            ['afc', 'nfc'].forEach(conference => {
                if (yearData[conference]) {
                    yearData[conference].forEach((team, index) => {
                        const flatTeam = {
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
                            total_games: team.totalGames,
                            average_points_for: team.averagePointsFor,
                            average_points_against: team.averagePointsAgainst,
                            home_wins: team.homeRecord?.wins || 0,
                            home_losses: team.homeRecord?.losses || 0,
                            home_ties: team.homeRecord?.ties || 0,
                            home_win_pct: team.homeWinPct,
                            road_wins: team.roadRecord?.wins || 0,
                            road_losses: team.roadRecord?.losses || 0,
                            road_ties: team.roadRecord?.ties || 0,
                            road_win_pct: team.roadWinPct,
                            division_wins: team.divisionRecord?.wins || 0,
                            division_losses: team.divisionRecord?.losses || 0,
                            division_ties: team.divisionRecord?.ties || 0,
                            division_win_pct: team.divisionWinPct,
                            conference_wins: team.conferenceRecord?.wins || 0,
                            conference_losses: team.conferenceRecord?.losses || 0,
                            conference_ties: team.conferenceRecord?.ties || 0,
                            conference_win_pct: team.conferenceWinPct,
                            non_conference_wins: team.nonConferenceRecord?.wins || 0,
                            non_conference_losses: team.nonConferenceRecord?.losses || 0,
                            non_conference_ties: team.nonConferenceRecord?.ties || 0,
                            current_streak: team.currentStreak,
                            last_five_wins: team.lastFiveGames?.wins || 0,
                            last_five_losses: team.lastFiveGames?.losses || 0,
                            last_five_ties: team.lastFiveGames?.ties || 0,
                            strong_finish: team.strongFinish,
                            is_on_win_streak: team.isOnWinStreak,
                            is_on_loss_streak: team.isOnLossStreak,
                            table_index: team.tableIndex,
                            row_index: team.rowIndex,
                            extraction_method: team.extractionMethod
                        };
                        flattenedData.push(flatTeam);
                    });
                }
            });
        });
        
        return flattenedData;
    }

    /**
     * Convert division standings to flat structure
     */
    flattenDivisionStandings(divisionStandings) {
        const flattenedData = [];
        
        Object.entries(divisionStandings).forEach(([year, yearData]) => {
            Object.entries(yearData.divisions || {}).forEach(([divisionName, teams]) => {
                teams.forEach((team, index) => {
                    const flatTeam = {
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
                        last_five: team.lastFiveGames ? `${team.lastFiveGames.wins}-${team.lastFiveGames.losses}-${team.lastFiveGames.ties}` : ''
                    };
                    flattenedData.push(flatTeam);
                });
            });
        });
        
        return flattenedData;
    }

    /**
     * Convert dt.json to ONE comprehensive CSV file
     */
    convertDTJsonToCSV(jsonFilePath = './dt.json') {
        console.log('🔄 Converting dt.json to ONE COMPREHENSIVE CSV...');
        
        if (!fs.existsSync(jsonFilePath)) {
            console.error(`❌ File not found: ${jsonFilePath}`);
            return;
        }

        try {
            const data = JSON.parse(fs.readFileSync(jsonFilePath, 'utf8'));
            console.log('✅ JSON data loaded successfully');

            // Create one massive dataset with everything
            const masterData = [];
            
            // Process all teams with complete information
            Object.entries(data.conferenceStandings || {}).forEach(([year, yearData]) => {
                ['afc', 'nfc'].forEach(conference => {
                    if (yearData[conference]) {
                        yearData[conference].forEach((team, index) => {
                            // Check if this team won the Super Bowl
                            const superBowlWinner = data.superBowlWinners.find(sb => 
                                sb.year == year && sb.winner === team.team
                            );
                            
                            // Get division info if available
                            let divisionInfo = { name: 'Unknown', rank: null, isLeader: false };
                            const yearDivisions = data.divisionStandings[year];
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
                                year_winner: data.superBowlWinners.find(sb => sb.year == year)?.winner || '',
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
                                home_road_diff: (team.homeWinPct || 0) - (team.roadWinPct || 0),
                                offensive_efficiency: team.pointsFor > 0 && team.totalGames > 0 ? (team.pointsFor / team.totalGames).toFixed(1) : 0,
                                defensive_efficiency: team.pointsAgainst > 0 && team.totalGames > 0 ? (team.pointsAgainst / team.totalGames).toFixed(1) : 0,
                                is_balanced_team: Math.abs((team.homeWinPct || 0) - (team.roadWinPct || 0)) < 0.2 ? 1 : 0,
                                is_elite_offense: (team.pointsFor || 0) > 450 ? 1 : 0,
                                is_elite_defense: (team.pointsAgainst || 0) < 300 ? 1 : 0,
                                playoff_seed_estimate: index + 1,
                                
                                // Meta Information
                                data_source: 'json_conversion',
                                conversion_date: new Date().toISOString(),
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
                console.log(`   This single file contains ALL data needed for prediction modeling.`);
                
            } else {
                console.log('⚠️ No data to convert');
            }

        } catch (error) {
            console.error('❌ Error converting JSON to CSV:', error.message);
        }
    }

    /**
     * Create a comprehensive team performance CSV combining all data
     */
    createComprehensiveTeamCSV(jsonFilePath = './dt.json') {
        console.log('\n🔄 Creating comprehensive team performance CSV...');
        
        try {
            const data = JSON.parse(fs.readFileSync(jsonFilePath, 'utf8'));
            const comprehensiveData = [];

            // Get all teams across all years
            Object.entries(data.conferenceStandings || {}).forEach(([year, yearData]) => {
                ['afc', 'nfc'].forEach(conference => {
                    if (yearData[conference]) {
                        yearData[conference].forEach(team => {
                            // Check if this team won the Super Bowl
                            const superBowlWinner = data.superBowlWinners.find(sb => 
                                sb.year == year && sb.winner === team.team
                            );
                            
                            const comprehensiveTeam = {
                                year: parseInt(year),
                                team: team.team,
                                conference: conference.toUpperCase(),
                                wins: team.wins,
                                losses: team.losses,
                                ties: team.ties,
                                win_percentage: team.winPct,
                                points_for: team.pointsFor,
                                points_against: team.pointsAgainst,
                                point_differential: team.pointDifferential,
                                home_win_pct: team.homeWinPct,
                                road_win_pct: team.roadWinPct,
                                division_win_pct: team.divisionWinPct,
                                conference_win_pct: team.conferenceWinPct,
                                won_superbowl: superBowlWinner ? 1 : 0,
                                superbowl_opponent: superBowlWinner ? superBowlWinner.loser : '',
                                superbowl_score: superBowlWinner ? superBowlWinner.score : '',
                                current_streak: team.currentStreak,
                                strong_finish: team.strongFinish ? 1 : 0,
                                average_points_for: team.averagePointsFor,
                                average_points_against: team.averagePointsAgainst
                            };
                            
                            comprehensiveData.push(comprehensiveTeam);
                        });
                    }
                });
            });

            if (comprehensiveData.length > 0) {
                const comprehensiveCSV = this.arrayToCSV(comprehensiveData);
                this.saveCSV('comprehensive_team_performance.csv', comprehensiveCSV);
                console.log('✅ Comprehensive team performance CSV created');
            }

        } catch (error) {
            console.error('❌ Error creating comprehensive CSV:', error.message);
        }
    }
}

// Main execution
if (require.main === module) {
    const converter = new JSONToCSVConverter();
    
    console.log('🚀 NFL Data JSON to CSV Converter');
    console.log('=' * 40);
    
    // Convert existing dt.json to CSV
    converter.convertDTJsonToCSV();
    
    // Create comprehensive team performance CSV
    converter.createComprehensiveTeamCSV();
    
    console.log('\n✅ All conversions completed!');
}

module.exports = JSONToCSVConverter;
