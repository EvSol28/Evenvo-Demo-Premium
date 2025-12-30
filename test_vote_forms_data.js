const admin = require('firebase-admin');

// Charger les variables d'environnement
try {
  require('dotenv').config();
} catch (error) {
  console.log('dotenv non installé, utilisation des variables d\'environnement système');
}

// Initialisation Firebase
try {
  if (process.env.NODE_ENV === 'production' || process.env.FIREBASE_PRIVATE_KEY) {
    const serviceAccount = {
      type: "service_account",
      project_id: process.env.FIREBASE_PROJECT_ID || "evenvo-ba568",
      private_key_id: process.env.FIREBASE_PRIVATE_KEY_ID,
      private_key: process.env.FIREBASE_PRIVATE_KEY ? process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n') : undefined,
      client_email: process.env.FIREBASE_CLIENT_EMAIL,
      client_id: process.env.FIREBASE_CLIENT_ID,
      auth_uri: "https://accounts.google.com/o/oauth2/auth",
      token_uri: "https://oauth2.googleapis.com/token",
      auth_provider_x509_cert_url: "https://www.googleapis.com/oauth2/v1/certs",
      client_x509_cert_url: process.env.FIREBASE_CLIENT_X509_CERT_URL,
      universe_domain: "googleapis.com"
    };

    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      databaseURL: process.env.FIREBASE_DATABASE_URL || "https://evenvo-ba568.firebaseio.com"
    });
  } else {
    const serviceAccount = require('./evenvo-ba568-firebase-adminsdk-fbsvc-0f2a90b30b.json');
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      databaseURL: "https://evenvo-ba568.firebaseio.com"
    });
  }
  
  console.log('✅ Firebase initialisé avec succès');
} catch (error) {
  console.error('❌ Erreur Firebase:', error.message);
  process.exit(1);
}

const firestore = admin.firestore();

async function testVoteFormsData() {
    console.log('🔍 Test des données de formulaires de vote...\n');
    
    try {
        const eventId = 'Event_1';
        
        // 1. Vérifier l'événement
        console.log('1. Vérification de l\'événement...');
        const eventDoc = await firestore.collection('events').doc(eventId).get();
        if (eventDoc.exists) {
            console.log('✅ Événement trouvé:', eventDoc.data().name);
        } else {
            console.log('❌ Événement non trouvé');
            return;
        }
        
        // 2. Vérifier les formulaires de vote
        console.log('\n2. Vérification des formulaires de vote...');
        const voteFormsSnapshot = await firestore.collection('vote_forms')
            .where('eventId', '==', eventId)
            .get();
            
        console.log(`📊 Nombre de formulaires trouvés: ${voteFormsSnapshot.size}`);
        
        if (!voteFormsSnapshot.empty) {
            voteFormsSnapshot.forEach((doc, index) => {
                const data = doc.data();
                console.log(`\n   Formulaire ${index + 1}:`);
                console.log(`   - ID: ${doc.id}`);
                console.log(`   - Nom: ${data.name}`);
                console.log(`   - Description: ${data.description || 'Aucune'}`);
                console.log(`   - Actif: ${data.isActive ? 'Oui' : 'Non'}`);
                console.log(`   - Nombre de champs: ${data.fields ? data.fields.length : 0}`);
            });
        } else {
            console.log('⚠️  Aucun formulaire de vote trouvé pour cet événement');
        }
        
        // 3. Vérifier les réponses
        console.log('\n3. Vérification des réponses...');
        const responsesSnapshot = await firestore.collection('vote_responses')
            .get();
            
        console.log(`📊 Nombre total de réponses: ${responsesSnapshot.size}`);
        
        if (!responsesSnapshot.empty) {
            const responsesByForm = {};
            responsesSnapshot.forEach(doc => {
                const data = doc.data();
                if (!responsesByForm[data.formId]) {
                    responsesByForm[data.formId] = 0;
                }
                responsesByForm[data.formId]++;
            });
            
            console.log('\n   Réponses par formulaire:');
            Object.keys(responsesByForm).forEach(formId => {
                console.log(`   - ${formId}: ${responsesByForm[formId]} réponses`);
            });
        }
        
        // 4. Vérifier les utilisateurs éligibles
        console.log('\n4. Vérification des utilisateurs éligibles...');
        const usersSnapshot = await firestore.collection('users')
            .where('events', 'array-contains', eventId)
            .get();
            
        console.log(`👥 Nombre d'utilisateurs éligibles: ${usersSnapshot.size}`);
        
        // 5. Créer un formulaire de test si aucun n'existe
        if (voteFormsSnapshot.empty) {
            console.log('\n5. Création d\'un formulaire de test...');
            
            const testForm = {
                name: 'Vote de Test',
                description: 'Formulaire de vote créé automatiquement pour les tests',
                eventId: eventId,
                isActive: true,
                fields: [
                    {
                        id: 'field1',
                        type: 'radio',
                        label: 'Êtes-vous d\'accord avec cette proposition ?',
                        required: true,
                        options: ['Oui', 'Non', 'S\'abstenir']
                    }
                ],
                createdAt: admin.firestore.FieldValue.serverTimestamp(),
                createdBy: 'system'
            };
            
            const newFormRef = await firestore.collection('vote_forms').add(testForm);
            console.log(`✅ Formulaire de test créé avec l'ID: ${newFormRef.id}`);
        }
        
    } catch (error) {
        console.error('❌ Erreur lors du test:', error);
    }
}

testVoteFormsData().then(() => {
    console.log('\n✅ Test terminé');
    process.exit(0);
});