const http = require('http');
const https = require('https');

// Configuration
const BASE_URL = 'https://evenvo-demo-premium.onrender.com';

function testAPI(endpoint, description) {
    return new Promise((resolve) => {
        console.log(`\n🧪 Test: ${description}`);
        console.log(`📡 URL: ${BASE_URL}${endpoint}`);
        
        const url = new URL(`${BASE_URL}${endpoint}`);
        const options = {
            hostname: url.hostname,
            port: url.port || 443,
            path: url.pathname + url.search,
            method: 'GET',
            headers: {
                'Content-Type': 'application/json'
            }
        };

        const req = https.request(options, (res) => {
            let data = '';
            
            res.on('data', (chunk) => {
                data += chunk;
            });
            
            res.on('end', () => {
                console.log(`📊 Status: ${res.statusCode}`);
                
                try {
                    const jsonData = JSON.parse(data);
                    console.log(`✅ Response:`, JSON.stringify(jsonData, null, 2));
                } catch (e) {
                    console.log(`📄 Raw Response:`, data.substring(0, 200));
                }
                
                resolve();
            });
        });

        req.on('error', (error) => {
            console.log(`❌ Error: ${error.message}`);
            resolve();
        });

        req.setTimeout(10000, () => {
            console.log(`⏰ Timeout after 10 seconds`);
            req.destroy();
            resolve();
        });

        req.end();
    });
}

async function runTests() {
    console.log('🚀 Test des nouveaux endpoints API...\n');
    
    // Test 1: Liste des événements
    await testAPI('/api/events/list', 'API liste des événements');
    
    // Test 2: Formulaires actifs pour Event_1
    await testAPI('/api/event/Event_1/active_vote_forms', 'API formulaires actifs (Event_1)');
    
    // Test 3: Formulaires actifs pour event_1 (minuscule)
    await testAPI('/api/event/event_1/active_vote_forms', 'API formulaires actifs (event_1)');
    
    console.log('\n✅ Tests terminés');
}

runTests().catch(console.error);