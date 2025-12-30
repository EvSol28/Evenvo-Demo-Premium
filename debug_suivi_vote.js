const axios = require('axios');
const fs = require('fs');

async function debugSuiviVote() {
    try {
        console.log('🔍 Debugging suivi_vote page...');
        
        const response = await axios.get('http://localhost:4001/event/Event_1/suivi_vote', {
            timeout: 10000,
            validateStatus: function (status) {
                return status < 500;
            }
        });
        
        if (response.status === 200) {
            const html = response.data;
            
            // Sauvegarder le HTML pour inspection
            fs.writeFileSync('debug_suivi_vote_output.html', html);
            console.log('✅ HTML sauvegardé dans debug_suivi_vote_output.html');
            
            // Chercher des éléments clés
            console.log('\n🔍 Analyse du contenu:');
            console.log('- Contient "vote-cards-grid":', html.includes('vote-cards-grid'));
            console.log('- Contient "Formulaires de Vote":', html.includes('Formulaires de Vote'));
            console.log('- Contient "voteForms":', html.includes('voteForms'));
            console.log('- Contient "Aucun formulaire":', html.includes('Aucun formulaire'));
            console.log('- Contient "message":', html.includes('message'));
            
            // Extraire le titre de la page
            const titleMatch = html.match(/<title>(.*?)<\/title>/);
            if (titleMatch) {
                console.log('- Titre de la page:', titleMatch[1]);
            }
            
            // Chercher des variables JavaScript
            const scriptMatches = html.match(/<script[^>]*>(.*?)<\/script>/gs);
            if (scriptMatches) {
                console.log('- Nombre de scripts trouvés:', scriptMatches.length);
            }
            
        } else {
            console.log('❌ Status:', response.status);
        }
        
    } catch (error) {
        console.error('❌ Erreur:', error.message);
    }
}

debugSuiviVote();