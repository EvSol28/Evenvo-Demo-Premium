// Script de test pour l'API des formulaires de vote
const http = require('http');

function testAPI(path, description) {
    return new Promise((resolve) => {
        http.get(`http://localhost:4001${path}`, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                console.log(`✅ ${description}: Status ${res.statusCode}`);
                if (res.statusCode === 200) {
                    try {
                        const json = JSON.parse(data);
                        console.log(`   Response:`, json);
                    } catch (e) {
                        console.log(`   Response: ${data.substring(0, 100)}...`);
                    }
                }
                resolve(res.statusCode);
            });
        }).on('error', (err) => {
            console.log(`❌ ${description}: ${err.message}`);
            resolve(null);
        });
    });
}

async function runTests() {
    console.log('🧪 Test des APIs de vote...\n');
    
    await testAPI('/api/event/Event_1/active_vote_forms', 'API formulaires actifs (Event_1)');
    await testAPI('/api/event/event_1/active_vote_forms', 'API formulaires actifs (event_1)');
    
    console.log('\n✅ Tests terminés');
    process.exit(0);
}

runTests();