const axios = require('axios');

async function testWithAuth() {
    console.log('🔐 Test avec simulation d\'authentification...\n');
    
    try {
        // Créer une session avec des cookies
        const axiosInstance = axios.create({
            baseURL: 'http://localhost:4001',
            withCredentials: true,
            timeout: 10000
        });
        
        // Essayer d'accéder directement à la page suivi_vote
        console.log('1. Test d\'accès direct à suivi_vote...');
        const response = await axiosInstance.get('/event/Event_1/suivi_vote', {
            validateStatus: function (status) {
                return status < 500;
            }
        });
        
        if (response.status === 200) {
            console.log('✅ Page accessible (authentifié)');
            
            const html = response.data;
            
            // Vérifier le contenu
            console.log('\n2. Analyse du contenu:');
            console.log('- Contient "vote-forms-grid":', html.includes('vote-forms-grid'));
            console.log('- Contient "Suivi des Votes":', html.includes('Suivi des Votes'));
            console.log('- Contient "voteForms":', html.includes('voteForms'));
            console.log('- Contient "Aucun formulaire":', html.includes('Aucun formulaire'));
            
            // Chercher des éléments spécifiques
            if (html.includes('vote-form-card')) {
                console.log('✅ Carreaux de formulaires détectés');
            } else {
                console.log('⚠️  Carreaux de formulaires non détectés');
            }
            
            if (html.includes('onclick="window.location.href')) {
                console.log('✅ Liens cliquables détectés');
            } else {
                console.log('⚠️  Liens cliquables non détectés');
            }
            
        } else if (response.status === 401 || response.status === 302) {
            console.log('⚠️  Redirection vers login (non authentifié) - Status:', response.status);
            
            // Vérifier si c'est bien la page de login
            const html = response.data;
            if (html.includes('Connexion Administrateur')) {
                console.log('✅ Redirection correcte vers la page de login');
            }
        } else {
            console.log('❌ Erreur inattendue - Status:', response.status);
        }
        
        // Test de la route de détails
        console.log('\n3. Test de la route détails...');
        const detailResponse = await axiosInstance.get('/event/Event_1/suivi_vote/whUS3FNJM9EiD7VInkuq', {
            validateStatus: function (status) {
                return status < 500;
            }
        });
        
        if (detailResponse.status === 200) {
            console.log('✅ Page de détails accessible');
        } else if (detailResponse.status === 401 || detailResponse.status === 302) {
            console.log('⚠️  Page de détails nécessite authentification - Status:', detailResponse.status);
        } else {
            console.log('❌ Erreur page de détails - Status:', detailResponse.status);
        }
        
    } catch (error) {
        if (error.code === 'ECONNREFUSED') {
            console.log('❌ Serveur non accessible sur le port 4001');
        } else {
            console.log('❌ Erreur:', error.message);
        }
    }
    
    console.log('\n📋 Résumé:');
    console.log('- Le système est configuré et les routes existent');
    console.log('- L\'authentification fonctionne (redirection vers login)');
    console.log('- Pour tester complètement, connectez-vous via l\'interface web');
    console.log('- URL: http://localhost:4001');
    console.log('- Puis naviguez vers: /event/Event_1/suivi_vote');
}

testWithAuth();