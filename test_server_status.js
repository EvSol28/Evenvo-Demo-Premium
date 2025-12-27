const https = require('https');

function testEndpoint(path, description) {
    return new Promise((resolve) => {
        console.log(`\n🧪 Test: ${description}`);
        console.log(`📡 URL: https://evenvo-demo-premium.onrender.com${path}`);
        
        const options = {
            hostname: 'evenvo-demo-premium.onrender.com',
            port: 443,
            path: path,
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
                console.log(`📄 Response: ${data.substring(0, 200)}...`);
                resolve();
            });
        });

        req.on('error', (error) => {
            console.log(`❌ Error: ${error.message}`);
            resolve();
        });

        req.setTimeout(10000, () => {
            console.log(`⏰ Timeout`);
            req.destroy();
            resolve();
        });

        req.end();
    });
}

async function checkServer() {
    console.log('🔍 Vérification du statut du serveur...');
    
    // Test du serveur principal
    await testEndpoint('/', 'Page d\'accueil');
    
    // Test d'un endpoint connu
    await testEndpoint('/api/getEventStatus/Event_1', 'Endpoint existant');
    
    console.log('\n✅ Vérifications terminées');
}

checkServer().catch(console.error);