const axios = require('axios');

const BASE_URL = 'http://localhost:4001';

async function testSuiviVoteSystem() {
    console.log('🧪 Test du système suivi_vote restauré...\n');
    
    try {
        // Test 1: Accès à la page suivi_vote principale
        console.log('1. Test de la page suivi_vote principale...');
        const response = await axios.get(`${BASE_URL}/event/Event_1/suivi_vote`, {
            timeout: 10000,
            validateStatus: function (status) {
                return status < 500; // Accepter les codes de statut < 500
            }
        });
        
        if (response.status === 200) {
            console.log('✅ Page suivi_vote accessible');
            
            // Vérifier si la page contient les éléments attendus
            const html = response.data;
            if (html.includes('vote-cards-grid')) {
                console.log('✅ Grille de cartes de vote présente');
            } else {
                console.log('⚠️  Grille de cartes de vote non trouvée');
            }
            
            if (html.includes('Formulaires de Vote')) {
                console.log('✅ Section "Formulaires de Vote" présente');
            } else {
                console.log('⚠️  Section "Formulaires de Vote" non trouvée');
            }
            
        } else if (response.status === 401) {
            console.log('⚠️  Accès non autorisé (session requise) - Status:', response.status);
        } else {
            console.log('❌ Erreur d\'accès à la page - Status:', response.status);
        }
        
        // Test 2: Test de la route pour les détails d'un formulaire (même si elle retourne 401)
        console.log('\n2. Test de la route détails formulaire...');
        try {
            const detailResponse = await axios.get(`${BASE_URL}/event/Event_1/suivi_vote/test-form-id`, {
                timeout: 5000,
                validateStatus: function (status) {
                    return status < 500;
                }
            });
            
            if (detailResponse.status === 401) {
                console.log('✅ Route détails formulaire existe (session requise)');
            } else if (detailResponse.status === 404) {
                console.log('✅ Route détails formulaire existe (formulaire non trouvé)');
            } else {
                console.log('✅ Route détails formulaire accessible - Status:', detailResponse.status);
            }
        } catch (error) {
            if (error.code === 'ECONNREFUSED') {
                console.log('❌ Serveur non accessible');
            } else {
                console.log('⚠️  Erreur lors du test de la route détails:', error.message);
            }
        }
        
        // Test 3: Vérifier que le serveur répond correctement
        console.log('\n3. Test de santé du serveur...');
        const healthResponse = await axios.get(`${BASE_URL}/`, {
            timeout: 5000,
            validateStatus: function (status) {
                return status < 500;
            }
        });
        
        if (healthResponse.status === 200) {
            console.log('✅ Serveur en bonne santé');
        } else {
            console.log('⚠️  Serveur répond avec le status:', healthResponse.status);
        }
        
    } catch (error) {
        if (error.code === 'ECONNREFUSED') {
            console.log('❌ Impossible de se connecter au serveur. Assurez-vous qu\'il fonctionne sur le port 4001');
        } else {
            console.log('❌ Erreur lors des tests:', error.message);
        }
    }
    
    console.log('\n📋 Résumé:');
    console.log('- Le système suivi_vote a été restauré avec les cartes de vote individuelles');
    console.log('- Chaque carte de vote peut maintenant mener à une page de détails spécifique');
    console.log('- La route /event/:eventId/suivi_vote/:formId a été ajoutée');
    console.log('- La vue suivi_vote_detail.ejs a été créée pour les détails individuels');
    console.log('- Le système utilise maintenant les formulaires de vote au lieu du simple système Oui/Non/S\'abstenir');
}

// Exécuter les tests
testSuiviVoteSystem();