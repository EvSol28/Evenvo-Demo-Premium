const https = require('https');

// Test de l'API pour l'application mobile
const testApiEndpoint = () => {
    const url = 'https://evenvo-demo-premium.onrender.com/api/event/Event_1/active_vote_forms';
    
    console.log('🔍 Test de l\'API mobile...');
    console.log('🌐 URL:', url);
    
    https.get(url, (res) => {
        console.log('📡 Status Code:', res.statusCode);
        console.log('📋 Headers:', res.headers);
        
        let data = '';
        
        res.on('data', (chunk) => {
            data += chunk;
        });
        
        res.on('end', () => {
            try {
                const jsonData = JSON.parse(data);
                console.log('✅ Réponse JSON:');
                console.log(JSON.stringify(jsonData, null, 2));
                
                // Vérifier les champs rating
                if (jsonData.success && jsonData.voteForms) {
                    jsonData.voteForms.forEach((form, formIndex) => {
                        console.log(`\n📋 Formulaire ${formIndex + 1}: ${form.name}`);
                        if (form.fields) {
                            form.fields.forEach((field, fieldIndex) => {
                                if (field.type === 'rating') {
                                    console.log(`  🔸 Champ rating: ${field.label}`);
                                    console.log(`  🔸 allowComments: ${field.allowComments} (${typeof field.allowComments})`);
                                }
                            });
                        }
                    });
                }
            } catch (error) {
                console.error('❌ Erreur parsing JSON:', error);
                console.log('📄 Données brutes:', data);
            }
        });
        
    }).on('error', (error) => {
        console.error('❌ Erreur requête:', error);
    });
};

testApiEndpoint();