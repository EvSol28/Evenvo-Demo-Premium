const http = require('http');

// Test pour vérifier les données de formulaire ranking
console.log('🧪 Test des données de formulaire ranking...\n');

const options = {
    hostname: 'localhost',
    port: 4001,
    path: '/api/event/Event_1/active_vote_forms',
    method: 'GET',
    headers: {
        'Content-Type': 'application/json'
    }
};

const req = http.request(options, (res) => {
    let data = '';
    
    res.on('data', (chunk) => {
        data += chunk;
    });
    
    res.on('end', () => {
        try {
            const response = JSON.parse(data);
            console.log('📡 Réponse du serveur:');
            console.log('Status:', res.statusCode);
            console.log('Success:', response.success);
            console.log('Nombre de formulaires:', response.voteForms?.length || 0);
            
            if (response.voteForms && response.voteForms.length > 0) {
                response.voteForms.forEach((form, index) => {
                    console.log(`\n📋 Formulaire ${index + 1}: ${form.name}`);
                    console.log('ID:', form.id);
                    console.log('Description:', form.description);
                    
                    if (form.fields && form.fields.length > 0) {
                        console.log('Champs:');
                        form.fields.forEach((field, fieldIndex) => {
                            console.log(`  ${fieldIndex + 1}. ${field.label} (type: ${field.type})`);
                            if (field.type === 'ranking') {
                                console.log('     🎯 CHAMP RANKING TROUVÉ!');
                                console.log('     Options:', field.options);
                                console.log('     Description:', field.description);
                            }
                        });
                    } else {
                        console.log('Aucun champ trouvé');
                    }
                });
            } else {
                console.log('❌ Aucun formulaire actif trouvé');
            }
        } catch (error) {
            console.error('❌ Erreur de parsing JSON:', error);
            console.log('Données brutes:', data);
        }
    });
});

req.on('error', (error) => {
    console.error('❌ Erreur de requête:', error);
});

req.end();