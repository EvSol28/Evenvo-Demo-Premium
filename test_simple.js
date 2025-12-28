const https = require('https');

function testEndpoint(path) {
    return new Promise((resolve) => {
        console.log(`Testing: https://evenvo-demo-premium.onrender.com${path}`);
        
        const options = {
            hostname: 'evenvo-demo-premium.onrender.com',
            port: 443,
            path: path,
            method: 'GET'
        };

        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', (chunk) => data += chunk);
            res.on('end', () => {
                console.log(`Status: ${res.statusCode}`);
                console.log(`Response: ${data}`);
                resolve();
            });
        });

        req.on('error', (error) => {
            console.log(`Error: ${error.message}`);
            resolve();
        });

        req.setTimeout(10000, () => {
            console.log('Timeout');
            req.destroy();
            resolve();
        });

        req.end();
    });
}

async function test() {
    await testEndpoint('/api/test');
    await testEndpoint('/api/events/list');
    await testEndpoint('/api/event/Event_1/active_vote_forms');
}

test();