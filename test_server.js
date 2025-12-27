// Script de test simple pour vérifier que le serveur fonctionne
const http = require('http');

// Test de la route principale
http.get('http://localhost:4000/', (res) => {
    console.log('✅ Serveur accessible sur le port 4000');
    console.log('Status:', res.statusCode);
    
    // Test de la route vote_form_builder
    http.get('http://localhost:4000/event/Event_1/vote_form_builder', (res2) => {
        console.log('✅ Route vote_form_builder accessible');
        console.log('Status:', res2.statusCode);
        process.exit(0);
    }).on('error', (err) => {
        console.log('❌ Erreur route vote_form_builder:', err.message);
        process.exit(1);
    });
    
}).on('error', (err) => {
    console.log('❌ Serveur non accessible:', err.message);
    console.log('💡 Assurez-vous que le serveur est démarré avec: node server.js');
    process.exit(1);
});