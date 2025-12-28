const https = require('https');

function testAPI(endpoint, method = 'GET', data = null, description) {
    return new Promise((resolve) => {
        console.log(`\n🧪 Test: ${description}`);
        console.log(`📡 ${method} https://evenvo-demo-premium.onrender.com${endpoint}`);
        
        const postData = data ? JSON.stringify(data) : null;
        
        const options = {
            hostname: 'evenvo-demo-premium.onrender.com',
            port: 443,
            path: endpoint,
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
                
                if (res.statusCode === 200) {
                    try {
                        const jsonData = JSON.parse(responseData);
                        console.log(`✅ JSON Response:`, JSON.stringify(jsonData, null, 2));
                    } catch (e) {
                        console.log(`✅ Response received (${responseData.length} chars)`);
                    }
                } else if (res.statusCode === 302 || res.statusCode === 301) {
                    console.log(`🔄 Redirection vers: ${res.headers.location || 'Non spécifié'}`);
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

async function testCompleteSystem() {
    console.log('🚀 Test complet du système de vote par formulaires...\n');
    
    // Test des endpoints API
    console.log('=== TESTS DES ENDPOINTS API ===');
    await testAPI('/api/events/list', 'GET', null, 'Liste des événements');
    await testAPI('/api/event/Event_1/active_vote_forms', 'GET', null, 'Formulaires actifs');
    
    // Test de soumission de vote
    await testAPI('/api/event/Event_1/submit_vote', 'POST', {
        formId: 'test_form',
        userId: 'test_user',
        responses: {
            'field_1': 'Option 1',
            'field_2': ['Choix A', 'Choix B'],
            'field_3': { text: 'Ma position', vote: 'Oui' }
        }
    }, 'Soumission de vote');
    
    // Test des pages BO (redirection attendue car non authentifié)
    console.log('\n=== TESTS DES PAGES BACKEND ===');
    await testAPI('/event/Event_1/vote_form_builder', 'GET', null, 'Page créateur de formulaires');
    await testAPI('/event/Event_1/suivi_vote', 'GET', null, 'Page suivi de vote (nouveau système)');
    
    console.log('\n✅ Tests terminés');
    console.log('\n📋 RÉSUMÉ:');
    console.log('- Les endpoints API doivent retourner 200 ou des données JSON');
    console.log('- Les pages BO doivent rediriger vers / (authentification requise)');
    console.log('- Status 404 = endpoint non déployé');
    console.log('- Status 500 = erreur serveur');
}

testCompleteSystem().catch(console.error);