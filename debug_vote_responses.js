const admin = require('firebase-admin');
require('dotenv').config();

// Configuration Firebase
const serviceAccount = {
    type: "service_account",
    project_id: process.env.FIREBASE_PROJECT_ID,
    private_key_id: process.env.FIREBASE_PRIVATE_KEY_ID,
    private_key: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
    client_email: process.env.FIREBASE_CLIENT_EMAIL,
    client_id: process.env.FIREBASE_CLIENT_ID,
    auth_uri: "https://accounts.google.com/o/oauth2/auth",
    token_uri: "https://oauth2.googleapis.com/token",
    auth_provider_x509_cert_url: "https://www.googleapis.com/oauth2/v1/certs",
    client_x509_cert_url: `https://www.googleapis.com/robot/v1/metadata/x509/${process.env.FIREBASE_CLIENT_EMAIL}`
};

if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
    });
}

const firestore = admin.firestore();

async function debugVoteResponses() {
    try {
        console.log('🔍 DÉBOGAGE DES RÉPONSES DE VOTE');
        console.log('================================');
        
        // 1. Lister tous les formulaires de vote
        console.log('\n1. FORMULAIRES DE VOTE:');
        const formsSnapshot = await firestore.collection('vote_forms').get();
        console.log(`Nombre de formulaires: ${formsSnapshot.size}`);
        
        formsSnapshot.forEach(doc => {
            const data = doc.data();
            console.log(`- ID: ${doc.id}`);
            console.log(`  Nom: ${data.name}`);
            console.log(`  Événement: ${data.eventId}`);
            console.log(`  Actif: ${data.isActive}`);
            console.log('');
        });
        
        // 2. Lister toutes les réponses
        console.log('\n2. RÉPONSES DE VOTE:');
        const responsesSnapshot = await firestore.collection('vote_responses').get();
        console.log(`Nombre de réponses: ${responsesSnapshot.size}`);
        
        if (responsesSnapshot.size > 0) {
            responsesSnapshot.forEach(doc => {
                const data = doc.data();
                console.log(`- ID réponse: ${doc.id}`);
                console.log(`  FormID: ${data.formId}`);
                console.log(`  UserID: ${data.userId}`);
                console.log(`  Timestamp: ${data.timestamp}`);
                console.log(`  Réponses: ${JSON.stringify(data.responses)}`);
                console.log('');
            });
        } else {
            console.log('❌ Aucune réponse trouvée dans la collection vote_responses');
        }
        
        // 3. Vérifier le formulaire spécifique
        const specificFormId = '0cTZzGo0TGOCqXwMf43J';
        console.log(`\n3. RÉPONSES POUR LE FORMULAIRE ${specificFormId}:`);
        const specificResponses = await firestore.collection('vote_responses')
            .where('formId', '==', specificFormId)
            .get();
        
        console.log(`Nombre de réponses pour ce formulaire: ${specificResponses.size}`);
        
        if (specificResponses.size > 0) {
            specificResponses.forEach(doc => {
                const data = doc.data();
                console.log(`- Utilisateur: ${data.userId}`);
                console.log(`  Réponse: ${JSON.stringify(data.responses)}`);
            });
        } else {
            console.log('❌ Aucune réponse trouvée pour ce formulaire spécifique');
        }
        
    } catch (error) {
        console.error('❌ Erreur:', error);
    }
    
    process.exit(0);
}

debugVoteResponses();