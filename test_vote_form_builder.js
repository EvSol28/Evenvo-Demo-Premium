const https = require('https');

function testEndpoint(method, path, description) {
    return new Promise((resolve) => {
        console.log(`\n🧪 Test: ${description}`);
        console.log(`📡 ${method} https://evenvo-demo-premium.onrender.com${path}`);
        
        const options = {
            hostname: 'evenvo-demo-premium.onrender.com',
            port: 443,
            path: path,
            method: method,
            headers: {
                'Content-Type': 'text/html'
            }
        };

        const req = https.request(options, (res) => {
            let responseData = '';
            
            res.on('data', (chunk) => {
                responseData += chunk;
            });
            
            res.on('end', () => {
                console.log(`📊 Status: ${res.statusCode}`);
                
                if (res.statusCode === 200) {
                    console.log(`✅ Page chargée avec succès`);
                } else if (res.statusCode === 302 || res.statusCode === 301) {
                    console.log(`🔄 Redirection vers: ${res.headers.location}`);
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

        req.setTimeout(10000, () => {
            console.log(`⏰ Timeout`);
            req.destroy();
            resolve();
        });

        req.end();
    });
}

async function testVoteFormBuilder() {
    console.log('🚀 Test du créateur de formulaires de vote...');
    
    // Test de la page vote_form_builder
    await testEndpoint('GET', '/event/Event_1/vote_form_builder', 'Page créateur de formulaires');
    
    // Test de la page suivi_vote
    await testEndpoint('GET', '/event/Event_1/suivi_vote', 'Page suivi de vote');
    
    console.log('\n✅ Tests terminés');
}

testVoteFormBuilder().catch(console.error);