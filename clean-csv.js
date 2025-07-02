const fs = require('fs');
const path = require('path');

// Function to clean CSV by removing columns with only undefined/NaN values
function cleanCSV(inputFile, outputFile) {
    console.log(`Reading CSV file: ${inputFile}`);
    
    // Read the CSV file
    const csvContent = fs.readFileSync(inputFile, 'utf8');
    const lines = csvContent.trim().split('\n');
    
    if (lines.length === 0) {
        console.log('Empty CSV file');
        return;
    }
    
    // Parse CSV manually (handling quoted fields)
    function parseCSVLine(line) {
        const result = [];
        let current = '';
        let inQuotes = false;
        
        for (let i = 0; i < line.length; i++) {
            const char = line[i];
            
            if (char === '"') {
                inQuotes = !inQuotes;
            } else if (char === ',' && !inQuotes) {
                result.push(current);
                current = '';
            } else {
                current += char;
            }
        }
        result.push(current);
        
        return result;
    }
    
    // Parse all lines
    const parsedLines = lines.map(parseCSVLine);
    const headers = parsedLines[0];
    const dataRows = parsedLines.slice(1);
    
    console.log(`Found ${headers.length} columns and ${dataRows.length} data rows`);
    
    // Identify columns to keep
    const columnsToKeep = [];
    const columnsToRemove = [];
    
    for (let colIndex = 0; colIndex < headers.length; colIndex++) {
        const columnName = headers[colIndex];
        const columnValues = dataRows.map(row => row[colIndex]);
        
        // Check if all values in this column are undefined, "undefined-undefined-undefined", "NaN", or empty
        const allInvalid = columnValues.every(value => {
            const trimmedValue = (value || '').trim();
            return (
                trimmedValue === '' ||
                trimmedValue === 'undefined' ||
                trimmedValue === 'undefined-undefined-undefined' ||
                trimmedValue === 'NaN' ||
                trimmedValue === '""' ||
                trimmedValue === '"undefined"' ||
                trimmedValue === '"undefined-undefined-undefined"' ||
                trimmedValue === '"NaN"'
            );
        });
        
        if (allInvalid) {
            columnsToRemove.push(columnName);
        } else {
            columnsToKeep.push(colIndex);
        }
    }
    
    console.log(`Columns to remove (${columnsToRemove.length}):`, columnsToRemove);
    console.log(`Columns to keep: ${columnsToKeep.length}`);
    
    // Create cleaned data
    const cleanedHeaders = columnsToKeep.map(index => headers[index]);
    const cleanedRows = dataRows.map(row => columnsToKeep.map(index => row[index] || ''));
    
    // Convert back to CSV format
    function formatCSVLine(fields) {
        return fields.map(field => {
            // Escape quotes and wrap in quotes if necessary
            const fieldStr = String(field);
            if (fieldStr.includes(',') || fieldStr.includes('"') || fieldStr.includes('\n')) {
                return `"${fieldStr.replace(/"/g, '""')}"`;
            }
            return fieldStr;
        }).join(',');
    }
    
    const cleanedCSV = [
        formatCSVLine(cleanedHeaders),
        ...cleanedRows.map(formatCSVLine)
    ].join('\n');
    
    // Write cleaned CSV
    fs.writeFileSync(outputFile, cleanedCSV, 'utf8');
    
    console.log(`\nCleaning completed!`);
    console.log(`Original file: ${inputFile}`);
    console.log(`Cleaned file: ${outputFile}`);
    console.log(`Removed ${columnsToRemove.length} columns with only undefined/NaN values`);
    console.log(`Kept ${columnsToKeep.length} columns with valid data`);
    
    // Show some sample removed columns
    if (columnsToRemove.length > 0) {
        console.log('\nSample removed columns:');
        columnsToRemove.slice(0, 10).forEach(col => console.log(`  - ${col}`));
        if (columnsToRemove.length > 10) {
            console.log(`  ... and ${columnsToRemove.length - 10} more`);
        }
    }
}

// Main execution
const inputFile = path.join(__dirname, 'csv_exports', 'NFL_COMPLETE_ANALYSIS.csv');
const outputFile = path.join(__dirname, 'csv_exports', 'NFL_CLEANED_ANALYSIS.csv');

if (!fs.existsSync(inputFile)) {
    console.error(`Input file not found: ${inputFile}`);
    process.exit(1);
}

try {
    cleanCSV(inputFile, outputFile);
} catch (error) {
    console.error('Error cleaning CSV:', error.message);
    process.exit(1);
}
