const https = require('https');

function testEndpoint(method, path, data = null, description) {
    return new Promise((resolve) => {
        console.log(`\n🧪 Test: ${description}`);
        console.log(`📡 ${method} https://evenvo-demo-premium.onrender.com${path}`);
        
        const postData = data ? JSON.stringify(data) : null;
        
        const options = {
            hostname: 'evenvo-demo-premium.onrender.com',
            port: 443,
            path: path,
            method: method,
            headers: {
                'Content-Type': 'application/json'
            }
        };

        if (postData) {
            options.headers['Content-Length'] = Buffer.byteLength(postData);
        }

        const req = https.request(options, (res) => {
            let responseData = '';
            
            res.on('data', (chunk) => {
                responseData += chunk;
            });
            
            res.on('end', () => {
                console.log(`📊 Status: ${res.statusCode}`);
                
                try {
                    const jsonData = JSON.parse(responseData);
                    console.log(`✅ JSON Response:`, JSON.stringify(jsonData, null, 2));
                } catch (e) {
                    console.log(`📄 Raw Response:`, responseData.substring(0, 200));
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

        if (postData) {
            req.write(postData);
        }
        req.end();
    });
}

async function runAllTests() {
    console.log('🚀 Test complet des endpoints de vote...');
    
    // Test 1: Liste des événements
    await testEndpoint('GET', '/api/events/list', null, 'Liste des événements');
    
    // Test 2: Formulaires actifs
    await testEndpoint('GET', '/api/event/Event_1/active_vote_forms', null, 'Formulaires actifs');
    
    // Test 3: Soumission de vote
    await testEndpoint('POST', '/api/event/Event_1/submit_vote', {
        formId: 'test_form',
        userId: 'test_user',
        responses: { question1: 'Option 1' }
    }, 'Soumission de vote');
    
    console.log('\n✅ Tous les tests terminés');
}

runAllTests().catch(console.error);