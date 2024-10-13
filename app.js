const ping = require('ping');
const express = require('express');
const fs = require('fs');
const path = require('path');


const config = require('./config.json');

const app = express();
const port = 4000;


if (!fs.existsSync(config.logDir)) {
    fs.mkdirSync(config.logDir);
}


const getCurrentDate = () => {
    const now = new Date();
    return now.toISOString().split('T')[0]; // Format: YYYY-MM-DD
};

const logResults = [];

const logPingResult = (target, time, error) => {
    const timestamp = new Date().toISOString().replace('T', ' ').substr(0, 19);
    const logRow = { timestamp, target, time, error }
    logResults.push(logRow);

    if (logResults.length >= 10) {
        let logTexts = [];
        logResults.forEach(logRow => {
            logTexts.push(`${logRow.timestamp} - ${logRow.target} - ${logRow.error ? logRow.error : `time=${logRow.time}ms`}\n`);
        });

        const logFileName = path.join(__dirname, 'logs', `${getCurrentDate()}.log`);
        fs.appendFile(logFileName, logTexts.join(''), (err) => {
            if (err) console.error(`Error writing logs:`, err);
            logResults.length = 0;
        });
        logResults.length = 0;
    }
};

const pingTargets = async () => {
    let interval = config.pingInterval;


    const startTime = Date.now();
    const pingPromises = config.targets.map(target => 
        ping.promise.probe(target, { timeout: 3000 })
            .then(res => {
                if (res.alive) {
                    return { target, time: res.time };
                } else {
                    return { target, error: 'Request timed out' };
                }
            })
            .catch(error => ({ target, error: error.message }))
    );

    try {
        const results = await Promise.all(pingPromises);
        results.forEach(result => {
            if (result.error) {
                logPingResult(result.target, null, result.error);
            } else {
                logPingResult(result.target, result.time);
            }
        });
    } catch (error) {
        console.error('Error during ping operations:', error);
    }

    setTimeout(pingTargets, Math.max(0, interval - (Date.now() - startTime)));
};

setTimeout(pingTargets, 0);

app.get('/', (req, res) => {
    const logFileName = path.join(config.logDir, `${getCurrentDate()}.log`);
    if (fs.existsSync(logFileName)) {
        fs.readFile(logFileName, 'utf8', (err, data) => {
            if (err) {
                return res.status(500).send('Error reading logs');
            }

            // Filter log entries with high ping times or timeouts
            const disruptions = data.split('\n').filter(line => {
                const match = line.match(/time=(\d+)ms/);
                if (match && parseInt(match[1]) > config.highPingThreshold) {
                    return true;
                }
                return line.includes('Request timed out');
            });

            res.send(`<h1>Recent Disruptions</h1><pre>${disruptions.join('\n')}</pre>`);
        });
    } else {
        res.send('<h1>No logs available for today.</h1>');
    }
});

app.listen(port, () => {
    console.log(`Monitoring app running on http://localhost:${port}`);
});
