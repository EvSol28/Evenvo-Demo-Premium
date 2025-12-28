const http = require('http');

function testLocalEndpoint(path, description) {
    return new Promise((resolve) => {
        console.log(`\n🧪 Test: ${description}`);
        console.log(`📡 GET http://localhost:4001${path}`);
        
        const options = {
            hostname: 'localhost',
            port: 4001,
            path: path,
            method: 'GET',
            headers: {
                'Content-Type': 'text/html'
            }
        };

        const req = http.request(options, (res) => {
            let responseData = '';
            
            res.on('data', (chunk) => {
                responseData += chunk;
            });
            
            res.on('end', () => {
                console.log(`📊 Status: ${res.statusCode}`);
                
                if (res.statusCode === 200) {
                    console.log(`✅ Page chargée avec succès (${responseData.length} chars)`);
                } else if (res.statusCode === 302 || res.statusCode === 301) {
                    console.log(`🔄 Redirection vers: ${res.headers.location}`);
                } else if (res.statusCode === 404) {
                    console.log(`❌ Endpoint non trouvé`);
                } else {
                    console.log(`📄 Response: ${responseData.substring(0, 200)}...`);
                }
                
                resolve();
            });
        });

        req.on('error', (error) => {
            console.log(`❌ Error: ${error.message}`);
            resolve();
        });

        req.setTimeout(5000, () => {
            console.log(`⏰ Timeout`);
            req.destroy();
            resolve();
        });

        req.end();
    });
}

async function testLocalEndpoints() {
    console.log('🚀 Test des endpoints locaux...');
    
    // Test des pages principales
    await testLocalEndpoint('/', 'Page d\'accueil');
    await testLocalEndpoint('/event/Event_1/vote_form_builder', 'Créateur de formulaires');
    await testLocalEndpoint('/event/Event_1/suivi_vote', 'Suivi de vote');
    
    console.log('\n✅ Tests terminés');
}

testLocalEndpoints().catch(console.error);