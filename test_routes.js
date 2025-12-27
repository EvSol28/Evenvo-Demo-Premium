// Script de test pour vérifier les routes
const http = require('http');

function testRoute(path, description) {
    return new Promise((resolve) => {
        http.get(`http://localhost:4000${path}`, (res) => {
            console.log(`✅ ${description}: Status ${res.statusCode}`);
            resolve(res.statusCode);
        }).on('error', (err) => {
            console.log(`❌ ${description}: ${err.message}`);
            resolve(null);
        });
    });
}

async function runTests() {
    console.log('🧪 Test des routes...\n');
    
    await testRoute('/', 'Route racine');
    await testRoute('/test_route', 'Route de test simple');
    await testRoute('/event/Event_1/test', 'Route de test event');
    await testRoute('/event/Event_1/vote_form_builder', 'Route vote_form_builder');
    await testRoute('/event/Event_1/gestion_event', 'Route gestion_event (pour comparaison)');
    
    console.log('\n✅ Tests terminés');
    process.exit(0);
}

runTests();