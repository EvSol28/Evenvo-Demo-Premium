const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const admin = require('firebase-admin');
const multer = require('multer');
const fs = require('fs');
const fsPromises = require('fs').promises; // Ajout manquant
const csv = require('csv-parser');
const PDFDocument = require('pdfkit');
const path = require('path');
const ejs = require('ejs');
const session = require('express-session');
const QRCode = require('qrcode');
const puppeteer = require('puppeteer');
const router = express.Router();  // Créer un router pour définir les routes
const { jsPDF } = require("jspdf");
const { ChartJSNodeCanvas } = require('chartjs-node-canvas');
const logoPath = path.join(__dirname, 'assets', 'logo.png');  // Assurez-vous que le chemin est correct
const logoBuffer = fs.readFileSync(logoPath);
const logoBase64 = logoBuffer.toString('base64');
const chartJSNodeCanvas = new ChartJSNodeCanvas({ width: 400, height: 400 });
const templatePath = path.join(__dirname, 'views', 'pdf_template.ejs'); // Définir le chemin du fichier template.ejs
const { createCanvas } = require('canvas');
const Chart = require('chart.js/auto');
const axios = require('axios');
const templatePathQr = path.join(__dirname, 'views', 'pdf_template_QR.ejs');
const crypto = require('crypto');
const { createObjectCsvWriter } = require('csv-writer');
const util = require('util');
const mkdir = util.promisify(fs.mkdir);
const unlink = util.promisify(fs.unlink);
const access = util.promisify(fs.access);
const iconv = require('iconv-lite'); 
const { parse } = require('csv-parse/sync');




const app = express();
const port = process.env.PORT || 4000;


// Servir les fichiers statiques depuis le dossier assets
app.use('/assets', express.static(path.join(__dirname, 'assets')));

// Initialisation de Firebase Admin SDK
admin.initializeApp({
  credential: admin.credential.cert(require('./nocevent-20791-firebase-adminsdk-zvrwh-5d9c9b7016.json')),
  databaseURL: "https://nocevent-20791.firebaseio.com"
});

const firestore = admin.firestore();
firestore.settings({
  ignoreUndefinedProperties: true
});

// Configuration d'Express et du moteur de vues EJS
app.set('view engine', 'ejs');
app.use(express.static('public'));
app.use(bodyParser.urlencoded({ extended: true }));
app.use(cors());
app.use(bodyParser.json());


// Route pour obtenir la configuration Firebase côté client
app.get('/firebase-config', (req, res) => {
    const firebaseConfig = {
          apiKey: "AIzaSyAPeamAYQmWeeOf8AX_J2rcQRRyKS22gr8",
  authDomain: "nocevent-20791.firebaseapp.com",
  projectId: "nocevent-20791",
  storageBucket: "nocevent-20791.firebasestorage.app",
  messagingSenderId: "669049175529",
  appId: "1:669049175529:web:ff2ff3986d924ffe98df78",
  measurementId: "G-TPXMKJMXG2"
    };
    res.json(firebaseConfig);
});



// Configuration des sessions
// Configuration des sessions
app.use(session({
  secret: 'votreSecretPourLesSessions',
  resave: false,
  saveUninitialized: true,
}));

// Fonction corrigée pour purger le dossier temp
async function cleanTempDir() {
    const tempDir = './temp';
    return new Promise((resolve, reject) => {
        fs.access(tempDir, (err) => {
            if (err && err.code === 'ENOENT') {
                console.log('Dossier temp n\'existe pas, création en cours...');
                fs.mkdir(tempDir, (mkdirErr) => {
                    if (mkdirErr) {
                        console.error('Erreur lors de la création du dossier temp:', mkdirErr);
                        return reject(mkdirErr);
                    }
                    console.log('Dossier temp créé.');
                    cleanFiles();
                });
            } else if (err) {
                console.error('Erreur lors de l\'accès au dossier temp:', err);
                return reject(err);
            } else {
                cleanFiles();
            }
        });

        function cleanFiles() {
            fs.readdir(tempDir, (err, files) => {
                if (err) {
                    console.error('Erreur lors de la lecture du dossier temp:', err);
                    return reject(err);
                }
                if (files.length === 0) {
                    console.log('Dossier temp déjà vide.');
                    return resolve();
                }

                let completed = 0;
                files.forEach(file => {
                    const filePath = path.join(tempDir, file);
                    fs.unlink(filePath, (unlinkErr) => {
                        if (unlinkErr) {
                            console.error(`Erreur suppression ${filePath}:`, unlinkErr);
                        }
                        if (++completed === files.length) {
                            console.log('Dossier temp purgé avec succès.');
                            resolve();
                        }
                    });
                });
            });
        }
    });
}

// Middleware pour vérifier la session (ajoutez ceci ici)
const ensureAuthenticated = async (req, res, next) => {
    if (!req.session.loggedIn || !req.session.email) {
        console.log('Session non valide:', req.session);
        return res.status(401).json({ error: 'Utilisateur non connecté.' });
    }

    // Si superAdmin n'est pas défini, le récupérer depuis Firestore
    if (!req.session.superAdmin) {
        try {
            const emailSnapshot = await admin.firestore().collection('super_admin')
                .where('email', '==', req.session.email)
                .get();

            if (!emailSnapshot.empty) {
                const superAdminData = emailSnapshot.docs[0].data();
                req.session.superAdmin = `${superAdminData.name} ${superAdminData.surname} (${req.session.email})`;
                console.log('SuperAdmin reconstitué:', req.session.superAdmin);
            }
        } catch (error) {
            console.error('Erreur lors de la récupération de superAdmin:', error);
        }
    }

    next();
};

// Middleware pour vérifier si l'utilisateur est connecté
function requireAuth(req, res, next) {
  if (req.session.loggedIn) {
    next();
  } else {
    res.redirect('/');
  }
}

// Route de connexion (page de login)
app.get('/', (req, res) => {
  if (req.session.loggedIn) {
    res.redirect('/dashboard');
  } else {
    res.render('login');
  }
});

app.post('/login', async (req, res) => {
    const { login, password } = req.body;

    if (!login || !password) {
        return res.status(400).send('Veuillez fournir un email et un mot de passe.');
    }

    try {
        const emailSnapshot = await admin.firestore().collection('super_admin')
            .where('email', '==', login)
            .get();

        if (emailSnapshot.empty) {
            return res.status(401).send('Cet email n\'est pas associé à un super administrateur.');
        }

        const superAdminDoc = emailSnapshot.docs[0];
        const superAdminData = superAdminDoc.data();
        const superAdminId = superAdminDoc.id;

        try {
            const userRecord = await admin.auth().getUserByEmail(login);
            if (superAdminData.role !== 'Super Admin') {
                return res.status(403).send('Vous n\'êtes pas autorisé à vous connecter en tant que super administrateur.');
            }

            req.session.loggedIn = true;
            req.session.userId = superAdminId;
            req.session.email = login;
            req.session.superAdmin = `${superAdminData.name} ${superAdminData.surname} (${login})`; // Définition de superAdmin

            console.log('Session après login:', req.session); // Pour débogage
            res.redirect('/dashboard');
        } catch (authError) {
            if (authError.code === 'auth/user-not-found') {
                return res.status(401).send('Utilisateur non trouvé dans Firebase Authentication.');
            }
            throw authError;
        }
    } catch (error) {
        console.error('Erreur lors de la connexion :', error);
        res.status(500).send('Erreur serveur : ' + error.message);
    }
});



// Route pour vérifier si l'utilisateur est un super administrateur
app.post('/verify_superadmin', async (req, res) => {
    const { email } = req.body;
    console.log('Requête /verify_superadmin reçue avec email:', email);
    try {
        const emailSnapshot = await admin.firestore().collection('super_admin')
            .where('email', '==', email)
            .get();

        if (emailSnapshot.empty) {
            console.log('Email non trouvé dans super_admin:', email);
            return res.status(403).json({ error: 'Cet email n\'est pas associé à un super administrateur.' });
        }

        const superAdminDoc = emailSnapshot.docs[0];
        const superAdminData = superAdminDoc.data();
        console.log('Données du super admin:', superAdminData);

        if (superAdminData.role !== 'Super Admin') {
            console.log('Rôle non autorisé:', superAdminData.role);
            return res.status(403).json({ error: 'Vous n\'êtes pas autorisé à vous connecter en tant que super administrateur.' });
        }

        res.status(200).json({ message: 'Utilisateur vérifié.' });
    } catch (error) {
        console.error('Erreur lors de la vérification du super admin :', error);
        res.status(500).json({ error: 'Erreur serveur : ' + error.message });
    }
});


app.post('/sync_auth_user', async (req, res) => {
    const { email } = req.body;

    if (!email) {
        return res.status(400).json({ error: 'Email requis.' });
    }

    try {
        // Vérifier si l'email existe dans Firestore
        const emailSnapshot = await admin.firestore().collection('super_admin')
            .where('email', '==', email)
            .get();

        if (emailSnapshot.empty) {
            return res.status(404).json({ error: 'Cet email n\'existe pas dans la base Firestore.' });
        }

        const superAdminDoc = emailSnapshot.docs[0];
        const superAdminData = superAdminDoc.data();
        const uid = superAdminData.uid;

        // Vérifier si l'utilisateur existe dans Firebase Authentication
        try {
            await admin.auth().getUserByEmail(email);
            // Si l'utilisateur existe déjà, pas besoin de le recréer
            return res.status(200).json({ message: 'Utilisateur déjà synchronisé.' });
        } catch (authError) {
            if (authError.code === 'auth/user-not-found') {
                // Créer l'utilisateur dans Firebase Authentication avec un mot de passe temporaire
                await admin.auth().createUser({
                    uid: uid,
                    email: email,
                    password: 'Temp123!', // Mot de passe temporaire (à changer par l'utilisateur)
                    displayName: `${superAdminData.name} ${superAdminData.surname}`
                });
                console.log(`Utilisateur ${email} créé dans Firebase Authentication avec UID: ${uid}`);
                return res.status(201).json({ message: 'Utilisateur synchronisé avec succès.' });
            }
            throw authError;
        }
    } catch (error) {
        console.error('Erreur lors de la synchronisation :', error);
        res.status(500).json({ error: 'Erreur serveur : ' + error.message });
    }
});

// Route pour récupérer les informations de l'utilisateur connecté
app.get('/get_user_info', (req, res) => {
    if (!req.session.loggedIn || !req.session.email) {
        console.log('Session non trouvée ou email manquant:', req.session);
        return res.status(401).json({ error: 'Utilisateur non connecté.' });
    }

    console.log('Récupération des infos pour email:', req.session.email);

    // Récupérer les informations de l'utilisateur depuis Firestore
    admin.firestore().collection('super_admin')
        .where('email', '==', req.session.email)
        .get()
        .then(snapshot => {
            if (snapshot.empty) {
                console.log('Aucun utilisateur trouvé dans Firestore pour:', req.session.email);
                return res.status(404).json({ error: 'Utilisateur non trouvé dans Firestore.' });
            }

            const userData = snapshot.docs[0].data();
            console.log('Données utilisateur trouvées:', userData);
            res.status(200).json({
                name: userData.name,
                surname: userData.surname,
                email: userData.email
            });
        })
        .catch(error => {
            console.error('Erreur lors de la récupération des infos utilisateur :', error);
            res.status(500).json({ error: 'Erreur serveur.' });
        });
});

app.post('/set_session', async (req, res) => {
    const { email, uid } = req.body;
    console.log('Requête /set_session reçue avec email:', email, 'et UID:', uid);

    if (!email || !uid) {
        console.log('Email ou UID manquant');
        return res.status(400).json({ error: 'Email et UID requis.' });
    }

    // Récupérer les informations du super admin depuis Firestore
    const emailSnapshot = await admin.firestore().collection('super_admin')
        .where('email', '==', email)
        .get();

    if (emailSnapshot.empty) {
        console.log('Email non trouvé dans super_admin:', email);
        return res.status(403).json({ error: 'Cet email n\'est pas associé à un super administrateur.' });
    }

    const superAdminDoc = emailSnapshot.docs[0];
    const superAdminData = superAdminDoc.data();

    req.session.loggedIn = true;
    req.session.userId = uid;
    req.session.email = email;
    req.session.superAdmin = `${superAdminData.name} ${superAdminData.surname} (${email})`; // Ajout de superAdmin

    console.log('Session après set_session:', req.session); // Pour débogage
    res.status(200).json({ message: 'Session définie.' });
});


app.get('/logout', (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            console.error('Erreur lors de la déconnexion :', err);
            return res.status(500).send('Erreur lors de la déconnexion.');
        }
        res.redirect('/');
    });
});


// Tableau de bord
// Tableau de bord
app.get('/dashboard', requireAuth, (req, res) => {
    console.log('Session dans /dashboard:', req.session); // Ajouter ce log pour déboguer
    res.render('dashboard');
});




// Route pour afficher tous les événements
app.get('/events', requireAuth, async (req, res) => {
    try {
        const snapshot = await firestore.collection('events').get();
        const events = [];

        // Créer une date "aujourd'hui" sans l'heure
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        for (const doc of snapshot.docs) {
            const event = doc.data();
            const startDate = new Date(event.startDate);
            const endDate = new Date(event.endDate);

            // Réinitialiser l'heure des dates de début et fin pour comparer uniquement les dates
            startDate.setHours(0, 0, 0, 0);
            endDate.setHours(0, 0, 0, 0);

            let newStatus;

            // Comparer les dates en utilisant les objets Date réinitialisés à 00:00:00
            if (startDate > today) {
                newStatus = 'À venir';
            } else if (startDate <= today && endDate >= today) {
                newStatus = 'Actif';
            } else {
                newStatus = 'Terminé';
            }

            // Mettre à jour le statut dans Firestore si nécessaire
            if (event.status !== newStatus) {
                await firestore.collection('events').doc(doc.id).update({
                    status: newStatus
                });
            }

            event.id = doc.id;
            event.status = newStatus;
            events.push(event);
        }

        res.render('events', { events });
    } catch (error) {
        console.error("Erreur lors de la récupération des événements :", error);
        res.status(500).send('Erreur lors du chargement des événements');
    }
});





// Route pour afficher les détails d'un événement spécifique
app.get('/event/:eventId', async (req, res) => {
    const eventId = req.params.eventId;

    try {
        const eventRef = firestore.collection('events').doc(eventId);
        const eventDoc = await eventRef.get();

        if (!eventDoc.exists) {
            return res.status(404).send('Événement non trouvé');
        }

        const event = eventDoc.data();
        event.id = eventDoc.id;

        // Calculer le statut basé uniquement sur les dates
        const startDate = new Date(event.startDate);
        const endDate = new Date(event.endDate);
        startDate.setHours(0, 0, 0, 0);
        endDate.setHours(0, 0, 0, 0);

        const today = new Date();
        today.setHours(0, 0, 0, 0);

        let newStatus;
        if (startDate > today) {
            newStatus = 'À venir';
        } else if (startDate <= today && endDate >= today) {
            newStatus = 'Actif';
        } else {
            newStatus = 'Terminé';
        }

        // Mettre à jour le statut si nécessaire
        if (event.status !== newStatus) {
            await eventRef.update({ status: newStatus });
            event.status = newStatus;
        }

        res.render('event-page', { event, eventId });
    } catch (error) {
        console.error('Erreur lors de la récupération de l\'événement :', error);
        res.status(500).send('Erreur lors de la récupération de l\'événement');
    }
});




// Création d'un événement

app.post('/create_event', requireAuth, async (req, res) => {
    const { event_name, start_date, end_date, wilaya, address } = req.body;

    if (!event_name || !start_date || !end_date || !wilaya || !address) {
        return res.status(400).json({ error: 'Tous les champs sont requis pour créer un événement' });
    }

    const startDate = new Date(start_date);
    const endDate = new Date(end_date);

    // Normalisation des dates pour ignorer l'heure
    startDate.setHours(0, 0, 0, 0);
    endDate.setHours(0, 0, 0, 0);

    if (endDate < startDate) {
        return res.status(400).json({ error: "La date de fin doit être supérieure ou égale à la date de début." });
    }

    // Normalisation du nom de l'événement
    const eventName = event_name.trim().toLowerCase();

    try {
        // Vérifier si un événement avec le même nom existe déjà
        const existingEvent = await firestore.collection('events')
            .where('name', '==', eventName)
            .get();

        if (!existingEvent.empty) {
            return res.status(400).json({ error: 'Un événement avec ce nom existe déjà.' });
        }

        // Créer une référence au document du compteur d'ID
        const counterRef = firestore.collection('counters').doc('eventCounter');
        const counterDoc = await counterRef.get();
        
        let currentId = 1;
        if (counterDoc.exists) {
            currentId = counterDoc.data().currentId;
        } else {
            await counterRef.set({ currentId: currentId });
        }

        const eventId = `Event_${currentId}`;

        // Calculer le statut initial
        const today = new Date();
        today.setHours(0, 0, 0, 0); // Ignorer l'heure

        let status;
        if (startDate > today) {
            status = 'À venir';
        } else if (startDate <= today && endDate >= today) {
            status = 'Actif';
        } else {
            status = 'Terminé';
        }

        // Créer un nouvel événement
        const newEvent = {
            name: eventName,
            startDate: start_date,
            endDate: end_date,
            wilaya: wilaya,
            address: address.trim(),
            status: status
        };

        // Ajouter l'événement à Firestore avec l'ID incrémenté
        await firestore.collection('events').doc(eventId).set(newEvent);

        // Incrémenter le compteur d'ID pour le prochain événement
        await counterRef.update({ currentId: currentId + 1 });

        res.status(201).json({ success: true, message: "Événement créé avec succès" });
    } catch (error) {
        console.error('Erreur lors de la création de l\'événement :', error);
        res.status(500).json({ error: 'Erreur lors de la création de l\'événement' });
    }
});


app.put('/update_event/:id', async (req, res) => {
    console.log("Requête reçue pour modification:", req.params.id, req.body);
    const eventId = req.params.id;
    const updatedEvent = req.body;
    const newEventName = updatedEvent.name.trim().toLowerCase().replace(/\s+/g, '_');

    // Validation des dates
    const startDate = new Date(updatedEvent.startDate);
    const endDate = new Date(updatedEvent.endDate);

    // Normalisation des dates pour ignorer l'heure
    startDate.setHours(0, 0, 0, 0);
    endDate.setHours(0, 0, 0, 0);

    if (endDate < startDate) {
        return res.status(400).json({ success: false, message: "La date de fin doit être supérieure ou égale à la date de début." });
    }

    try {
        const eventRef = firestore.collection('events').doc(eventId);
        const eventDoc = await eventRef.get();

        if (!eventDoc.exists) {
            return res.status(404).json({ success: false, message: 'Événement non trouvé' });
        }

        // Vérifier si un autre événement a déjà ce nom
        const existingEventQuery = await firestore.collection('events')
            .where('name', '==', updatedEvent.name)
            .get();

        let nameAlreadyExists = false;

        existingEventQuery.forEach(doc => {
            if (doc.id !== eventId) {
                nameAlreadyExists = true;
            }
        });

        if (nameAlreadyExists) {
            return res.status(400).json({ success: false, message: 'Un événement avec ce nom existe déjà.' });
        }

        // Calculer le nouveau statut
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        let status;
        if (startDate > today) {
            status = 'À venir';
        } else if (startDate <= today && endDate >= today) {
            status = 'Actif';
        } else {
            status = 'Terminé';
        }

        // Mise à jour de l'événement
        const updatedEventData = {
            name: updatedEvent.name,
            startDate: updatedEvent.startDate,
            endDate: updatedEvent.endDate,
            address: updatedEvent.address,
            wilaya: updatedEvent.wilaya,
            status: status
        };

        await eventRef.update(updatedEventData);
        return res.status(200).json({ success: true, message: 'Événement mis à jour' });

    } catch (error) {
        console.error('Erreur de mise à jour de l\'événement :', error.message);
        return res.status(500).json({ success: false, message: 'Erreur de mise à jour' });
    }
});


// Route pour supprimer un événement
app.delete('/delete_event/:eventId', requireAuth, async (req, res) => {   
    const eventId = req.params.eventId;
    const usersRef = firestore.collection('users');
    const votesRef = firestore.collection('votes');
    const eventHistoryRef = firestore.collection('event_history');

    try {
        // Suppression des votes associés à cet événement
        const votesSnapshot = await votesRef.where('eventId', '==', eventId).get();
        console.log(`📢 Debug: Nombre de votes trouvés pour l'événement ${eventId} = ${votesSnapshot.size}`);

        let batch = firestore.batch(); // Batch initial pour les votes

        if (!votesSnapshot.empty) {
            console.log(`🔍 Nombre de votes liés à cet événement : ${votesSnapshot.size}`);
            votesSnapshot.forEach((doc) => {
                console.log(`🗑 Suppression du vote ${doc.id} avec les données :`, doc.data());
                batch.delete(doc.ref);
            });
        } else {
            console.log('ℹ️ Aucun vote trouvé pour cet événement.');
        }

        // Suppression des entrées dans event_history
        const eventHistorySnapshot = await eventHistoryRef.where('eventId', '==', eventId).get();
        console.log(`📢 Debug: Nombre d'entrées trouvées dans event_history pour l'événement ${eventId} = ${eventHistorySnapshot.size}`);

        if (!eventHistorySnapshot.empty) {
            console.log(`🔍 Nombre d'entrées dans event_history liées à cet événement : ${eventHistorySnapshot.size}`);
            eventHistorySnapshot.forEach((doc) => {
                console.log(`🗑 Suppression de l'entrée ${doc.id} dans event_history avec les données :`, doc.data());
                batch.delete(doc.ref);
            });
        } else {
            console.log('ℹ️ Aucune entrée trouvée dans event_history pour cet événement.');
        }

        // Suppression de l'événement dans events
        const eventRef = firestore.collection('events').doc(eventId);
        const eventDoc = await eventRef.get();
        if (eventDoc.exists) {
            batch.delete(eventRef);
            console.log(`🗑 Suppression de l'événement ${eventId} dans events`);
        } else {
            console.log(`ℹ️ Événement ${eventId} déjà supprimé ou introuvable dans events`);
        }

        // Exécuter le premier batch (votes, event_history, events)
        await batch.commit();
        console.log('✅ Premier batch terminé : votes, event_history et événement supprimés.');

        // Mise à jour des utilisateurs pour retirer l'événement de leur liste
        const usersSnapshot = await usersRef.where('events', 'array-contains', eventId).get();
        if (!usersSnapshot.empty) {
            console.log(`🔍 Nombre d'utilisateurs liés à cet événement : ${usersSnapshot.size}`);
            batch = firestore.batch(); // Nouveau batch pour les utilisateurs

            usersSnapshot.forEach((doc) => {
                const userRef = usersRef.doc(doc.id);
                const userData = doc.data();
                const updatedEvents = userData.events.filter(event => event !== eventId);
                batch.update(userRef, { events: updatedEvents });
                console.log(`✅ Mise à jour de l'utilisateur ${doc.id} : événement retiré.`);
            });

            await batch.commit();
            console.log('✅ Mise à jour des utilisateurs terminée.');
        } else {
            console.log('ℹ️ Aucun utilisateur trouvé avec cet événement.');
        }

        res.status(200).send({ message: 'Événement supprimé avec succès, utilisateurs mis à jour, votes et historique supprimés.' });
    } catch (error) {
        console.error('❌ Erreur lors de la suppression de l\'événement, des votes, de l\'historique ou de la mise à jour des utilisateurs :', error);
        res.status(500).send({ error: 'Erreur lors de la suppression de l\'événement, des votes, de l\'historique et mise à jour des utilisateurs' });
    }
});

app.post('/check_event_name', (req, res) => {
    const eventName = req.body.name;

    firestore.collection('events').where('name', '==', eventName).get()
        .then(snapshot => {
            if (snapshot.empty) {
                res.json({ exists: false });
            } else {
                res.json({ exists: true });
            }
        })
        .catch(err => {
            res.status(500).json({ success: false, message: 'Erreur de vérification du nom' });
        });
});




app.get('/event/:eventId/suivi_utilisateur', requireAuth, async (req, res) => {
  const eventId = req.params.eventId;
  
  try {
    const eventSnapshot = await firestore.collection('events').doc(eventId).get();
    const eventData = eventSnapshot.data();
    
    if (!eventData) {
      return res.status(404).send('Événement non trouvé');
    }

    const eventName = eventData.name;
    const eventEndDate = eventData.endDate; 
    const eventStatus = eventData.status || "Inconnu"; // Ajouter cette ligne

    console.log("Statut de l'événement envoyé à la vue :", eventStatus);

    const userSnapshot = await firestore.collection('users').where('eventid', '==', eventId).get();
    const users = userSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

    res.render('suivi_utilisateur', { eventId, eventName, users, eventEndDate, eventStatus });
  } catch (error) {
    console.error('Erreur lors de la récupération des utilisateurs pour le suivi:', error);
    res.status(500).send('Erreur lors de la récupération des utilisateurs pour le suivi');
  }
});



// Exemple d'endpoint pour récupérer le statut de l'événement
app.get('/api/getEventStatus/:eventId', async (req, res) => {
  const eventId = req.params.eventId;
  
  try {
    // Utilisez Firestore pour récupérer l'événement par son ID
    const eventSnapshot = await firestore.collection('events').doc(eventId).get();
    
    if (eventSnapshot.exists) {
      const event = eventSnapshot.data();
      res.json({ status: event.status });
    } else {
      res.status(404).json({ error: "Événement non trouvé" });
    }
  } catch (error) {
    console.error('Erreur lors de la récupération de l\'événement:', error);
    res.status(500).json({ error: 'Erreur lors de la récupération de l\'événement' });
  }
});




// Route pour afficher la liste des utilisateurs (page principale)
app.get('/users', requireAuth, async (req, res) => {
    try {
        const snapshot = await firestore.collection('users').get();
        const users = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        res.render('users', { users });
    } catch (error) {
        console.error('Erreur lors de la récupération des utilisateurs :', error);
        res.status(500).send('Erreur serveur');
    }
});



// Fonction pour ajouter un utilisateur avec un ID incrémenté
async function addUser(userData) {
    const nextId = await getNextUserId(); // Utilise la version transactionnelle

    const newUser = {
        id: nextId,
        name: userData.name,
        surname: userData.surname,
        civility: userData.civility,
        birthdate: userData.birthdate,
        role: userData.role,
        qrCode: userData.qrCode || null,
        email: userData.email || null,
    };

    await firestore.collection('users').doc(nextId).set(newUser);
    return nextId; // Optionnel : retourner l’ID pour confirmation
}


// Route pour afficher le formulaire de création d'utilisateur
app.post('/create_user', requireAuth, async (req, res) => {
    const { name, surname, email, phone, role, civility, birthdate } = req.body;

    console.log('Rôle reçu dans /create_user:', role);
    if (!name || !surname || !role || !civility || !birthdate) {
        return res.status(400).json({ error: 'Champs obligatoires manquants' });
    }

    try {
        const roleDoc = await firestore.collection('roles').get();
        const validRoles = roleDoc.docs.map(doc => doc.data().name);
        console.log('Rôles valides dans /create_user:', validRoles);

        const roleCheck = await firestore.collection('roles').where('name', '==', role).get();
        if (roleCheck.empty) {
            console.log('Rôle invalide détecté:', role);
            return res.status(400).json({ error: 'Rôle invalide' });
        }

        if (email) {
            const emailCheck = await firestore.collection('users').where('email', '==', email).get();
            if (!emailCheck.empty) {
                console.log('Email déjà utilisé:', email);
                return res.status(400).json({ error: 'Email déjà utilisé' });
            }
        }

        const qrContent = JSON.stringify({ name, surname, role, email: email || null, phone: phone || null });
        const nextId = await getNextUserId();
        const createdAt = new Date().toISOString();

        const newUser = {
            id: nextId,
            name,
            surname,
            civility,
            birthdate,
            role,
            email: email || null,
            phone: phone || null,
            qrCode: qrContent,
            createdAt
        };

        console.log('Tentative d\'enregistrement de l\'utilisateur:', newUser);
        await firestore.collection('users').doc(nextId).set(newUser);
        console.log('Utilisateur créé avec succès, ID:', nextId);
        res.status(200).json({ message: 'Utilisateur créé avec succès', userId: nextId });
    } catch (error) {
        console.error('Erreur lors de la création:', error);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

app.get('/create_user', requireAuth, async (req, res) => {
    try {
        const usersSnapshot = await firestore.collection('users').get();
        const users = usersSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        const rolesSnapshot = await firestore.collection('roles').get();
        const roles = rolesSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        res.render('create_user', { users, roles });
    } catch (error) {
        console.error('Erreur lors de la récupération des données :', error);
        res.status(500).send('Erreur serveur');
    }
});


app.get('/api/check-email', async (req, res) => {
  const email = req.query.email;

  try {
    const snapshot = await firestore.collection('users').where('email', '==', email).get();

    if (!snapshot.empty) {
      res.json({ exists: true });
    } else {
      res.json({ exists: false });
    }
  } catch (error) {
    console.error("Erreur lors de la vérification de l'email :", error);
    res.status(500).json({ error: 'Erreur interne du serveur' });
  }
});


app.get('/qrcode_user', requireAuth, (req, res) => {
  res.render('qrcode_user');
});




app.post('/update_user', requireAuth, async (req, res) => {
    try {
        const { id, name, surname, civility, birthdate, role, email } = req.body;

        // Vérifier si le rôle existe
        const roleDoc = await firestore.collection('roles').where('name', '==', role).get();
        if (roleDoc.empty) {
            return res.status(400).json({ error: 'Rôle invalide' });
        }

        const qrContent = JSON.stringify({ name, surname, role, email: email || null });
        const updatedAt = new Date().toISOString(); // Date de modification

        await firestore.collection('users').doc(id).update({
            name,
            surname,
            civility,
            birthdate,
            role,
            email: email || null,
            qrCode: qrContent,
            updatedAt // Ajouter la date de modification
        });

        res.status(200).json({ message: 'Utilisateur mis à jour avec succès', updatedAt });
    } catch (error) {
        console.error('Erreur lors de la mise à jour:', error);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});


// Route pour supprimer un utilisateur (déjà existante)
app.post('/delete_user', async (req, res) => {
    const { userId } = req.body;

    console.log("Requête de suppression reçue pour l'utilisateur :", userId);

    if (!userId) {
        return res.status(400).json({ error: "L'ID de l'utilisateur est requis." });
    }

    try {
        const batch = firestore.batch();

        // Référence à l'utilisateur
        const userRef = firestore.collection('users').doc(userId);
        const userDoc = await userRef.get();
        if (!userDoc.exists) {
            console.log("Utilisateur introuvable :", userId);
            return res.status(404).json({ error: "Utilisateur introuvable." });
        }

        const userData = userDoc.data();
        const userEvents = userData.events || [];
        const today = new Date();

        // Supprimer les votes liés à cet utilisateur
        const votesSnapshot = await firestore.collection('votes').where('userId', '==', userId).get();
        if (!votesSnapshot.empty) {
            console.log(`Nombre de votes trouvés pour l'utilisateur ${userId} : ${votesSnapshot.size}`);
            votesSnapshot.forEach(doc => {
                batch.delete(doc.ref);
                console.log(`Vote ${doc.id} supprimé pour l'utilisateur ${userId}`);
            });
        } else {
            console.log(`Aucun vote trouvé pour l'utilisateur ${userId}`);
        }

        // Traiter les événements associés
        for (const eventId of userEvents) {
            const eventRef = firestore.collection('events').doc(eventId);
            const eventDoc = await eventRef.get();

            if (eventDoc.exists) {
                const eventData = eventDoc.data();
                let eventEndDate;

                if (typeof eventData.endDate === 'string') {
                    eventEndDate = new Date(eventData.endDate);
                } else if (eventData.endDate && typeof eventData.endDate.toDate === 'function') {
                    eventEndDate = eventData.endDate.toDate();
                }

                // Retirer l'utilisateur de participants
                if (eventData.participants?.includes(userId)) {
                    batch.update(eventRef, {
                        participants: admin.firestore.FieldValue.arrayRemove(userId),
                    });
                }

                // Supprimer l'entrée dans presence si l'événement est actif
                if (eventData.presence && eventData.presence[userId] !== undefined && eventEndDate > today) {
                    batch.update(eventRef, {
                        [`presence.${userId}`]: admin.firestore.FieldValue.delete()
                    });
                    console.log(`Entrée presence supprimée pour ${userId} dans l'événement ${eventId}`);
                }

                // Supprimer l'entrée dans access_codes
                const accessCodeRef = firestore.collection('access_codes').doc(`${eventId}_${userId}`);
                const accessCodeDoc = await accessCodeRef.get();
                if (accessCodeDoc.exists) {
                    batch.delete(accessCodeRef);
                    console.log(`Code d'accès supprimé pour ${eventId}_${userId}`);
                }

                // Supprimer l'entrée dans event_history si l'événement est actif
                const eventHistoryRef = firestore.collection('event_history').doc(`${eventId}_${userId}`);
                const eventHistoryDoc = await eventHistoryRef.get();
                if (eventHistoryDoc.exists && eventEndDate > today) {
                    batch.delete(eventHistoryRef);
                }
            }
        }

        // Supprimer l'utilisateur
        batch.delete(userRef);
        await batch.commit();

        console.log("Batch de suppression exécuté avec succès");
        res.status(200).json({ message: 'Utilisateur supprimé avec succès.' });
    } catch (error) {
        console.error('Erreur lors de la suppression de l\'utilisateur :', error);
        res.status(500).json({ error: 'Erreur interne lors de la suppression de l\'utilisateur.' });
    }
});



// Route pour supprimer plusieurs utilisateurs
app.post('/delete_users', async (req, res) => {
    const { userIds } = req.body;

    if (!userIds || !Array.isArray(userIds) || userIds.length === 0) {
        return res.status(400).json({ error: "Une liste d'IDs d'utilisateurs est requise." });
    }

    try {
        const batch = firestore.batch();
        const today = new Date();
        const orgUserUpdates = new Map(); // Map pour suivre les organisations affectées

        // Étape 1 : Collecter les informations des utilisateurs et leurs organisations
        for (const userId of userIds) {
            const userRef = firestore.collection('users').doc(userId);
            const userDoc = await userRef.get();

            if (!userDoc.exists) {
                console.log(`Utilisateur ${userId} introuvable, ignoré.`);
                continue;
            }

            const userData = userDoc.data();
            const userEvents = userData.events || [];
            const userOrgs = userData.orgs || [];

            // Supprimer les votes liés à cet utilisateur
            const votesSnapshot = await firestore.collection('votes').where('userId', '==', userId).get();
            votesSnapshot.forEach(doc => {
                batch.delete(doc.ref);
            });

            // Traiter les événements associés
            for (const eventId of userEvents) {
                const eventRef = firestore.collection('events').doc(eventId);
                const eventDoc = await eventRef.get();

                if (eventDoc.exists) {
                    const eventData = eventDoc.data();
                    let eventEndDate = eventData.endDate;

                    if (typeof eventData.endDate === 'string') {
                        eventEndDate = new Date(eventData.endDate);
                    } else if (eventData.endDate && typeof eventData.endDate.toDate === 'function') {
                        eventEndDate = eventData.endDate.toDate();
                    }

                    if (eventData.participants?.includes(userId)) {
                        batch.update(eventRef, {
                            participants: admin.firestore.FieldValue.arrayRemove(userId),
                        });
                    }

                    if (eventData.presence?.[userId] !== undefined && eventEndDate > today) {
                        batch.update(eventRef, {
                            [`presence.${userId}`]: admin.firestore.FieldValue.delete()
                        });
                    }

                    const accessCodeRef = firestore.collection('access_codes').doc(`${eventId}_${userId}`);
                    const accessCodeDoc = await accessCodeRef.get();
                    if (accessCodeDoc.exists) {
                        batch.delete(accessCodeRef);
                    }

                    const eventHistoryRef = firestore.collection('event_history').doc(`${eventId}_${userId}`);
                    const eventHistoryDoc = await eventHistoryRef.get();
                    if (eventHistoryDoc.exists && eventEndDate > today) {
                        batch.delete(eventHistoryRef);
                    }
                }
            }

            // Ajouter les organisations affectées à la Map
            for (const orgId of userOrgs) {
                if (!orgUserUpdates.has(orgId)) {
                    orgUserUpdates.set(orgId, new Set());
                }
                orgUserUpdates.get(orgId).add(userId);
            }

            // Supprimer l'utilisateur
            batch.delete(userRef);
        }

        // Étape 2 : Exécuter le batch pour supprimer les utilisateurs et leurs données associées
        await batch.commit();

        // Étape 3 : Recalculer et mettre à jour le userCount pour chaque organisation affectée
        const updatedOrgCounts = {};
        for (const orgId of orgUserUpdates.keys()) {
            // Compter les utilisateurs restants rattachés à cette organisation
            const usersSnapshot = await firestore.collection('users')
                .where('orgs', 'array-contains', orgId)
                .get();
            const newUserCount = usersSnapshot.size;

            // Mettre à jour le userCount dans Firestore
            const orgRef = firestore.collection('organisations').doc(orgId);
            await orgRef.update({ userCount: newUserCount });
            console.log(`Organisation ${orgId} mise à jour : userCount = ${newUserCount}`);

            updatedOrgCounts[orgId] = newUserCount;
        }

        res.status(200).json({
            message: `Utilisateurs supprimés avec succès (${userIds.length} supprimés).`,
            updatedOrgCounts
        });
    } catch (error) {
        console.error('Erreur lors de la suppression multiple des utilisateurs :', error);
        res.status(500).json({ error: 'Erreur interne lors de la suppression des utilisateurs.' });
    }
});


// Endpoint pour récupérer les utilisateurs
app.get("/api/getUsers", async (req, res) => {
    try {
        const snapshot = await firestore.collection('users').get();
        const users = snapshot.docs.map(doc => doc.data());
        res.json(users);
    } catch (error) {
        console.error("Erreur lors de la récupération des utilisateurs :", error);
        res.status(500).send("Erreur lors de la récupération des utilisateurs.");
    }
});


	
// Route pour enregistrer les utilisateurs sélectionnés
app.post("/api/saveSelectedUsers", async (req, res) => {
    const { selectedUsers, eventId } = req.body;

    try {
        const batch = firestore.batch();
        
        // Pour chaque utilisateur sélectionné, ajouter l'ID de l'événement à son tableau d'événements
        for (let userId of selectedUsers) {
            const userRef = firestore.collection('users').doc(userId);
            const userDoc = await userRef.get();
            
            if (userDoc.exists) {
                const userData = userDoc.data();
                const eventIds = userData.events || [];  // Si aucun événement, on initialise un tableau vide

                // Si l'utilisateur n'est pas déjà inscrit à cet événement
                if (!eventIds.includes(eventId)) {
                    eventIds.push(eventId);
                    batch.update(userRef, { events: eventIds });
                }
            }
        }

        // Appliquer toutes les mises à jour dans la batch
        await batch.commit();
        
        res.status(200).json({ message: "Utilisateurs ajoutés avec succès." });
    } catch (error) {
        console.error("Erreur lors de l'ajout des utilisateurs :", error);
        res.status(500).json({ error: "Erreur lors de l'ajout des utilisateurs" });
    }
});



// Endpoint pour récupérer les utilisateurs
app.get("/api/getUsers", async (req, res) => {
    try {
        const snapshot = await firestore.collection('users').get();
        const users = snapshot.docs.map(doc => doc.data());
        res.json(users);
    } catch (error) {
        console.error("Erreur lors de la récupération des utilisateurs :", error);
        res.status(500).send("Erreur lors de la récupération des utilisateurs.");
    }
});




// Fonction pour générer un code unique de 7 chiffres
async function generateUniqueAccessCode(eventId) {
    const codeLength = 7;
    let code;
    let isUnique = false;

    while (!isUnique) {
        code = Math.floor(1000000 + Math.random() * 9000000).toString();
        const existingCode = await firestore.collection('access_codes')
            .where('code', '==', code)
            .where('eventId', '==', eventId)
            .get();
        isUnique = existingCode.empty;
    }
    return code;
}

// Endpoint pour récupérer les utilisateurs avec leurs codes d'accès
app.get('/api/getUsersByEvent/:eventId', async (req, res) => {
    const { eventId } = req.params;

    try {
        const eventDoc = await firestore.collection('events').doc(eventId).get();
        if (!eventDoc.exists) {
            return res.status(404).json({ error: 'Événement introuvable.' });
        }

        const rolesSnapshot = await firestore.collection('roles').get();
        const roles = rolesSnapshot.docs.map(doc => ({
            name: doc.data().name,
            voteEnabled: doc.data().voteEnabled || false
        }));

        const participants = eventDoc.data().participants || [];
        const users = await Promise.all(
            participants.map(async (userId) => {
                const userDoc = await firestore.collection('users').doc(userId).get();
                const accessCodeDoc = await firestore.collection('access_codes')
                    .where('userId', '==', userId)
                    .where('eventId', '==', eventId)
                    .get();

                let accessCode = null;
                if (!accessCodeDoc.empty) {
                    accessCode = accessCodeDoc.docs[0].data().code;
                }

                if (userDoc.exists) {
                    const userData = userDoc.data();
                    const roleInfo = roles.find(r => r.name.toLowerCase() === userData.role?.toLowerCase()) || { name: userData.role || 'Non défini', voteEnabled: false };
                    return {
                        id: userId,
                        name: userData.name || 'Nom inconnu',
                        surname: userData.surname || 'Prénom inconnu',
                        civility: userData.civility || '-',
                        birthdate: userData.birthdate || '-',
                        email: userData.email || '-',
                        role: roleInfo.name,
                        accessCode: accessCode
                    };
                }
                return null;
            })
        );

        const filteredUsers = users.filter(user => user !== null);
        res.status(200).json(filteredUsers);
    } catch (error) {
        console.error('Erreur lors de la récupération des utilisateurs :', error);
        res.status(500).json({ error: 'Erreur serveur.' });
    }
});


// Route pour retirer les utilisateurs d'un événement
app.post('/api/removeUsersFromEvent', async (req, res) => {
    const { selectedUsers, eventId } = req.body;

    if (!selectedUsers || !Array.isArray(selectedUsers) || selectedUsers.length === 0 || !eventId) {
        return res.status(400).json({ error: "Les IDs des utilisateurs et l'ID de l'événement sont requis." });
    }

    try {
        const batch = firestore.batch();
        const eventRef = firestore.collection('events').doc(eventId);
        const eventDoc = await eventRef.get();

        if (!eventDoc.exists) {
            return res.status(404).json({ error: "Événement introuvable." });
        }

        const eventData = eventDoc.data();
        const today = new Date();
        const eventEndDate = eventData.endDate?.toDate?.() || new Date(eventData.endDate);
        const isEventActive = eventEndDate > today;

        for (const userId of selectedUsers) {
            const userRef = firestore.collection('users').doc(userId);
            const userDoc = await userRef.get();

            if (!userDoc.exists) {
                console.log(`Utilisateur ${userId} introuvable, ignoré.`);
                continue;
            }

            // Retirer l'utilisateur des participants de l'événement
            if (eventData.participants?.includes(userId)) {
                batch.update(eventRef, {
                    participants: admin.firestore.FieldValue.arrayRemove(userId)
                });
            }

            // Supprimer presence si l'événement est actif
            if (isEventActive && eventData.presence?.[userId] !== undefined) {
                batch.update(eventRef, { [`presence.${userId}`]: admin.firestore.FieldValue.delete() });
            }

            // Supprimer le code d'accès
            const accessCodeRef = firestore.collection('access_codes').doc(`${eventId}_${userId}`);
            const accessCodeDoc = await accessCodeRef.get();
            if (accessCodeDoc.exists) {
                batch.delete(accessCodeRef);
                console.log(`Code d'accès supprimé pour ${eventId}_${userId}`);
            }

            // Supprimer event_history si l'événement est actif
            const eventHistoryRef = firestore.collection('event_history').doc(`${eventId}_${userId}`);
            const eventHistoryDoc = await eventHistoryRef.get();
            if (isEventActive && eventHistoryDoc.exists) {
                batch.delete(eventHistoryRef);
            }

            // Retirer l'événement des events de l'utilisateur
            batch.update(userRef, {
                events: admin.firestore.FieldValue.arrayRemove(eventId)
            });
        }

        await batch.commit();
        res.status(200).json({ message: "Utilisateurs retirés de l'événement avec succès." });
    } catch (error) {
        console.error("Erreur lors du retrait des utilisateurs de l'événement :", error);
        res.status(500).json({ error: "Erreur interne lors du retrait des utilisateurs." });
    }
});


// Endpoint modifié pour ajouter des utilisateurs avec génération de codes d'accès
app.post("/api/addUsersToEvent", async (req, res) => {
    const { selectedUsers, eventId } = req.body;

    if (!selectedUsers || !Array.isArray(selectedUsers) || selectedUsers.length === 0) {
        return res.status(400).json({ error: "Aucun utilisateur sélectionné." });
    }
    if (!eventId) {
        return res.status(400).json({ error: "L'ID de l'événement est nécessaire." });
    }

    try {
        const batch = firestore.batch();

        const eventRef = firestore.collection("events").doc(eventId);
        const eventDoc = await eventRef.get();
        if (!eventDoc.exists) {
            return res.status(404).json({ error: "Événement introuvable." });
        }

        const rolesSnapshot = await firestore.collection('roles').get();
        const roles = rolesSnapshot.docs.map(doc => ({
            name: doc.data().name,
            voteEnabled: doc.data().voteEnabled || false
        }));

        const eventData = eventDoc.data();
        const currentParticipants = eventData.participants || [];

        for (let userId of selectedUsers) {
            const userRef = firestore.collection("users").doc(userId);
            const userDoc = await userRef.get();

            if (userDoc.exists) {
                const userData = userDoc.data();
                const roleInfo = roles.find(r => r.name.toLowerCase() === userData.role?.toLowerCase()) || { name: userData.role || 'Non défini', voteEnabled: false };

                const userEvents = userData.events || [];
                if (!userEvents.includes(eventId)) {
                    batch.update(userRef, {
                        events: admin.firestore.FieldValue.arrayUnion(eventId),
                        role: roleInfo.name // Assure que le rôle est aligné avec la collection roles
                    });
                }

                if (!currentParticipants.includes(userId)) {
                    currentParticipants.push(userId);
                }

                const accessCode = await generateUniqueAccessCode(eventId);
                const accessCodeRef = firestore.collection('access_codes').doc(`${eventId}_${userId}`);
                batch.set(accessCodeRef, {
                    eventId: eventId,
                    userId: userId,
                    code: accessCode,
                    createdAt: admin.firestore.FieldValue.serverTimestamp(),
                    used: false
                }, { merge: true });

                const customEventHistoryId = `${eventId}_${userId}`;
                const eventHistoryRef = firestore.collection("event_history").doc(customEventHistoryId);
                const voteRef = firestore.collection("votes").doc(customEventHistoryId);

                const voteDoc = await voteRef.get();
                if (voteDoc.exists) {
                    batch.delete(voteRef);
                }

                batch.set(eventHistoryRef, {
                    eventId: eventId,
                    userId: userId,
                    userName: `${userData.name || ''} ${userData.surname || ''}`.trim() || 'Inconnu',
                    role: roleInfo.name,
                    email: userData.email || "Non disponible",
                    addedDate: admin.firestore.FieldValue.serverTimestamp(),
                    eventEndDate: eventData.endDate,
                }, { merge: false });
            }
        }

        batch.update(eventRef, {
            participants: currentParticipants,
        });

        await batch.commit();
        res.status(200).json({ message: "Utilisateurs ajoutés avec succès à l'événement avec nouveaux codes d'accès." });
    } catch (error) {
        console.error("Erreur lors de l'ajout des utilisateurs à l'événement :", error);
        res.status(500).json({ error: "Erreur lors de l'ajout des utilisateurs." });
    }
});


// Endpoint pour récupérer toutes les organisations
app.get("/api/getOrganizations", async (req, res) => {
    try {
        const snapshot = await firestore.collection('organisations').get();
        const orgs = snapshot.docs.map(doc => ({
            id: doc.id,
            name: doc.data().name,
            code: doc.data().code
        }));
        res.json(orgs);
    } catch (error) {
        console.error("Erreur lors de la récupération des organisations :", error);
        res.status(500).send("Erreur lors de la récupération des organisations.");
    }
});

app.get("/api/getUsersWithRoles", async (req, res) => {
    try {
        const rolesSnapshot = await firestore.collection('roles').get();
        const roles = rolesSnapshot.docs.map(doc => ({
            name: doc.data().name,
            voteEnabled: doc.data().voteEnabled || false
        }));

        const snapshot = await firestore.collection('users').get();
        const users = snapshot.docs.map(doc => {
            const userData = doc.data();
            const roleInfo = roles.find(r => r.name.toLowerCase() === userData.role?.toLowerCase()) || { name: userData.role || 'Non défini', voteEnabled: false };
            return {
                id: doc.id,
                name: userData.name || 'Nom inconnu',
                surname: userData.surname || 'Prénom inconnu',
                email: userData.email || 'Email non fourni',
                role: roleInfo.name
            };
        });
        res.json(users);
    } catch (error) {
        console.error("Erreur lors de la récupération des utilisateurs :", error);
        res.status(500).send("Erreur lors de la récupération des utilisateurs.");
    }
});



// Endpoint pour vérifier un code d'accès (optionnel, pour une future utilisation)
app.post('/api/verifyAccessCode', async (req, res) => {
    const { eventId, code } = req.body;

    try {
        const accessCodeDoc = await firestore.collection('access_codes')
            .where('eventId', '==', eventId)
            .where('code', '==', code)
            .get();

        if (accessCodeDoc.empty) {
            return res.status(404).json({ error: 'Code d’accès invalide ou non trouvé.' });
        }

        const accessData = accessCodeDoc.docs[0].data();
        if (accessData.used) {
            return res.status(400).json({ error: 'Ce code d’accès a déjà été utilisé.' });
        }

        // Marquer le code comme utilisé (optionnel selon votre logique)
        await firestore.collection('access_codes').doc(accessCodeDoc.docs[0].id).update({
            used: true,
            usedAt: admin.firestore.FieldValue.serverTimestamp()
        });

        res.status(200).json({ message: 'Accès autorisé.', userId: accessData.userId });
    } catch (error) {
        console.error('Erreur lors de la vérification du code d’accès :', error);
        res.status(500).json({ error: 'Erreur serveur.' });
    }
});





app.post("/api/syncEventParticipants", async (req, res) => {
    const { eventId } = req.body;

    if (!eventId) {
        return res.status(400).json({ error: "L'ID de l'événement est requis." });
    }

    try {
        const userSnapshot = await firestore
            .collection("users")
            .where("events", "array-contains", eventId)
            .get();

        const participants = userSnapshot.docs.map(doc => doc.id);

        const eventRef = firestore.collection("events").doc(eventId);

        await eventRef.update({ participants });

        res.status(200).json({ message: "Participants synchronisés avec succès." });
    } catch (error) {
        console.error("Erreur lors de la synchronisation des participants :", error);
        res.status(500).json({ error: "Erreur lors de la synchronisation des participants." });
    }
});





/// Route pour afficher le suivi des présences d'un événement spécifique avec camembert
app.get('/event/:eventId/suivi_presence', requireAuth, async (req, res) => {
    const eventId = req.params.eventId;

    try {
        // Récupération des données de l'événement
        const eventSnapshot = await firestore.collection('events').doc(eventId).get();
        if (!eventSnapshot.exists) {
            console.error(`Événement avec ID ${eventId} introuvable.`);
            return res.status(404).send('Événement introuvable.');
        }
        const eventData = eventSnapshot.data();

        // Récupération des rôles dynamiques
        const rolesSnapshot = await firestore.collection('roles').get();
        const roles = rolesSnapshot.docs.map(doc => ({
            name: doc.data().name
        }));

        // Récupération des utilisateurs liés à l'événement
        const userSnapshot = await firestore
            .collection('users')
            .where('events', 'array-contains', eventId)
            .get();

        const users = userSnapshot.docs.map(doc => {
            const userData = doc.data();
            const userId = doc.id;
            const isPresent = eventData.presence && eventData.presence[userId] === true;
            const roleInfo = roles.find(r => r.name.toLowerCase() === userData.role?.toLowerCase()) || { name: userData.role || 'Non défini' };

            return {
                id: userId,
                name: userData.name || 'Nom inconnu',
                surname: userData.surname || 'Prénom inconnu',
                email: userData.email || 'Email non fourni',
                civility: userData.civility || '',
                birthdate: userData.birthdate || '',
                role: roleInfo.name,
                presence: isPresent
            };
        });

        if (users.length === 0) {
            console.warn(`Aucun utilisateur trouvé pour l'événement avec ID ${eventId}.`);
        }

        // Identifier les rôles uniques présents dans les utilisateurs
        const uniqueRolesInUsers = [...new Set(users.map(user => user.role.toLowerCase()))];

        // Calcul des statistiques uniquement pour les rôles présents dans le tableau
        const stats = {};
        uniqueRolesInUsers.forEach(role => {
            stats[role] = { total: 0, present: 0 };
        });
        stats.total = { total: 0, present: 0 }; // Garder les stats totales

        users.forEach(user => {
            const roleKey = user.role.toLowerCase();
            if (stats[roleKey]) {
                stats[roleKey].total += 1;
                if (user.presence) stats[roleKey].present += 1;
            }
            stats.total.total += 1;
            if (user.presence) stats.total.present += 1;
        });

        // Filtrer chartData pour inclure uniquement les rôles présents dans le tableau
        const chartData = uniqueRolesInUsers.map(role => ({
            role: role.charAt(0).toUpperCase() + role.slice(1), // Capitaliser pour l'affichage
            total: stats[role].total,
            present: stats[role].present
        }));

        // Filtrer totalByRole pour inclure uniquement les rôles présents
        const totalByRole = uniqueRolesInUsers.map(role => ({
            role: role.charAt(0).toUpperCase() + role.slice(1),
            present: stats[role].present,
            absent: stats[role].total - stats[role].present
        }));

        console.log('Chart Data:', chartData, 'Total by Role:', totalByRole);

        // Rendu de la vue avec les données filtrées
        res.render('suivi_presence', {
            eventId,
            eventName: eventData.name || 'Nom d’événement inconnu',
            eventStartDate: eventData.startDate,
            eventEndDate: eventData.endDate,
            organizerName: eventData.organizerName || 'Organisateur inconnu',
            users,
            chartData,
            totalByRole,
            roles: roles.filter(role => uniqueRolesInUsers.includes(role.name.toLowerCase())) // Filtrer les rôles pour EJS
        });

    } catch (error) {
        console.error('Erreur lors de la récupération des utilisateurs pour le suivi :', error);
        res.status(500).send('Erreur lors de la récupération des utilisateurs pour le suivi.');
    }
});
//////////////////////////////////////////////////////////////////////////////


// Route pour mettre à jour le quorum
// Route pour mettre à jour le quorum
// Route pour mettre à jour le quorum (version consolidée)
app.post('/event/:eventId/update_quorum', requireAuth, async (req, res) => {
    const eventId = req.params.eventId;
    const { quorum } = req.body;

    console.log('Requête reçue pour update_quorum:', req.body);
    try {
        const eventRef = firestore.collection('events').doc(eventId);
        if (quorum === null || quorum === undefined) {
            await eventRef.update({
                quorum: admin.firestore.FieldValue.delete(), // Supprime le champ quorum
                quorumAtteint: false // Réinitialise quorumAtteint
            });
            console.log(`Quorum supprimé pour ${eventId}`);
            return res.status(200).json({ message: 'Quorum supprimé avec succès.' });
        }
        if (isNaN(quorum) || quorum <= 0) {
            return res.status(400).json({ message: 'Le quorum doit être un nombre positif.' });
        }
        await eventRef.update({
            quorum: Number(quorum),
            quorumAtteint: false // Réinitialise quorumAtteint si le quorum change
        });
        console.log(`Quorum mis à jour pour ${eventId}: ${quorum}`);
        res.status(200).json({ message: 'Quorum mis à jour avec succès.' });
    } catch (error) {
        console.error('Erreur lors de la mise à jour du quorum :', error);
        res.status(500).json({ message: 'Erreur lors de la mise à jour du quorum.' });
    }
});

// Route pour récupérer le quorum (nouvellement ajouté)
app.get('/event/:eventId/get_quorum', requireAuth, async (req, res) => {
    const eventId = req.params.eventId;

    try {
        const eventDoc = await firestore.collection('events').doc(eventId).get();
        if (!eventDoc.exists) {
            return res.status(404).json({ message: "Événement introuvable." });
        }

        const eventData = eventDoc.data();
        const quorum = eventData.quorum !== undefined ? eventData.quorum : '';
        console.log(`Quorum récupéré pour ${eventId}: ${quorum}`);
        res.status(200).json({ quorum: quorum });
    } catch (error) {
        console.error("Erreur lors de la récupération du quorum :", error);
        res.status(500).json({ message: "Erreur serveur." });
    }
});



// Configuration de stockage Multer
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const uploadPath = path.join(__dirname, 'assets')
        if (!fs.existsSync(uploadPath)) {
            fs.mkdirSync(uploadPath, { recursive: true });
        }
        cb(null, uploadPath);
    },
    filename: (req, file, cb) => {
        cb(null, file.originalname); // Garde le nom original
    }
});

const upload = multer({
    storage,
    fileFilter: (req, file, cb) => {
        const allowedExt = ['.png'];
        const fileExt = path.extname(file.originalname).toLowerCase();

        if (file.originalname.toLowerCase() !== 'logo.png') {
            return cb(new Error('Le fichier doit être nommé "logo.png".'));
        }

        if (!allowedExt.includes(fileExt)) {
            return cb(new Error('Le fichier doit être en format PNG.'));
        }

        cb(null, true);
    }
});

// Route pour le téléchargement
app.post('/event/:eventId/upload_logo', upload.single('logo'), (req, res) => {
    res.json({ success: true, message: 'Logo mis à jour avec succès.' });
});


// Gestion des erreurs Multer
app.use((err, req, res, next) => {
    if (err instanceof multer.MulterError || err.message) {
        return res.status(400).json({ success: false, message: err.message });
    }
    next(err);
});




////////////////////////////////////////////////////////////////////////

// Route pour vérifier les présences et envoyer des notifications
app.post('/event/:eventId/check_presence', requireAuth, async (req, res) => {
    const eventId = req.params.eventId;

    try {
        const eventDoc = await firestore.collection('events').doc(eventId).get();
        if (!eventDoc.exists) {
            return res.status(404).send({ message: 'Événement introuvable.' });
        }

        const eventData = eventDoc.data();
        const quorum = eventData.quorum || 0;

        // Vérification des utilisateurs présents
        const userSnapshot = await firestore
            .collection('users')
            .where('events', 'array-contains', eventId)
            .get();

        let presentUsersCount = 0;
        userSnapshot.forEach(doc => {
            if (eventData.presence && eventData.presence[doc.id] === true) {
                presentUsersCount++;
            }
        });

        // Vérification du quorum uniquement si quorum > 0
        if (quorum > 0 && presentUsersCount >= quorum) {
            if (!eventData.quorumAtteint) {
                await firestore.collection('events').doc(eventId).update({
                    quorumAtteint: true,
                });
            }

            return res.status(200).send({
                message: 'Quorum atteint et sauvegardé.',
                quorumAtteint: true,
                presentUsers: presentUsersCount,
                quorum: quorum,
                eventName: eventData.name
            });
        } else {
            return res.status(200).send({
                message: `Présences actuelles : ${presentUsersCount}/${quorum}.`,
                quorumAtteint: false,
                presentUsers: presentUsersCount,
                quorum: quorum,
                eventName: eventData.name
            });
        }
    } catch (error) {
        console.error('Erreur lors de la vérification des présences :', error);
        return res.status(500).send({ message: 'Erreur interne du serveur.' });
    }
});


// Exemple de route pour gérer /event/:eventId/gestion_event
app.get('/event/:eventId/gestion_event', async (req, res) => {
    const { eventId } = req.params;

    try {
        const eventSnapshot = await firestore.collection('events').doc(eventId).get();

        if (!eventSnapshot.exists) {
            return res.status(404).send("Événement non trouvé");
        }

        const event = eventSnapshot.data();
        event.id = eventSnapshot.id; // Assure que l'ID est inclus dans l'objet event

        // Passe event ET eventId au template
        res.render('gestion_event', { event, eventId });
    } catch (error) {
        console.error("Erreur lors de la récupération de l'événement:", error);
        res.status(500).send("Erreur serveur");
    }
});


/////////////////////////////////////////////////////////////////////////////////////

// Route pour mettre à jour la présence d'un utilisateur
app.post('/api/updatePresence', async (req, res) => {
    const { userId, eventId, isPresent } = req.body;

    console.log('Requête reçue :', { userId, eventId, isPresent });

    try {
        if (!userId || !eventId || isPresent === undefined) {
            console.log('Paramètres manquants ou invalides');
            return res.status(400).json({ message: 'Paramètres manquants ou invalides.' });
        }

        const userRef = firestore.collection('users').doc(userId);
        const userDoc = await userRef.get();
        if (!userDoc.exists) {
            console.log(`Utilisateur ${userId} introuvable`);
            return res.status(404).json({ message: 'Utilisateur introuvable.' });
        }
        const userData = userDoc.data();
        if (!userData.events || !userData.events.includes(eventId)) {
            console.log(`Utilisateur ${userId} non associé à l'événement ${eventId}`);
            return res.status(400).json({ message: 'Utilisateur non associé à cet événement.' });
        }

        const eventRef = firestore.collection('events').doc(eventId);
        const eventDoc = await eventRef.get();
        if (!eventDoc.exists) {
            console.log(`Événement ${eventId} introuvable`);
            return res.status(404).json({ message: 'Événement introuvable' });
        }

        const batch = firestore.batch();

        batch.update(eventRef, {
            [`presence.${userId}`]: isPresent
        });
        console.log(`events/presence.${userId} mis à jour à ${isPresent}`);

        const eventHistoryRef = firestore.collection('event_history').doc(`${eventId}_${userId}`);
        const eventHistoryDoc = await eventHistoryRef.get();
        console.log(`Document event_history/${eventId}_${userId} existe : ${eventHistoryDoc.exists}`);
        console.log(`Données actuelles de event_history/${eventId}_${userId} :`, eventHistoryDoc.data());
        if (eventHistoryDoc.exists) {
            batch.update(eventHistoryRef, { presence: isPresent });
            console.log(`Mise à jour ajoutée au batch pour event_history/${eventId}_${userId} avec presence: ${isPresent}`);
        } else {
            batch.set(eventHistoryRef, {
                eventId: eventId,
                userId: userId,
                userName: userData.name && userData.surname ? `${userData.name} ${userData.surname}` : 'Inconnu',
                role: userData.role || 'Non défini',
                email: userData.email || 'Non disponible',
                presence: isPresent,
                addedDate: admin.firestore.FieldValue.serverTimestamp(),
                eventEndDate: eventDoc.data().endDate
            });
            console.log(`event_history/${eventId}_${userId} créé avec presence: ${isPresent}`);
        }

        try {
            await batch.commit();
            console.log('Batch exécuté avec succès');
            const postCommitDoc = await eventHistoryRef.get();
            console.log(`Immédiatement après commit : event_history/${eventId}_${userId} presence = ${postCommitDoc.data().presence}`);
            if (postCommitDoc.data().presence !== isPresent) {
                console.log('Batch a échoué, tentative de mise à jour directe');
                await eventHistoryRef.update({ presence: isPresent });
                console.log(`Mise à jour directe réussie pour event_history/${eventId}_${userId}`);
            }
        } catch (batchError) {
            console.error('Erreur lors de l’exécution du batch :', batchError);
            throw batchError;
        }

        const updatedEventHistoryDoc = await eventHistoryRef.get();
        console.log(`Vérification finale : event_history/${eventId}_${userId} après mise à jour : presence = ${updatedEventHistoryDoc.data().presence}`);

        res.status(200).json({ message: 'Présence mise à jour avec succès.' });
    } catch (error) {
        console.error('Erreur lors de la mise à jour de la présence :', error);
        res.status(500).json({ message: 'Erreur lors de la mise à jour de la présence.' });
    }
});


app.get('/api/getPresenceStats', async (req, res) => {
    try {
        const eventId = req.query.eventId;
        if (!eventId) {
            return res.status(400).json({ error: "L'ID de l'événement est requis." });
        }

        // Vérifier si l'événement existe
        await getEventDetails(eventId); // Cela lèvera une erreur si l'événement n'existe pas

        // Récupérer les rôles
        const rolesSnapshot = await firestore.collection('roles').get();
        if (rolesSnapshot.empty) {
            return res.status(404).json({ error: "Aucun rôle trouvé dans la base de données." });
        }

        const stats = {
            total: { present: 0, absent: 0 }
        };
        rolesSnapshot.forEach(doc => {
            const roleName = doc.data().name.toLowerCase();
            stats[roleName] = { present: 0, absent: 0 };
        });

        // Récupérer les utilisateurs
        const usersSnapshot = await firestore.collection('users')
            .where('events', 'array-contains', eventId)
            .get();

        if (usersSnapshot.empty) {
            console.log(`Aucun utilisateur trouvé pour l'événement ${eventId}`);
            return res.json(stats);
        }

        // Calculer les statistiques
        usersSnapshot.forEach(doc => {
            const data = doc.data();
            const role = data.role ? data.role.toLowerCase() : null;
            const presence = data.presence;

            if (role && stats[role] !== undefined) {
                stats[role][presence ? 'present' : 'absent']++;
                stats.total[presence ? 'present' : 'absent']++;
            } else {
                console.warn(`Utilisateur avec un rôle invalide ou manquant : ${JSON.stringify(data)}`);
            }
        });

        res.json(stats);
    } catch (error) {
        console.error('Erreur lors de la récupération des statistiques :', error);
        res.status(500).json({ error: 'Erreur interne du serveur' });
    }
});

// Fonction pour récupérer les détails de l'événement
async function getEventDetails(eventId) {
    try {
        const eventRef = firestore.collection('events').doc(eventId);
        const eventDoc = await eventRef.get();

        if (!eventDoc.exists) {
            throw new Error('Événement introuvable.');
        }

        return eventDoc.data();
    } catch (error) {
        console.error('Erreur lors de la récupération des détails de l\'événement:', error);
        throw error;
    }
}




// Fonction pour récupérer les utilisateurs d'un événement
async function getUsersForEvent(eventId) {
  try {
    // Étape 1 : Récupérer le rôle "Organisateur" depuis la collection 'roles'
    const rolesSnapshot = await firestore.collection('roles').where('name', '==', 'Organisateur').get();
    if (rolesSnapshot.empty) {
      throw new Error("Le rôle 'Organisateur' n'a pas été trouvé dans la collection roles.");
    }

    // On suppose qu'il n'y a qu'un seul rôle "Organisateur" (sinon, ajustez la logique)
    const organizerRole = rolesSnapshot.docs[0].data().name;

    // Étape 2 : Récupérer les utilisateurs associés à l'événement
    const snapshot = await firestore.collection('users').where('events', 'array-contains', eventId).get();
    if (snapshot.empty) {
      throw new Error(`Aucun utilisateur trouvé pour l'événement ID : ${eventId}`);
    }

    const users = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

    // Étape 3 : Trouver l'organisateur en utilisant le rôle récupéré dynamiquement
    const organizer = users.find(user => user.role && user.role === organizerRole);
    if (!organizer) {
      throw new Error(`Organisateur introuvable pour l'événement ID : ${eventId}`);
    }

    return { users, organizer };
  } catch (error) {
    console.error(`Erreur lors de la récupération des utilisateurs pour l'événement ${eventId} :`, error.message);
    throw error;
  }
}

// Fonction pour récupérer les détails de l'événement
async function getEventDetails(eventId) {
  try {
    const eventDoc = await firestore.collection('events').doc(eventId).get();
    if (!eventDoc.exists) {
      throw new Error(`Événement introuvable pour l'ID : ${eventId}`);
    }
    return eventDoc.data();
  } catch (error) {
    console.error('Erreur lors de la récupération des détails de l\'événement :', error.message);
    throw error;
  }
}

// Fonction pour récupérer un graphique en Base64
async function generateChartBase64(config) {
	const chartJSNodeCanvas = new ChartJSNodeCanvas({ width: 520, height: 520 });
    try {
        const imageBuffer = await chartJSNodeCanvas.renderToBuffer(config);
        return imageBuffer.toString('base64');
    } catch (error) {
        console.error('Erreur lors de la génération du graphique :', error.message);
        throw error;
    }
}


async function getUsersForEvent(eventId) {
    try {
        // Récupérer les détails de l'événement
        const eventRef = firestore.collection('events').doc(eventId);
        const eventDoc = await eventRef.get();
        if (!eventDoc.exists) {
            throw new Error('Événement introuvable');
        }
        const eventData = eventDoc.data();
        const participantIds = eventData.participants || [];
        const roleVoteSettings = eventData.roleVoteSettings || {};

        // Récupérer tous les rôles depuis la collection 'roles'
        const rolesSnapshot = await firestore.collection('roles').get();
        const roles = {};
        rolesSnapshot.forEach(doc => {
            const data = doc.data();
            roles[data.name.toLowerCase()] = {
                name: data.name,
                incrementedId: data.incrementedId,
                voteEnabled: data.voteEnabled || false, // Valeur par défaut depuis roles
            };
        });

        // Récupérer les utilisateurs participants
        const users = [];
        for (const userId of participantIds) {
            const userRef = firestore.collection('users').doc(userId);
            const userDoc = await userRef.get();
            if (userDoc.exists) {
                const userData = userDoc.data();
                const userRole = userData.role.toLowerCase();
                const roleData = roles[userRole] || { name: userRole, incrementedId: null, voteEnabled: false };
                const roleSettings = roleVoteSettings[roleData.incrementedId] || {};

                // Déterminer voteEnabled : priorité à roleVoteSettings, sinon valeur par défaut du rôle
                const voteEnabled = roleSettings.voteEnabled !== undefined ? roleSettings.voteEnabled : roleData.voteEnabled;

                users.push({
                    id: userId,
                    name: userData.name || 'Inconnu',
                    surname: userData.surname || 'Inconnu',
                    role: roleData.name,
                    email: userData.email || 'Non disponible',
                    voteEnabled: voteEnabled
                });
            }
        }

        return { users };
    } catch (error) {
        console.error('Erreur dans getUsersForEvent :', error);
        throw error;
    }
}








// Fonction pour générer l'image du pied de page
async function generateFooterImage() {
    const canvas = createCanvas(400, 30);
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.font = '12px Arial';
    ctx.fillStyle = '#777';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText("© 2025 Evenvo. Généré par Evenvo - Rapport d'événement", canvas.width / 2, canvas.height / 2);
    return canvas.toDataURL('image/png').split(',')[1];
}

router.get('/event/:eventId/export-pdf', async (req, res) => {
    const eventId = req.params.eventId;
    let browser;

    try {
        console.log('Démarrage de la génération du PDF pour l\'événement :', eventId);

        const event = await getEventDetails(eventId);
        if (!event) {
            console.error('Événement introuvable pour l\'ID :', eventId);
            return res.status(404).json({ success: false, message: 'Événement introuvable' });
        }

        const today = new Date();
        let endDate = typeof event.endDate === 'string' ? new Date(event.endDate) : event.endDate.toDate();

        let users = [];
        if (endDate < today) {
            const eventHistorySnapshot = await firestore.collection('event_history')
                .where('eventId', '==', eventId)
                .get();
            users = eventHistorySnapshot.docs.map(doc => {
                const data = doc.data();
                return {
                    id: data.userId,
                    name: data.userName.split(' ')[0] || 'Inconnu',
                    surname: data.userName.split(' ')[1] || 'Inconnu',
                    role: data.role || 'Non défini',
                    email: 'Non disponible',
                    voteEnabled: data.voteEnabled || false
                };
            });
        } else {
            const usersData = await getUsersForEvent(eventId);
            users = usersData.users || [];
        }

        if (!users || users.length === 0) {
            console.error('Aucun utilisateur trouvé pour l\'événement :', eventId);
            return res.status(400).json({ success: false, message: 'Aucun utilisateur trouvé.' });
        }

        console.log('Utilisateurs récupérés :', users.length);

        const rolesSnapshot = await firestore.collection('roles').get();
        const roles = rolesSnapshot.docs.map(doc => ({
            name: doc.data().name,
            voteEnabled: doc.data().voteEnabled || false,
            incrementedId: doc.data().incrementedId
        }));

        console.log('Rôles récupérés :', roles.length);

        const roleVoteSettings = event.roleVoteSettings || {};
        roles.forEach(role => {
            const roleSettings = roleVoteSettings[role.incrementedId] || {};
            role.voteEnabled = roleSettings.voteEnabled !== undefined ? roleSettings.voteEnabled : role.voteEnabled;
        });

        console.log('Rôles après application des roleVoteSettings :', roles);

        const organizers = users
            .filter(user => user.role.toLowerCase() === 'organisateur')
            .map(user => `${user.name} ${user.surname}`)
            .join(', ') || 'Non spécifié';

        const participantRoles = [...new Set(users.map(user => user.role))];
        console.log('Rôles des participants :', participantRoles);

        const stats = participantRoles.reduce((acc, role) => {
            const roleKey = role.toLowerCase();
            acc[roleKey] = {
                present: users.filter(u => u.role.toLowerCase() === roleKey && event.presence && event.presence[u.id]).length,
                absent: users.filter(u => u.role.toLowerCase() === roleKey && (!event.presence || !event.presence[u.id])).length
            };
            return acc;
        }, {});

        const totalStats = participantRoles.reduce((acc, role) => {
            const roleKey = role.toLowerCase();
            const totalKey = `total${role.charAt(0).toUpperCase() + role.slice(1)}s`;
            acc[totalKey] = stats[roleKey].present + stats[roleKey].absent;
            return acc;
        }, {
            totalPrésents: participantRoles.reduce((total, role) => total + stats[role.toLowerCase()].present, 0),
            totalAbsents: participantRoles.reduce((total, role) => total + stats[role.toLowerCase()].absent, 0)
        });

        const chartBase64 = {};
        for (const role of participantRoles) {
            const roleKey = role.toLowerCase();
            const total = stats[roleKey].present + stats[roleKey].absent;
            const percentPresent = total > 0 ? Math.round((stats[roleKey].present / total) * 100) : 0;
            const percentAbsent = total > 0 ? 100 - percentPresent : 0;

            chartBase64[roleKey] = await generateChartBase64({
                type: 'pie',
                data: {
                    labels: [`Présent: ${stats[roleKey].present} (${percentPresent}%)`, `Absent: ${stats[roleKey].absent} (${percentAbsent}%)`],
                    datasets: [{ data: [stats[roleKey].present, stats[roleKey].absent], backgroundColor: ['#4BC0C0', '#FF6384'] }]
                },
                options: { 
                    responsive: true, 
                    plugins: { 
                        legend: { 
                            position: 'top',
                            labels: {
                                font: {
                                    size: 20
                                }
                            }
                        } 
                    }, 
                    aspectRatio: 1.3
                },
                width: 600,
                height: 600
            });
            console.log(`Graphique généré pour le rôle ${roleKey}`);
        }

        const totalPresenceChartBase64 = await generateChartBase64({
            type: 'pie',
            data: {
                labels: [`Présents: ${totalStats.totalPrésents}`, `Absents: ${totalStats.totalAbsents}`],
                datasets: [{ data: [totalStats.totalPrésents, totalStats.totalAbsents], backgroundColor: ['#4BC0C0', '#FF6384'] }]
            },
            options: { 
                responsive: true, 
                plugins: { 
                    legend: { 
                        position: 'top',
                        labels: {
                            font: {
                                size: 20
                            }
                        }
                    } 
                }, 
                aspectRatio: 1.3
            },
            width: 600,
            height: 600
        });
        console.log('Graphique total de présence généré');

        const voteSnapshot = await firestore.collection('votes').where('eventId', '==', eventId).get();
        const votes = voteSnapshot.docs.map(doc => doc.data());
        console.log('Votes récupérés :', votes.length);

        const voteEligibleUsers = users.filter(user => {
            const roleInfo = roles.find(r => r.name.toLowerCase() === user.role.toLowerCase());
            const isEligible = roleInfo && roleInfo.voteEnabled;
            console.log(`Utilisateur ${user.id} (${user.role}) - Éligible au vote : ${isEligible}`);
            return isEligible;
        });
        console.log('Utilisateurs éligibles au vote :', voteEligibleUsers.length);

        const voteEligibleRoles = [...new Set(voteEligibleUsers.map(user => user.role))];
        console.log('Rôles éligibles au vote :', voteEligibleRoles);

        const usersWithVotes = voteEligibleUsers.map(user => {
            const userVote = votes.find(vote => String(vote.userId) === String(user.id));
            return {
                ...user,
                voteChoice: userVote ? userVote.choice : 'Non voté'
            };
        });
        console.log('Utilisateurs avec votes :', usersWithVotes.length);

        const voteStatsByRole = voteEligibleRoles.reduce((acc, role) => {
            const roleKey = role.toLowerCase();
            acc[roleKey] = usersWithVotes
                .filter(user => user.role.toLowerCase() === roleKey)
                .reduce((stats, user) => {
                    stats[user.voteChoice] = (stats[user.voteChoice] || 0) + 1;
                    return stats;
                }, {});
            return acc;
        }, {});
        console.log('Statistiques des votes par rôle :', voteStatsByRole);

        const voteChartByRoleBase64 = {};
        for (const role of voteEligibleRoles) {
            const roleKey = role.toLowerCase();
            const voteData = voteStatsByRole[roleKey] || {};
            const choices = ['Oui', 'Non', "S'abstenir", 'Non voté'];
            const voteCounts = choices.map(choice => voteData[choice] || 0);

            voteChartByRoleBase64[roleKey] = await generateChartBase64({
                type: 'pie',
                data: {
                    labels: choices.map((choice, i) => `${choice}: ${voteCounts[i]}`),
                    datasets: [{ data: voteCounts, backgroundColor: ['#36A2EB', '#FF6384', '#FFCE56', '#CCCCCC'] }]
                },
                options: { 
                    responsive: true, 
                    plugins: { 
                        legend: { 
                            position: 'top',
                            labels: {
                                font: {
                                    size: 20
                                }
                            }
                        } 
                    }, 
                    aspectRatio: 1.3
                },
                width: 600,
                height: 600
            });
            console.log(`Graphique de vote généré pour le rôle ${roleKey}`);
        }

        const voteStats = usersWithVotes.reduce((acc, user) => {
            acc[user.voteChoice] = (acc[user.voteChoice] || 0) + 1;
            return acc;
        }, {});
        const orderedChoices = ['Oui', 'Non', "S'abstenir", 'Non voté'];
        const voteChartData = orderedChoices.map(choice => ({
            choice,
            count: voteStats[choice] || 0
        }));
        const voteChartBase64 = await generateChartBase64({
            type: 'pie',
            data: {
                labels: voteChartData.map(data => `${data.choice}: ${data.count}`),
                datasets: [{ data: voteChartData.map(data => data.count), backgroundColor: ['#36A2EB', '#FF6384', '#FFCE56', '#CCCCCC'] }]
            },
            options: { 
                responsive: true, 
                plugins: { 
                    legend: { 
                        position: 'top',
                        labels: {
                            font: {
                                size: 20
                            }
                        }
                    } 
                }, 
                aspectRatio: 1.3
            },
            width: 600,
            height: 600
        });
        console.log('Graphique total des votes généré');

        const logoPath = path.join(__dirname, 'assets', 'logo.png');
        const logoBuffer = fs.readFileSync(logoPath);
        const logoBase64 = logoBuffer.toString('base64');
        console.log('Logo chargé');

        const footerImageBase64 = await generateFooterImage();
        console.log('Image de pied de page générée');

        const htmlContent = await ejs.renderFile(path.join(__dirname, 'views', 'pdf_template.ejs'), {
            eventName: event.name,
            eventStartDate: event.startDate,
            eventEndDate: event.endDate,
            users,
            organizers,
            logoBase64,
            chartBase64,
            totalPresenceChartBase64,
            stats,
            totalStats,
            event,
            voteTable: usersWithVotes,
            voteChartBase64,
            voteChartByRoleBase64,
            roles,
            participantRoles,
            voteEligibleRoles,
            footerImageBase64
        });
        console.log('Template EJS rendu, taille HTML :', htmlContent.length);

        browser = await puppeteer.launch({
            headless: true,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-accelerated-2d-canvas',
                '--no-first-run',
                '--no-zygote',
                '--disable-gpu'
            ],
            timeout: 120000
        });
        const page = await browser.newPage();

        await page.setContent(htmlContent, { waitUntil: 'networkidle0', timeout: 120000 });
        console.log('Contenu HTML chargé dans Puppeteer');

        await page.emulateMediaType('print');
        const pdfBuffer = await page.pdf({
            format: 'A4',
            printBackground: true,
            margin: { top: '10mm', bottom: '15mm', left: '10mm', right: '10mm' },
            preferCSSPageSize: true
        });
        console.log('PDF généré, taille du buffer :', pdfBuffer.length);

        // Suppression de l'étape de sauvegarde locale
        // fs.writeFileSync(`test_${eventId}.pdf`, pdfBuffer);
        // console.log('PDF sauvegardé localement :', `test_${eventId}.pdf`);

        await browser.close();
        browser = null;

        res.set({
            'Content-Type': 'application/pdf',
            'Content-Disposition': `attachment; filename="event_${eventId}_suivi_presence.pdf"`,
            'Content-Length': pdfBuffer.length,
            'Cache-Control': 'no-cache, no-store, must-revalidate',
            'Pragma': 'no-cache',
            'Expires': '0',
            'Content-Transfer-Encoding': 'binary',
            'Content-Encoding': 'identity',
            'Accept-Ranges': 'bytes'
        });

        console.log('En-têtes envoyés :', res.getHeaders());
        console.log('Buffer valide :', Buffer.isBuffer(pdfBuffer), 'Taille :', pdfBuffer.length);

        res.status(200).end(pdfBuffer);
        console.log('PDF envoyé au client');

    } catch (error) {
        console.error('Erreur lors de l\'exportation du PDF :', error);
        if (browser) {
            await browser.close();
        }
        res.status(500).json({ success: false, message: 'Erreur serveur.', error: error.message });
    }
});


app.post('/toggle-vote', async (req, res) => {
    try {
        const { eventId, enabled } = req.body;

        if (!eventId) {
            return res.status(400).json({ message: "L'ID de l'événement est requis." });
        }

        // Vérification si l'événement existe
        const eventRef = firestore.collection('events').doc(eventId);
        const eventDoc = await eventRef.get();
        
        if (!eventDoc.exists) {
            return res.status(404).json({ message: "L'événement n'a pas été trouvé." });
        }

        // Mise à jour de l'état du vote dans Firestore
        await eventRef.update({
            voteEnabled: enabled
        });

        res.status(200).json({ message: `Vote ${enabled ? "activé" : "désactivé"} avec succès` });
    } catch (error) {
        console.error("Erreur lors de la mise à jour du vote :", error);
        res.status(500).json({ message: "Erreur serveur" });
    }
});

app.get('/get-vote-status', async (req, res) => {
    try {
        const { eventId } = req.query;

        if (!eventId) {
            return res.status(400).json({ message: "L'ID de l'événement est requis." });
        }

        const eventRef = firestore.collection('events').doc(eventId);
        const eventDoc = await eventRef.get();

        if (!eventDoc.exists) {
            return res.status(404).json({ message: "L'événement n'a pas été trouvé." });
        }

        const eventData = eventDoc.data();
        res.status(200).json({ voteEnabled: eventData.voteEnabled });
    } catch (error) {
        console.error("Erreur lors de la récupération du statut du vote :", error);
        res.status(500).json({ message: "Erreur serveur" });
    }
});




async function getUserVoteEligibility(userId, eventId) {
    const userRef = firestore.collection('users').doc(userId);
    const eventRef = firestore.collection('events').doc(eventId);
    const rolesSnapshot = await firestore.collection('roles').get();

    const [userDoc, eventDoc] = await Promise.all([userRef.get(), eventRef.get()]);
    if (!userDoc.exists || !eventDoc.exists) return { eligible: false };

    const userData = userDoc.data();
    const eventData = eventDoc.data();
    const roleVoteSettings = eventData.roleVoteSettings || {};

    const roles = {};
    rolesSnapshot.forEach(doc => {
        const data = doc.data();
        roles[data.name.toLowerCase()] = {
            name: data.name,
            incrementedId: data.incrementedId,
            voteEnabled: data.voteEnabled || false,
        };
    });

    const userRole = userData.role.toLowerCase();
    const roleData = roles[userRole] || { voteEnabled: false };
    const roleSettings = roleVoteSettings[roleData.incrementedId] || {};
    const voteEnabled = roleSettings.voteEnabled !== undefined ? roleSettings.voteEnabled : roleData.voteEnabled;

    return {
        eligible: voteEnabled,
        user: {
            id: userId,
            name: userData.name || 'Inconnu',
            surname: userData.surname || 'Inconnu',
            role: roleData.name || userData.role,
            email: userData.email || 'Non disponible',
        }
    };
}


app.get('/event/:eventId/suivi_vote', requireAuth, async (req, res) => {
    const eventId = req.params.eventId;

    try {
        const eventSnapshot = await firestore.collection('events').doc(eventId).get();
        if (!eventSnapshot.exists) {
            console.error(`Événement avec ID ${eventId} introuvable.`);
            return res.status(404).send('Événement introuvable.');
        }

        const eventData = eventSnapshot.data();

        const userSnapshot = await firestore
            .collection('users')
            .where('events', 'array-contains', eventId)
            .get();

        const users = [];
        for (const doc of userSnapshot.docs) {
            const eligibility = await getUserVoteEligibility(doc.id, eventId);
            if (eligibility.eligible) {
                users.push({
                    id: doc.id,
                    name: eligibility.user.name,
                    surname: eligibility.user.surname,
                    civility: doc.data().civility || '-',
                    birthdate: doc.data().birthdate || '-',
                    email: eligibility.user.email,
                    role: eligibility.user.role,
                    voteEnabled: true
                });
            }
        }

        const voteSnapshot = await firestore.collection('votes').where('eventId', '==', eventId).get();
        const votes = voteSnapshot.docs.map(doc => doc.data());

        const totalEligibleUsers = users.length;
        const usersWhoVoted = votes.filter(vote => users.some(user => user.id === vote.userId)).length;
        const nonVotedCount = totalEligibleUsers - usersWhoVoted;

        const usersWithVotes = users.map(user => {
            const userVote = votes.find(vote => vote.userId === user.id);
            return {
                ...user,
                voteChoice: userVote ? userVote.choice : 'Non voté'
            };
        });

        // Calcul des statistiques globales (voteChartData)
        const voteStats = usersWithVotes.reduce((acc, user) => {
            acc[user.voteChoice] = (acc[user.voteChoice] || 0) + 1;
            return acc;
        }, {});

        const orderedChoices = ["Oui", "Non", "S'abstenir", "Non voté"];
        const voteChartData = orderedChoices.map(choice => ({
            choice,
            count: voteStats[choice] || 0
        }));

        // Calcul des données par rôle (chartData)
        const roleStats = usersWithVotes.reduce((acc, user) => {
            if (!acc[user.role]) {
                acc[user.role] = { total: 0, oui: 0, non: 0, abstention: 0, nonVote: 0 };
            }
            acc[user.role].total++;
            if (user.voteChoice === "Oui") acc[user.role].oui++;
            else if (user.voteChoice === "Non") acc[user.role].non++;
            else if (user.voteChoice === "S'abstenir") acc[user.role].abstention++;
            else acc[user.role].nonVote++;
            return acc;
        }, {});

        const chartData = Object.keys(roleStats).map(role => ({
            role,
            total: roleStats[role].total,
            oui: roleStats[role].oui,
            non: roleStats[role].non,
            abstention: roleStats[role].abstention,
            nonVote: roleStats[role].nonVote
        }));

        // Calcul des totaux pour tous les rôles (totalByRole)
        const totalByRole = chartData.map(data => ({
            role: data.role,
            oui: data.oui,
            non: data.non,
            abstention: data.abstention,
            nonVote: data.nonVote
        }));

        res.render('suivi_vote', {
            eventId,
            eventName: eventData.name || 'Nom d’événement inconnu',
            eventStartDate: eventData.startDate,
            eventEndDate: eventData.endDate,
            organizerName: eventData.organizerName || 'Organisateur inconnu',
            users: usersWithVotes,
            voteChartData,
            chartData, // Données par rôle
            totalByRole // Données totales
        });
    } catch (error) {
        console.error('Erreur lors de la récupération des utilisateurs pour le suivi :', error);
        res.status(500).send('Erreur lors de la récupération des utilisateurs pour le suivi.');
    }
});

app.post('/api/updateVote', async (req, res) => {
    const { userId, eventId, voteChoice } = req.body;

    console.log('Requête reçue :', { userId, eventId, voteChoice });

    try {
        if (!userId || !eventId || !voteChoice || !['Oui', 'Non', "S'abstenir"].includes(voteChoice)) {
            console.log('Paramètres manquants ou choix de vote invalide');
            return res.status(400).json({ message: 'Paramètres manquants ou choix de vote invalide.' });
        }

        // Vérifier l'éligibilité de l'utilisateur au vote
        const eligibility = await getUserVoteEligibility(userId, eventId);
        if (!eligibility.eligible) {
            console.log(`Utilisateur ${userId} non autorisé à voter pour l'événement ${eventId}`);
            return res.status(403).json({ message: 'Utilisateur non autorisé à voter pour cet événement.' });
        }

        const userData = eligibility.user;
        const eventRef = firestore.collection('events').doc(eventId);
        const eventDoc = await eventRef.get();
        if (!eventDoc.exists) {
            console.log(`Événement ${eventId} introuvable`);
            return res.status(404).json({ message: 'Événement introuvable' });
        }

        const batch = firestore.batch();

        // Mise à jour dans votes
        const voteRef = firestore.collection('votes').doc(`${eventId}_${userId}`);
        batch.set(voteRef, {
            eventId: eventId,
            userId: userId,
            choice: voteChoice,
            timestamp: admin.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
        console.log(`votes/${eventId}_${userId} mis à jour avec choice: ${voteChoice}`);

        // Mise à jour dans event_history
        const eventHistoryRef = firestore.collection('event_history').doc(`${eventId}_${userId}`);
        const eventHistoryDoc = await eventHistoryRef.get();
        if (eventHistoryDoc.exists) {
            batch.update(eventHistoryRef, { vote: voteChoice });
            console.log(`event_history/${eventId}_${userId} mis à jour avec vote: ${voteChoice}`);
        } else {
            batch.set(eventHistoryRef, {
                eventId: eventId,
                userId: userId,
                userName: `${userData.name} ${userData.surname}`.trim() || 'Inconnu',
                role: userData.role || 'Non défini',
                email: userData.email || 'Non disponible',
                vote: voteChoice,
                addedDate: admin.firestore.FieldValue.serverTimestamp(),
                eventEndDate: eventDoc.data().endDate,
                voteEnabled: true // Puisque l'utilisateur vote, il est éligible
            });
            console.log(`event_history/${eventId}_${userId} créé avec vote: ${voteChoice}`);
        }

        await batch.commit();
        console.log('Batch exécuté avec succès');
        res.status(200).json({ message: 'Vote mis à jour avec succès.' });
    } catch (error) {
        console.error('Erreur lors de la mise à jour du vote :', error);
        res.status(500).json({ message: 'Erreur lors de la mise à jour du vote.' });
    }
});


// Créer un répertoire temporaire pour stocker les images QR Code



const tempDir = path.join(__dirname, 'temp'); // Gardons uniquement tempDir pour les fichiers temporaires

if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir);

async function getUsersForEvent(eventId) {
    try {
        const usersSnapshot = await firestore
            .collection('users')
            .where('events', 'array-contains', eventId)
            .get();

        if (usersSnapshot.empty) {
            console.error('Aucun utilisateur trouvé pour cet événement');
            return { users: [] };
        }

        const rolesSnapshot = await firestore.collection('roles').get();
        const roles = {};
        rolesSnapshot.forEach(doc => {
            const data = doc.data();
            roles[data.name.toLowerCase()] = {
                name: data.name,
                incrementedId: data.incrementedId,
                voteEnabled: data.voteEnabled || false,
            };
        });

        const eventRef = firestore.collection('events').doc(eventId);
        const eventDoc = await eventRef.get();
        const eventData = eventDoc.exists ? eventDoc.data() : {};
        const roleVoteSettings = eventData.roleVoteSettings || {};

        const users = usersSnapshot.docs.map(doc => {
            const userData = doc.data();
            const userRole = userData.role.toLowerCase();
            const roleData = roles[userRole] || { name: userData.role, voteEnabled: false };
            const roleSettings = roleVoteSettings[roleData.incrementedId] || {};
            const voteEnabled = roleSettings.voteEnabled !== undefined ? roleSettings.voteEnabled : roleData.voteEnabled;

            return {
                id: doc.id,
                name: userData.name || 'Inconnu',
                surname: userData.surname || 'Inconnu',
                email: userData.email || 'Non disponible',
                role: roleData.name || userData.role,
                voteEnabled: voteEnabled,
            };
        });

        return { users };
    } catch (error) {
        console.error('Erreur dans getUsersForEvent :', error);
        return { users: [] };
    }
}

app.get('/generate-qrcodes/:eventId', async (req, res) => {
    const { eventId } = req.params;
    console.log(`Tentative de génération de QR codes pour l'événement avec ID: ${eventId}`);

    try {
        // Récupérer les détails de l'événement
        const eventRef = firestore.collection('events').doc(eventId);
        const eventDoc = await eventRef.get();

        if (!eventDoc.exists) {
            console.error('Événement non trouvé dans Firestore');
            return res.status(404).json({
                success: false,
                message: 'Événement non trouvé'
            });
        }

        const eventData = eventDoc.data();
        console.log(`Événement trouvé : ${eventData.name}`);

        // Récupérer les utilisateurs avec leurs rôles dynamiques
        const { users } = await getUsersForEvent(eventId);

        // Vérifier s'il y a des utilisateurs
        if (!users || users.length === 0) {
            console.error('Aucun utilisateur trouvé pour cet événement');
            return res.status(400).json({
                success: false,
                message: "Aucun utilisateur n’est rattaché à cet événement."
            });
        }

        // Initialisation du document PDF
        const doc = new PDFDocument({ size: 'A4', margin: 50 });
        const filename = `badges_${eventId}.pdf`;
        res.setHeader('Content-Disposition', `attachment; filename=${filename}`);
        res.setHeader('Content-Type', 'application/pdf');
        doc.pipe(res);

        // Entête du document PDF
        const headerHeight = 180;
        const pageWidth = doc.page.width;
        const pageMargin = 50;
        const contentWidth = pageWidth - pageMargin * 2;

        doc.rect(pageMargin, 20, contentWidth, headerHeight).fill('#B2D8D8');
        if (logoPath) {
            const logoSize = 70;
            const logoX = (pageWidth - logoSize) / 2;
            const logoY = 45;
            doc.image(logoPath, logoX, logoY, { width: logoSize, height: logoSize });
        }

        const textYPosition = 130;
        doc.fillColor('black')
            .fontSize(18)
            .text('Les badges des invités', pageMargin, textYPosition, { 
                width: contentWidth,
                align: 'center'
            })
            .fontSize(12)
            .text(`Nom de l'Événement : ${eventData.name || 'Non spécifié'}`, pageMargin, textYPosition + 25, {
                width: contentWidth,
                align: 'center'
            })
            .text(`Dates : ${eventData.startDate || 'Non spécifiée'} - ${eventData.endDate || 'Non spécifiée'}`, pageMargin, textYPosition + 40, {
                width: contentWidth,
                align: 'center'
            });

        doc.fillColor('black');
        doc.moveDown(4);

        // Générer les badges pour chaque utilisateur
        for (const user of users) {
            const userId = user.id;

            // Récupérer le code d'accès
            const accessCodeRef = firestore.collection('access_codes').doc(`${eventId}_${userId}`);
            const accessCodeDoc = await accessCodeRef.get();
            const accessCode = accessCodeDoc.exists ? accessCodeDoc.data().code : 'Non généré';

            // Générer le contenu du QR Code
            const qrContent = JSON.stringify({
                userId: userId,
                eventId: eventId,
                name: user.name,
                surname: user.surname,
                role: user.role,
                email: user.email,
                accessCode: accessCode,
                voteEnabled: user.voteEnabled
            });

            const qrFileName = `${user.name}-${user.surname}-${Date.now()}.png`;
            const qrTempPath = path.join(tempDir, qrFileName);

            try {
                await QRCode.toFile(qrTempPath, qrContent, {
                    width: 150,
                    margin: 1,
                    errorCorrectionLevel: 'H'
                });

                await firestore.collection('users').doc(userId).update({
                    qrCode: qrContent
                });

                const badgeWidth = 400;
                const badgeHeight = 140;
                const startX = (doc.page.width - badgeWidth) / 2;
                let startY = doc.y;

                if (startY + badgeHeight > doc.page.height - 50) {
                    doc.addPage();
                    startY = 50;
                }

                doc.rect(startX, startY, badgeWidth, badgeHeight).stroke();
                doc.fontSize(14)
                    .text(`Nom : ${user.name}`, startX + 120, startY + 10)
                    .text(`Prénom : ${user.surname}`, startX + 120, startY + 30)
                    .text(`Rôle : ${user.role}`, startX + 120, startY + 50)
                    .text(`Code d'accès : ${accessCode}`, startX + 120, startY + 70);

                const qrCodeSize = 80;
                doc.image(qrTempPath, startX + 20, startY + 10, { width: qrCodeSize, height: qrCodeSize });

                if (logoPath) {
                    const logoSize = 50;
                    const logoX = startX + badgeWidth - logoSize - 20;
                    const logoY = startY + 10;
                    doc.image(logoPath, logoX, logoY, { width: logoSize, height: logoSize });
                }

                const footerText = 'NocEvent by Evenvo©';
                const footerX = startX + 20;
                const footerY = startY + badgeHeight - 20;
                doc.fontSize(9).text(footerText, footerX, footerY, {
                    width: badgeWidth - 40,
                    align: 'right'
                });

                fs.unlinkSync(qrTempPath);
                doc.moveDown(3);
            } catch (error) {
                console.error(`Erreur lors de la génération du QR Code pour ${user.name}:`, error);
                continue;
            }
        }

        doc.end();
    } catch (error) {
        console.error('Erreur lors de la génération des QR codes :', error);
        res.status(500).json({
            success: false,
            message: 'Erreur serveur lors de la génération des QR codes.'
        });
    }
});



app.get('/administration', requireAuth, (req, res) => {
  res.render('administration');
});



// Route pour créer un utilisateur
app.post('/create_superadmin', requireAuth, async (req, res) => {
    console.log('Données reçues dans req.body :', req.body);
    const { name, surname, email, civility, birthdate, password, confirmPassword, role } = req.body;

    // Vérification des champs obligatoires
    const missingFields = [];
    if (!name?.trim()) missingFields.push('Nom');
    if (!surname?.trim()) missingFields.push('Prénom');
    if (!email?.trim()) missingFields.push('Email');
    if (!civility?.trim()) missingFields.push('Civilité');
    if (!birthdate?.trim()) missingFields.push('Date de naissance');
    if (!password?.trim()) missingFields.push('Mot de passe');
    if (!confirmPassword?.trim()) missingFields.push('Confirmation du mot de passe');

    if (missingFields.length > 0) {
        return res.status(400).json({ error: `Les champs suivants sont obligatoires : ${missingFields.join(', ')}.` });
    }

    if (password !== confirmPassword) {
        return res.status(400).json({ error: 'Les mots de passe ne correspondent pas.' });
    }

    try {
        // Vérifier si l'email existe déjà dans Firebase Authentication
        try {
            await admin.auth().getUserByEmail(email);
            return res.status(400).json({ error: 'Cet email est déjà utilisé par un autre compte.' });
        } catch (authError) {
            if (authError.code !== 'auth/user-not-found') {
                throw authError;
            }
        }

        // Obtenir le prochain ID incrémentiel
        const counterRef = admin.firestore().collection('counters').doc('superAdminCounter');
        const counterDoc = await counterRef.get();

        let newId;
        if (!counterDoc.exists) {
            await counterRef.set({ count: 1 });
            newId = 1;
        } else {
            newId = counterDoc.data().count + 1;
            await counterRef.update({ count: newId });
        }

        // Limite de 20 super admins
        const snapshot = await admin.firestore().collection('super_admin').get();
        if (snapshot.size >= 20) {
            return res.status(403).json({ error: 'Limite de 20 super administrateurs atteinte.' });
        }

        // Vérifier si l'email existe déjà dans Firestore
        const emailSnapshot = await admin.firestore().collection('super_admin')
            .where('email', '==', email)
            .get();
        if (!emailSnapshot.empty) {
            return res.status(400).json({ error: 'Cet email est déjà utilisé dans la base de données.' });
        }

        // Créer l'utilisateur dans Firebase Authentication
        const userRecord = await admin.auth().createUser({
            uid: newId.toString(),
            email: email,
            password: password,
            displayName: `${name} ${surname}`,
        });

        // Ajouter à la collection super_admin
        const superAdminData = {
            id: newId,
            uid: newId.toString(),
            name,
            surname,
            email,
            civility,
            birthdate,
            role: role || 'Super Admin',
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
        };

        await admin.firestore().collection('super_admin').doc(newId.toString()).set(superAdminData);

        console.log('Super admin créé avec succès, ID:', newId);
        res.status(201).json({ message: 'Super administrateur créé avec succès.', id: newId });
    } catch (error) {
        console.error('Erreur lors de la création du super admin :', error);
        res.status(500).json({ error: 'Erreur serveur : ' + (error.message || error) });
    }
});



// Route pour afficher le formulaire de création d'utilisateur
app.get('/create_superadmin', requireAuth, async (req, res) => {
  try {
    const snapshot = await firestore.collection('super_admin').get();
    const superAdmins = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    console.log('Super Admins récupérés :', superAdmins); // Ajoutez ceci pour déboguer
    res.render('create_superadmin', { superAdmins });
  } catch (error) {
    console.error('Erreur lors de la récupération des super admins :', error);
    res.status(500).send('Erreur serveur');
  }
});

function generateRandomPassword(length = 16) {
  return crypto.randomBytes(length).toString('base64').slice(0, length);
}

// Fonction pour initialiser les super administrateurs
async function initializeDefaultSuperAdmin() {
  // Utiliser des variables d’environnement pour l’email (configurable par client)
  const defaultEmail = process.env.DEFAULT_ADMIN_EMAIL || `admin-${crypto.randomBytes(4).toString('hex')}@example.com`;
  const defaultPassword = process.env.DEFAULT_ADMIN_PASSWORD || generateRandomPassword();
  const superAdminUid = `superadmin-${crypto.randomBytes(8).toString('hex')}`; // UID unique

  try {
    // Vérifier si des super administrateurs existent déjà
    const superAdminSnapshot = await admin.firestore().collection('super_admin').limit(1).get();
    if (!superAdminSnapshot.empty) {
      console.log("Des super administrateurs existent déjà, initialisation annulée.");
      return;
    }

    // Créer le super admin dans Firebase Authentication
    let userRecord;
    try {
      userRecord = await admin.auth().getUserByEmail(defaultEmail);
      console.log(`Super admin ${defaultEmail} existe déjà dans Authentication`);
    } catch (error) {
      if (error.code === 'auth/user-not-found') {
        userRecord = await admin.auth().createUser({
          uid: superAdminUid,
          email: defaultEmail,
          password: defaultPassword,
          displayName: "Admin Default"
        });
        console.log(`Super admin ${defaultEmail} créé dans Authentication avec UID: ${superAdminUid}`);
        console.log(`Mot de passe généré : ${defaultPassword}`); // À envoyer au client
      } else {
        throw error;
      }
    }

    // Ajouter le super admin dans Firestore
    const superAdminRef = admin.firestore().collection('super_admin').doc(superAdminUid);
    await superAdminRef.set({
      birthdate: "1980-01-01",
      civility: "M",
      email: defaultEmail,
      name: "Admin",
      role: "Super Admin",
      surname: "Default",
      uid: superAdminUid
    });
    console.log(`Super admin ${defaultEmail} ajouté dans Firestore`);

    // Mettre à jour la liste des super administrateurs protégés dynamiquement
    if (!global.PROTECTED_SUPERADMINS) global.PROTECTED_SUPERADMINS = [];
    global.PROTECTED_SUPERADMINS.push(superAdminUid);

  } catch (error) {
    console.error("Erreur lors de l’initialisation du super admin :", error);
  }
}


// Fonction pour récupérer les trois premiers super administrateurs protégés
async function getProtectedSuperAdmins() {
    try {
        const snapshot = await firestore
            .collection('super_admin')
            .orderBy('createdAt', 'asc')
            .limit(3)
            .get();
        const protectedAdmins = snapshot.docs.map(doc => doc.id);
        console.log('Admins protégés récupérés :', protectedAdmins);
        return protectedAdmins;
    } catch (error) {
        console.error('Erreur lors de la récupération des admins protégés :', error);
        return [];
    }
}


// Route pour supprimer des super administrateurs
// Route pour supprimer des super administrateurs
app.post('/delete_superadmin', async (req, res) => {
    const { superAdminIds } = req.body;

    // Vérifier si la liste d'IDs est valide
    if (!superAdminIds || !Array.isArray(superAdminIds) || superAdminIds.length === 0) {
        return res.status(400).json({ error: "Il faut une liste d'IDs." });
    }

    try {
        // Vérifier si l'utilisateur essaie de supprimer son propre compte
        if (superAdminIds.includes(req.session.userId)) {
            return res.status(403).json({ error: "Vous ne pouvez pas supprimer votre propre compte car vous êtes connecté avec celui-ci." });
        }

        // Compter le nombre total de super admins
        const snapshot = await firestore.collection('super_admin').get();
        const totalSuperAdmins = snapshot.size;

        // Vérifier qu'il restera au moins 1 super admin
        if (totalSuperAdmins - superAdminIds.length < 1) {
            return res.status(403).json({ error: "Il doit toujours y avoir au moins 1 super administrateur !" });
        }

        // Récupérer les admins protégés
        const protectedAdmins = await getProtectedSuperAdmins();
        if (protectedAdmins.length === 0) {
            console.warn("Aucun admin protégé trouvé, vérifiez Firestore.");
        }

        // Vérifier si un ID est protégé
        for (const id of superAdminIds) {
            if (protectedAdmins.includes(id)) {
                return res.status(403).json({ error: "Vous ne pouvez pas supprimer cet administrateur protégé !" });
            }
        }

        // Supprimer les super admins
        const batch = firestore.batch();
        for (const id of superAdminIds) {
            const superAdminRef = firestore.collection('super_admin').doc(id);
            batch.delete(superAdminRef);
            await admin.auth().deleteUser(id).catch(err => console.log(`Utilisateur ${id} non supprimé dans Auth : ${err}`));
        }

        await batch.commit();
        res.status(200).json({ message: "Super administrateurs supprimés avec succès." });
    } catch (error) {
        console.error("Erreur lors de la suppression :", error);
        res.status(500).json({ error: "Erreur lors de la suppression : " + error.message });
    }
});


// Lancer l’initialisation au démarrage
initializeDefaultSuperAdmin().then(() => {
  console.log("Initialisation du super admin terminée");
});;



app.post('/update_superadmin/:id', requireAuth, async (req, res) => {
  const superAdminId = req.params.id; // ID Firestore
  const { name, surname, email, civility, birthdate, role, password, confirmPassword } = req.body;

  // Vérification des champs obligatoires
  const missingFields = [];
  if (!name?.trim()) missingFields.push('Nom');
  if (!surname?.trim()) missingFields.push('Prénom');
  if (!email?.trim()) missingFields.push('Email');
  if (!civility?.trim()) missingFields.push('Civilité');
  if (!birthdate?.trim()) missingFields.push('Date de naissance');
  if (!role?.trim()) missingFields.push('Rôle');

  if (missingFields.length > 0) {
    return res.status(400).json({ error: `Les champs suivants sont obligatoires : ${missingFields.join(', ')}.` });
  }

  try {
    // Récupérer le document existant pour obtenir l'UID
    const superAdminDoc = await firestore.collection('super_admin').doc(superAdminId).get();
    if (!superAdminDoc.exists) {
      return res.status(404).json({ error: 'Super administrateur non trouvé.' });
    }

    const uid = superAdminDoc.data().uid; // Récupérer l'UID Firebase Auth

    // Vérifier si l'email est déjà utilisé par un autre super admin
    const emailSnapshot = await firestore.collection('super_admin')
      .where('email', '==', email)
      .get();

    const existingDocs = emailSnapshot.docs.filter(doc => doc.id !== superAdminId);
    if (existingDocs.length > 0) {
      return res.status(400).json({ error: 'Cet email est déjà utilisé par un autre super administrateur.' });
    }

    // Mettre à jour dans Firestore
    const superAdminData = {
      name,
      surname,
      email,
      civility,
      birthdate,
      role,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    await firestore.collection('super_admin').doc(superAdminId).update(superAdminData);

    // Mettre à jour dans Firebase Authentication
    const authUpdateData = {
      email: email,
      displayName: `${name} ${surname}`,
    };

    // Mettre à jour le mot de passe si fourni
    if (password && confirmPassword && password === confirmPassword) {
      authUpdateData.password = password; // Mettre à jour le mot de passe
    }

    await admin.auth().updateUser(uid, authUpdateData);

    console.log('Super admin mis à jour avec succès');
    res.status(200).json({ message: 'Super administrateur mis à jour avec succès' });
  } catch (error) {
    console.error('Erreur détaillée lors de la mise à jour du super admin :', error.message);
    res.status(500).json({ error: 'Erreur serveur : ' + error.message });
  }
});



// Fonction pour convertir une date Excel (nombre) ou une date au format YYYY-MM-DD en YYYY-MM-DD
// Fonction pour convertir une date Excel (nombre) ou une date au format YYYY-MM-DD en YYYY-MM-DD
function convertExcelDateToString(dateValue) {
    // Si la valeur est une chaîne au format YYYY-MM-DD, on la valide et on la retourne telle quelle
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (typeof dateValue === 'string' && dateRegex.test(dateValue)) {
        const date = new Date(dateValue);
        if (!isNaN(date.getTime())) {
            return dateValue; // Format déjà correct, on le garde
        }
    }

    // Si la valeur est un nombre (format Excel), on la convertit
    if (typeof dateValue === 'number' || (typeof dateValue === 'string' && !isNaN(parseInt(dateValue)))) {
        const excelDate = typeof dateValue === 'string' ? parseInt(dateValue) : dateValue;
        // Excel compte les jours depuis le 1er janvier 1900, mais il y a un décalage à ajuster
        const baseDate = new Date(1900, 0, 1); // 1er janvier 1900
        const date = new Date(baseDate.getTime() + (excelDate - 2) * 24 * 60 * 60 * 1000); // -2 pour ajuster le décalage Excel
        if (!isNaN(date.getTime())) {
            const year = date.getFullYear();
            const month = String(date.getMonth() + 1).padStart(2, '0'); // Mois de 0 à 11, +1 et format 2 chiffres
            const day = String(date.getDate()).padStart(2, '0'); // Jour format 2 chiffres
            return `${year}-${month}-${day}`;
        }
    }

    // Si la conversion échoue, on retourne la valeur brute (pour débogage ou gestion d'erreur)
    return dateValue;
}





// Fonction pour convertir une date Excel (nombre) ou une date au format YYYY-MM-DD en YYYY-MM-DD
function convertExcelDateToString(dateValue) {
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (typeof dateValue === 'string' && dateRegex.test(dateValue)) {
        const date = new Date(dateValue);
        if (!isNaN(date.getTime())) {
            return dateValue;
        }
    }
    if (typeof dateValue === 'number' || (typeof dateValue === 'string' && !isNaN(parseInt(dateValue)))) {
        const excelDate = typeof dateValue === 'string' ? parseInt(dateValue) : dateValue;
        const baseDate = new Date(1900, 0, 1);
        const date = new Date(baseDate.getTime() + (excelDate - 2) * 24 * 60 * 60 * 1000);
        if (!isNaN(date.getTime())) {
            const year = date.getFullYear();
            const month = String(date.getMonth() + 1).padStart(2, '0');
            const day = String(date.getDate()).padStart(2, '0');
            return `${year}-${month}-${day}`;
        }
    }
    return dateValue;
}


// Fonction pour convertir une date Excel (nombre) ou une date au format YYYY-MM-DD en YYYY-MM-DD
function convertExcelDateToString(dateValue) {
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (typeof dateValue === 'string' && dateRegex.test(dateValue)) {
        const date = new Date(dateValue);
        if (!isNaN(date.getTime())) {
            return dateValue;
        }
    }
    if (typeof dateValue === 'number' || (typeof dateValue === 'string' && !isNaN(parseInt(dateValue)))) {
        const excelDate = typeof dateValue === 'string' ? parseInt(dateValue) : dateValue;
        const baseDate = new Date(1900, 0, 1);
        const date = new Date(baseDate.getTime() + (excelDate - 2) * 24 * 60 * 60 * 1000);
        if (!isNaN(date.getTime())) {
            const year = date.getFullYear();
            const month = String(date.getMonth() + 1).padStart(2, '0');
            const day = String(date.getDate()).padStart(2, '0');
            return `${year}-${month}-${day}`;
        }
    }
    return dateValue;
}


// Fonction cleanUploadsDir améliorée
async function cleanUploadsDir() {
    const uploadDir = path.join(__dirname, 'uploads');
    console.log('Tentative de nettoyage du dossier:', uploadDir);
    try {
        await fsPromises.access(uploadDir);
        const files = await fsPromises.readdir(uploadDir);
        console.log('Fichiers trouvés dans uploads:', files);

        if (files.length === 0) {
            console.log('Dossier uploads déjà vide.');
            return;
        }

        for (const file of files) {
            const filePath = path.join(uploadDir, file);
            console.log('Suppression du fichier:', filePath);
            await fsPromises.unlink(filePath);
            console.log(`Fichier supprimé avec succès: ${filePath}`);
        }
        console.log('Dossier uploads purgé avec succès.');
    } catch (error) {
        if (error.code === 'ENOENT') {
            console.log('Dossier uploads n\'existe pas, pas de nettoyage nécessaire.');
        } else {
            console.error('Erreur lors du nettoyage du dossier uploads:', error);
            throw error;
        }
    }
}

// getNextUserId corrigé pour éviter les doublons
async function getNextUserId(usedIds = new Set()) {
    const usersSnapshot = await firestore.collection('users').get();
    const existingIds = usersSnapshot.docs.map(doc => parseInt(doc.id)).filter(id => !isNaN(id)).sort((a, b) => a - b);
    
    let nextId = 1;
    while (existingIds.includes(nextId) || usedIds.has(nextId)) {
        nextId++;
    }
    
    console.log('Prochain ID généré:', nextId);
    return nextId.toString();
}

// Configuration de Multer
const fileUpload = multer({
    storage: multer.diskStorage({
        destination: (req, file, cb) => cb(null, path.join(__dirname, 'uploads')),
        filename: (req, file, cb) => cb(null, file.originalname)
    }),
    fileFilter: (req, file, cb) => {
        const allowedExt = ['.csv', '.xlsx'];
        const fileExt = path.extname(file.originalname).toLowerCase();
        const fileName = file.originalname.toLowerCase();

        if (req.body.typeImport === 'import_utilisateurs') {
            if (!['import_utilisateurs.csv', 'import_utilisateurs.xlsx'].includes(fileName)) {
                return cb(new Error('Le fichier doit être nommé import_utilisateurs.csv ou import_utilisateurs.xlsx pour importer des utilisateurs.'));
            }
        } else if (req.body.typeImport === 'ajouter_utilisateurs_evenement') {
            if (!['ajouter_utilisateurs_evenement.csv', 'ajouter_utilisateurs_evenement.xlsx'].includes(fileName)) {
                return cb(new Error('Le fichier doit être nommé ajouter_utilisateurs_evenement.csv ou ajouter_utilisateurs_evenement.xlsx pour ajouter des utilisateurs à un événement.'));
            }
        } else if (req.body.typeImport === 'ajouter_utilisateurs_organisation') { // Ajout ici
            if (!['ajouter_utilisateurs_organisation.csv', 'ajouter_utilisateurs_organisation.xlsx'].includes(fileName)) {
                return cb(new Error('Le fichier doit être nommé ajouter_utilisateurs_organisation.csv ou ajouter_utilisateurs_organisation.xlsx pour rattacher des utilisateurs à une organisation.'));
            }
        }

        if (!allowedExt.includes(fileExt)) {
            return cb(new Error('Le fichier doit être au format CSV ou XLSX.'));
        }

        cb(null, true);
    }
}).single('fileImport');


// Route /import
// Route /import
app.post('/import', ensureAuthenticated, fileUpload, async (req, res) => {
    const cultureImport = req.body.cultureImport || 'Inconnu';
    const importDetails = { imported: [], failed: [] };
    const usedIds = new Set();

    try {
        if (!req.file) {
            return res.status(400).json({ error: 'Aucun fichier n\'a été uploadé.' });
        }

        const file = req.file;
        const typeImport = req.body.typeImport;
        const superAdmin = req.session.superAdmin || 'Inconnu';
        const importDate = new Date().toISOString();
        let result = 'Succès';
        let logMessage = '';

        console.log('SuperAdmin dans /import:', superAdmin);

        let expectedColumns, validCivility, validRoles;
        if (typeImport === 'import_utilisateurs') {
            expectedColumns = ['birthdate', 'civility', 'email', 'name', 'surname', 'role'];
            validCivility = ['M', 'Mme'];
            const rolesSnapshot = await firestore.collection('roles').get();
            validRoles = rolesSnapshot.docs.map(doc => doc.data().name);
            console.log('Rôles valides dans /import:', validRoles);
        } else if (typeImport === 'ajouter_utilisateurs_evenement') {
            expectedColumns = ['id_user', 'name', 'surname', 'email', 'id_event', 'name_event'];
        } else if (typeImport === 'ajouter_utilisateurs_organisation') { // Ajout ici
            expectedColumns = ['id_user', 'name', 'surname', 'email', 'name_organization', 'code_organization'];
        }

        let results = [];
        let fileColumns = [];
        if (file.originalname.endsWith('.csv')) {
            const separator = cultureImport === 'English (United States)' ? ',' : ';';
            console.log('Culture import:', cultureImport, 'Separator:', separator);

            const fileContent = await fsPromises.readFile(file.path, 'utf8');
            const firstLine = fileContent.split('\n')[0];
            const hasComma = firstLine.includes(',');
            const hasSemicolon = firstLine.includes(';');

            await new Promise((resolve, reject) => {
                fs.createReadStream(file.path)
                    .pipe(csv({ separator, columns: true, bom: true }))
                    .on('headers', (headers) => {
                        if (headers.length === 1 && headers[0].includes(separator)) {
                            fileColumns = headers[0].split(separator).map(header => header.trim().replace(/^\uFEFF/, ''));
                        } else {
                            fileColumns = headers.map(header => header.trim().replace(/^\uFEFF/, ''));
                        }
                        console.log('Headers from CSV:', fileColumns);
                    })
                    .on('data', (data) => {
                        const normalizedData = {};
                        for (const key in data) {
                            const cleanKey = key.replace(/^\uFEFF/, '');
                            normalizedData[cleanKey] = data[key];
                        }
                        results.push(normalizedData);
                    })
                    .on('end', resolve)
                    .on('error', reject);
            });

            const missingColumns = expectedColumns.filter(col => !fileColumns.includes(col));
            if (missingColumns.length > 0) {
                result = 'Échec';
                let userFriendlyMessage = '';
                if (cultureImport === 'English (United States)' && hasSemicolon && !hasComma) {
                    userFriendlyMessage = 'Le fichier utilise des points-virgules (;) comme séparateurs, mais vous avez sélectionné "Anglais (États-Unis)" qui attend des virgules (,). Veuillez ajuster le fichier ou choisir "Français (France)" comme culture d’importation.';
                } else if (cultureImport === 'français (France)' && hasComma && !hasSemicolon) {
                    userFriendlyMessage = 'Le fichier utilise des virgules (,) comme séparateurs, mais vous avez sélectionné "Français (France)" qui attend des points-virgules (;). Veuillez ajuster le fichier ou choisir "Anglais (États-Unis)" comme culture d’importation.';
                } else {
                    userFriendlyMessage = `Le fichier ne contient pas toutes les colonnes nécessaires : ${missingColumns.join(', ')}. Vérifiez que votre fichier respecte le format attendu avec les colonnes suivantes : ${expectedColumns.join(', ')}.`;
                }
                logMessage = `Colonnes manquantes : ${missingColumns.join(', ')}.`;
                throw new Error(userFriendlyMessage);
            }
        } else if (file.originalname.endsWith('.xlsx')) {
            const workbook = XLSX.readFile(file.path);
            const sheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[sheetName];
            results = XLSX.utils.sheet_to_json(worksheet);
            fileColumns = Object.keys(results[0] || {});
            console.log('Headers from XLSX:', fileColumns);

            const missingColumns = expectedColumns.filter(col => !fileColumns.includes(col));
            if (missingColumns.length > 0) {
                result = 'Échec';
                logMessage = `Colonnes manquantes : ${missingColumns.join(', ')}.`;
                throw new Error(`Le fichier ne contient pas toutes les colonnes nécessaires : ${missingColumns.join(', ')}. Vérifiez que votre fichier respecte le format attendu avec les colonnes suivantes : ${expectedColumns.join(', ')}.`);
            }
        } else {
            throw new Error('Format de fichier non supporté. Utilisez CSV ou XLSX.');
        }

        const uniqueColumns = new Set(fileColumns);
        if (uniqueColumns.size !== fileColumns.length) {
            const duplicates = fileColumns.filter((col, index) => fileColumns.indexOf(col) !== index);
            result = 'Échec';
            logMessage = `Colonnes supplémentaires ou dupliquées détectées : ${duplicates.join(', ')}.`;
            throw new Error(`Le fichier contient des colonnes en double ou inattendues : ${duplicates.join(', ')}. Supprimez les colonnes supplémentaires ou renommez-les pour éviter les doublons.`);
        }

        const extraColumns = fileColumns.filter(col => !expectedColumns.includes(col));
        if (extraColumns.length > 0) {
            result = 'Échec';
            logMessage = `Colonnes supplémentaires détectées : ${extraColumns.join(', ')}.`;
            throw new Error(`Le fichier contient des colonnes supplémentaires non attendues : ${extraColumns.join(', ')}. Supprimez ces colonnes ou vérifiez que le fichier correspond au format attendu : ${expectedColumns.join(', ')}.`);
        }

        if (typeImport === 'import_utilisateurs') {
            const batch = firestore.batch();
            for (const row of results) {
                try {
                    if (!validCivility.includes(row['civility'])) {
                        throw new Error(`Valeur invalide pour civility: ${row['civility']}. Valeurs attendues: ${validCivility.join(', ')}.`);
                    }
                    if (!validRoles.includes(row['role'])) {
                        throw new Error(`Valeur invalide pour role: ${row['role']}. Valeurs attendues: ${validRoles.join(', ')}.`);
                    }

                    const email = row['email'];
                    const userQuery = await firestore.collection('users').where('email', '==', email).limit(1).get();
                    let userDocRef;

                    if (userQuery.empty) {
                        const nextId = await getNextUserId(usedIds);
                        usedIds.add(parseInt(nextId));
                        const qrCode = `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${row['name']}-${row['surname']}`;
                        const createdAt = new Date().toISOString();
                        userDocRef = firestore.collection('users').doc(nextId);
                        batch.set(userDocRef, {
                            id: nextId,
                            birthdate: row['birthdate'],
                            civility: row['civility'],
                            email: row['email'],
                            name: row['name'],
                            surname: row['surname'],
                            role: row['role'],
                            qrCode,
                            createdAt
                        });
                        importDetails.imported.push({ email, status: 'Créé', details: `ID: ${nextId}, Rôle: ${row['role']}` });
                    } else {
                        userDocRef = userQuery.docs[0].ref;
                        const existingData = userQuery.docs[0].data();
                        if (existingData.birthdate !== row['birthdate'] ||
                            existingData.civility !== row['civility'] ||
                            existingData.name !== row['name'] ||
                            existingData.surname !== row['surname'] ||
                            existingData.role !== row['role']) {
                            batch.update(userDocRef, {
                                birthdate: row['birthdate'],
                                civility: row['civility'],
                                email: row['email'],
                                name: row['name'],
                                surname: row['surname'],
                                role: row['role']
                            });
                            importDetails.imported.push({ email, status: 'Mis à jour', details: `Rôle: ${row['role']}` });
                        } else {
                            importDetails.imported.push({ email, status: 'Inchangé', details: `Rôle: ${row['role']}` });
                        }
                    }
                } catch (error) {
                    importDetails.failed.push({ email: row['email'] || 'Inconnu', status: 'Échec', details: error.message });
                }
            }
            await batch.commit();
            logMessage = `Import réussi: ${importDetails.imported.length} lignes traitées, ${importDetails.failed.length} échecs`;
            if (importDetails.failed.length > 0) result = 'Partiel';
        } else if (typeImport === 'ajouter_utilisateurs_evenement') {
            const batch = firestore.batch();
            const today = new Date();

            // Vérification des événements
            const eventIds = [...new Set(results.map(row => row['id_event']))];
            for (const eventId of eventIds) {
                const eventRef = firestore.collection('events').doc(eventId);
                const eventDoc = await eventRef.get();
                if (!eventDoc.exists) {
                    throw new Error(`Événement avec ID ${eventId} n'existe pas.`);
                }
                const eventData = eventDoc.data();
                const endDate = new Date(eventData.endDate);
                if (endDate < today) {
                    return res.status(400).json({
                        success: false,
                        error: `Vous ne pouvez pas importer ce fichier car l'événement "${eventData.name}" (ID: ${eventId}) est terminé (fin: ${eventData.endDate}).`
                    });
                }
            }

            // Vérification préalable : tous les utilisateurs doivent exister
            let allUsersExist = true;
            for (const row of results) {
                const userId = row['id_user']?.toString().trim();
                if (!userId) {
                    importDetails.failed.push({
                        userId: row['id_user'] || 'Inconnu',
                        email: row['email'] || 'Inconnu',
                        eventId: row['id_event'] || 'Inconnu',
                        eventName: row['name_event'] || 'Inconnu',
                        status: 'Échec',
                        details: 'ID utilisateur invalide ou manquant.'
                    });
                    allUsersExist = false;
                    continue;
                }

                const userRef = firestore.collection('users').doc(userId);
                const userDoc = await userRef.get();
                if (!userDoc.exists) {
                    importDetails.failed.push({
                        userId: userId,
                        email: row['email'] || 'Inconnu',
                        eventId: row['id_event'] || 'Inconnu',
                        eventName: row['name_event'] || 'Inconnu',
                        status: 'Échec',
                        details: `Utilisateur avec ID ${userId} n'existe pas.`
                    });
                    allUsersExist = false;
                }
            }

            // Si aucun utilisateur n'existe ou s'il y a des erreurs, on arrête
            if (!allUsersExist) {
                result = 'Échec';
                logMessage = `Échec : Aucun utilisateur valide trouvé ou certains utilisateurs n'existent pas.`;
                throw new Error('Vous essayez de rattacher des utilisateurs qui n\'existent pas à un événement.');
            }

            // Traitement des rattachements uniquement si tous les utilisateurs existent
            for (const row of results) {
                try {
                    let userId = row['id_user'].toString().trim();
                    const email = row['email'];
                    const eventId = row['id_event'].toString().trim();
                    const eventName = row['name_event'];
                    console.log('Row data:', { userId, email, eventId, eventName });

                    if (!userId) {
                        throw new Error(`ID utilisateur invalide : ${userId}`);
                    }
                    if (!eventId) {
                        throw new Error(`ID événement invalide : ${eventId}`);
                    }

                    const userRef = firestore.collection('users').doc(userId);
                    const userDoc = await userRef.get();
                    if (!userDoc.exists) {
                        throw new Error(`Utilisateur avec ID ${userId} n'existe pas.`); // Cette erreur ne devrait pas se produire ici grâce à la vérification préalable
                    }
                    const userData = userDoc.data();
                    if (userData.email !== email) {
                        throw new Error(`L'email ${email} ne correspond pas à l'utilisateur ${userId} (email attendu : ${userData.email}).`);
                    }

                    const eventRef = firestore.collection('events').doc(eventId);
                    const eventDoc = await eventRef.get();
                    if (!eventDoc.exists) {
                        throw new Error(`Événement avec ID ${eventId} n'existe pas.`);
                    }
                    const eventData = eventDoc.data();
                    if (eventData.name !== eventName) {
                        throw new Error(`Le nom ${eventName} ne correspond pas à l'événement ${eventId} (nom attendu : ${eventData.name}).`);
                    }

                    const userEvents = userData.events || [];
                    if (!userEvents.includes(eventId)) {
                        batch.update(userRef, {
                            events: admin.firestore.FieldValue.arrayUnion(eventId)
                        });
                    }

                    const eventParticipants = eventData.participants || [];
                    if (!eventParticipants.includes(userId)) {
                        batch.update(eventRef, {
                            participants: admin.firestore.FieldValue.arrayUnion(userId)
                        });
                    }

                    const accessCode = await generateUniqueAccessCode(eventId);
                    const accessCodeRef = firestore.collection('access_codes').doc(`${eventId}_${userId}`);
                    batch.set(accessCodeRef, {
                        eventId: eventId,
                        userId: userId,
                        code: accessCode,
                        createdAt: admin.firestore.FieldValue.serverTimestamp(),
                        used: false
                    }, { merge: true });

                    importDetails.imported.push({
                        userId,
                        email,
                        eventId,
                        eventName,
                        status: 'Attaché',
                        details: `Code d'accès généré : ${accessCode}`
                    });
                } catch (error) {
                    importDetails.failed.push({
                        userId: row['id_user'] || 'Inconnu',
                        email: row['email'] || 'Inconnu',
                        eventId: row['id_event'] || 'Inconnu',
                        eventName: row['name_event'] || 'Inconnu',
                        status: 'Échec',
                        details: error.message
                    });
                }
            }

            if (importDetails.failed.length > 0) {
                result = importDetails.imported.length > 0 ? 'Partiel' : 'Échec';
                logMessage = `Échec ou partiel : ${importDetails.imported.length} lignes attachées, ${importDetails.failed.length} échecs`;
            } else {
                logMessage = `Import réussi : ${importDetails.imported.length} utilisateurs attachés à des événements`;
            }

            await batch.commit();
        } else if (typeImport === 'ajouter_utilisateurs_organisation') {
    const batch = firestore.batch();
    const importDetails = { imported: [], failed: [] }; // Réinitialisé pour être local à ce bloc
    let allUsersExist = true;

    // Étape 1 : Vérification préalable de l’existence de tous les utilisateurs
    for (const row of results) {
        const userId = row['id_user']?.toString().trim();
        if (!userId) {
            importDetails.failed.push({
                userId: row['id_user'] || 'Inconnu',
                email: row['email'] || 'Inconnu',
                orgName: row['name_organization'] || 'Inconnu',
                orgCode: row['code_organization'] || 'Inconnu',
                status: 'Échec',
                details: 'ID utilisateur invalide ou manquant.'
            });
            allUsersExist = false;
            continue;
        }

        const userRef = firestore.collection('users').doc(userId);
        const userDoc = await userRef.get();
        if (!userDoc.exists) {
            importDetails.failed.push({
                userId: userId,
                email: row['email'] || 'Inconnu',
                orgName: row['name_organization'] || 'Inconnu',
                orgCode: row['code_organization'] || 'Inconnu',
                status: 'Échec',
                details: `Utilisateur avec ID ${userId} n'existe pas.`
            });
            allUsersExist = false;
        }
    }

    // Étape 2 : Si tous les utilisateurs n’existent pas, arrêter et renvoyer une erreur
    if (!allUsersExist) {
        result = 'Échec';
        logMessage = `Échec : Certains utilisateurs n'existent pas dans la base.`;
        throw new Error('Vous essayez de rattacher des utilisateurs qui n\'existent pas à une organisation.');
    }

    // Étape 3 : Traitement des rattachements uniquement si tous les utilisateurs existent
    const orgUserMap = new Map(); // Map pour stocker les nouveaux utilisateurs par organisation
    const existingUsersByOrg = new Map();

    // Récupérer les utilisateurs existants pour chaque organisation mentionnée dans le fichier
    const orgCodes = [...new Set(results.map(row => row['code_organization']))];
    for (const orgCode of orgCodes) {
        const orgQuery = await firestore.collection('organisations').where('code', '==', orgCode).limit(1).get();
        if (!orgQuery.empty) {
            const orgId = orgQuery.docs[0].id;
            const usersSnapshot = await firestore.collection('users')
                .where('orgs', 'array-contains', orgId)
                .get();
            existingUsersByOrg.set(orgId, new Set(usersSnapshot.docs.map(doc => doc.id)));
        }
    }

    for (const row of results) {
        try {
            const userId = row['id_user'].toString().trim();
            const email = row['email'];
            const orgName = row['name_organization'];
            const orgCode = row['code_organization']?.toString().trim();

            if (!orgCode) {
                throw new Error('Code d’organisation invalide ou manquant.');
            }

            const userRef = firestore.collection('users').doc(userId);
            const userDoc = await userRef.get();
            const userData = userDoc.data();
            if (userData.email !== email) {
                throw new Error(`L'email ${email} ne correspond pas à l'utilisateur ${userId} (email attendu : ${userData.email}).`);
            }

            const orgQuery = await firestore.collection('organisations').where('code', '==', orgCode).limit(1).get();
            if (orgQuery.empty) {
                throw new Error(`Organisation avec le code ${orgCode} n'existe pas.`);
            }
            const orgDoc = orgQuery.docs[0];
            const orgData = orgDoc.data();
            const orgId = orgDoc.id;
            if (orgData.name !== orgName) {
                throw new Error(`Le nom ${orgName} ne correspond pas à l'organisation avec le code ${orgCode} (nom attendu : ${orgData.name}).`);
            }

            const userOrgs = userData.orgs || [];
            if (!userOrgs.includes(orgId)) {
                batch.update(userRef, {
                    orgs: admin.firestore.FieldValue.arrayUnion(orgId)
                });

                if (!orgUserMap.has(orgId)) {
                    orgUserMap.set(orgId, new Set());
                }
                if (!existingUsersByOrg.get(orgId)?.has(userId)) {
                    orgUserMap.get(orgId).add(userId);
                }
            }

            importDetails.imported.push({
                userId,
                email,
                orgName,
                orgCode,
                status: 'Attaché',
                details: `Rattaché à l'organisation ${orgName} (Code: ${orgCode})`
            });
        } catch (error) {
            importDetails.failed.push({
                userId: row['id_user'] || 'Inconnu',
                email: row['email'] || 'Inconnu',
                orgName: row['name_organization'] || 'Inconnu',
                orgCode: row['code_organization'] || 'Inconnu',
                status: 'Échec',
                details: error.message
            });
        }
    }

    // Mettre à jour userCount pour chaque organisation avec les nouveaux utilisateurs
    for (const [orgId, newUserSet] of orgUserMap) {
        const newUserCount = newUserSet.size;
        if (newUserCount > 0) {
            console.log(`Mise à jour de userCount pour orgId ${orgId} : +${newUserCount} nouveaux utilisateurs`);
            const orgRef = firestore.collection('organisations').doc(orgId);
            batch.update(orgRef, { userCount: admin.firestore.FieldValue.increment(newUserCount) });
        }
    }

    if (importDetails.failed.length > 0) {
        result = importDetails.imported.length > 0 ? 'Partiel' : 'Échec';
        logMessage = `Échec ou partiel : ${importDetails.imported.length} lignes attachées, ${importDetails.failed.length} échecs`;
    } else {
        logMessage = `Import réussi : ${importDetails.imported.length} utilisateurs attachés à des organisations`;
    }

    if (orgUserMap.size > 0) {
        console.log('Exécution du batch pour rattachements et mise à jour de userCount');
        await batch.commit();
    }

    // Recalculer le userCount réel pour chaque organisation affectée
    for (const orgCode of orgCodes) {
        const orgQuery = await firestore.collection('organisations').where('code', '==', orgCode).limit(1).get();
        if (!orgQuery.empty) {
            const orgId = orgQuery.docs[0].id;
            const usersSnapshot = await firestore.collection('users')
                .where('orgs', 'array-contains', orgId)
                .get();
            const realUserCount = usersSnapshot.size;
            await firestore.collection('organisations').doc(orgId).update({ userCount: realUserCount });
            console.log(`userCount synchronisé pour orgId ${orgId} : ${realUserCount}`);
        }
    }

    console.log(`Résultat final : ${logMessage}`);
}


        await firestore.collection('import_history').add({
            fileName: file.originalname,
            superAdmin,
            importDate,
            result,
            log: logMessage,
            details: importDetails,
            culture: cultureImport
        });

        await cleanUploadsDir();
        res.json({ success: true, redirect: '/import_user' });
    } catch (error) {
        console.error('Erreur importation:', error);
        await firestore.collection('import_history').add({
            fileName: req.file?.originalname || 'Inconnu',
            superAdmin: req.session.superAdmin || 'Inconnu',
            importDate: new Date().toISOString(),
            result: 'Échec',
            log: `Erreur: ${error.message}`,
            details: importDetails.failed.length > 0 ? importDetails : { imported: [], failed: [{ email: 'Inconnu', status: 'Échec', details: error.message }] },
            culture: cultureImport
        });

        await cleanUploadsDir();
        res.status(500).json({ error: error.message });
    }
});


// Routes existantes
app.get('/import_user', async (req, res) => {
    let importHistory = [];
    try {
        const filterDate = req.query.filterDate;
        const filterResult = req.query.filterResult;

        let query = firestore.collection('import_history');

        if (filterDate) {
            const startOfDay = new Date(filterDate).toISOString().split('T')[0] + 'T00:00:00.000Z';
            const endOfDay = new Date(filterDate).toISOString().split('T')[0] + 'T23:59:59.999Z';
            query = query.where('importDate', '>=', startOfDay).where('importDate', '<=', endOfDay);
        }

        if (filterResult) {
            query = query.where('result', '==', filterResult);
        }

        const historySnapshot = await query.orderBy('importDate', 'desc').get();
        historySnapshot.forEach(doc => {
            let data = doc.data();
            if (data.result) {
                if (data.result.toLowerCase() === 'echec' || data.result.toLowerCase() === 'échec') {
                    data.result = 'Échec';
                } else if (data.result.toLowerCase() === 'partiel') {
                    data.result = 'Partiel';
                } else if (data.result.toLowerCase() === 'succes' || data.result.toLowerCase() === 'succès') {
                    data.result = 'Succès';
                }
            }
            importHistory.push({ id: doc.id, ...data });
        });

        const rolesSnapshot = await firestore.collection('roles').get();
        const roles = rolesSnapshot.docs.map(doc => doc.data().name);

        const superAdmin = req.session.superAdmin || 'Inconnu';

        res.render('import_user', { 
            importHistory, 
            filterDate: filterDate || '', 
            filterResult: filterResult || '',
            roles,
            superAdmin
        });
    } catch (error) {
        console.error('Erreur lors de la récupération de l\'historique:', error);
        const superAdmin = req.session.superAdmin || 'Inconnu';
        res.render('import_user', { 
            importHistory, 
            filterDate: req.query.filterDate || '', 
            filterResult: req.query.filterResult || '',
            roles: [],
            superAdmin
        });
    }
});


app.get('/import_history/:id', async (req, res) => {
    try {
        const doc = await firestore.collection('import_history').doc(req.params.id).get();
        if (!doc.exists) {
            return res.status(404).send('Historique non trouvé');
        }
        const history = doc.data();

        // Vérifier et convertir importDate si nécessaire
        if (history.importDate && typeof history.importDate.toDate === 'function') {
            // Si c'est un Timestamp, convertir en Date
            history.importDate = history.importDate.toDate();
        } else if (!(history.importDate instanceof Date)) {
            // Si ce n'est ni un Timestamp ni une Date, tenter de le convertir
            history.importDate = new Date(history.importDate);
        }

        const rolesSnapshot = await firestore.collection('roles').get();
        const roles = rolesSnapshot.docs.map(doc => ({
            name: doc.data().name,
            voteEnabled: doc.data().voteEnabled || false
        }));

        res.render('import_history_detail', { history, roles });
    } catch (error) {
        console.error('Erreur lors de la récupération des détails:', error);
        res.status(500).send('Erreur serveur');
    }
});


// Nouvelle route pour récupérer les données d'historique en JSON
app.get('/import_user_data', async (req, res) => {
    let importHistory = [];
    try {
        const filterDate = req.query.filterDate;
        const filterResult = req.query.filterResult;

        let query = firestore.collection('import_history');

        if (filterDate) {
            const startOfDay = new Date(filterDate).toISOString().split('T')[0] + 'T00:00:00.000Z';
            const endOfDay = new Date(filterDate).toISOString().split('T')[0] + 'T23:59:59.999Z';
            query = query.where('importDate', '>=', startOfDay).where('importDate', '<=', endOfDay);
        }

        if (filterResult) {
            query = query.where('result', '==', filterResult);
        }

        const historySnapshot = await query.orderBy('importDate', 'desc').get();
        historySnapshot.forEach(doc => {
            let data = doc.data();
            if (data.result) {
                if (data.result.toLowerCase() === 'echec' || data.result.toLowerCase() === 'échec') {
                    data.result = 'Échec';
                } else if (data.result.toLowerCase() === 'partiel') {
                    data.result = 'Partiel';
                } else if (data.result.toLowerCase() === 'succes' || data.result.toLowerCase() === 'succès') {
                    data.result = 'Succès';
                }
            }
            importHistory.push({ id: doc.id, ...data });
        });

        res.json(importHistory);
    } catch (error) {
        console.error('Erreur lors de la récupération des données d’historique:', error);
        res.status(500).json([]);
    }
});




// Route pour la page stats_user
// Route pour la page stats_user
app.get('/stats_user', requireAuth, async (req, res) => {
    try {
        const usersSnapshot = await firestore.collection('users').get();
        const votesSnapshot = await firestore.collection('votes').get();

        const voteCountByUser = {};
        votesSnapshot.forEach(doc => {
            const voteData = doc.data();
            const userId = voteData.userId;
            if (userId) {
                voteCountByUser[userId] = (voteCountByUser[userId] || 0) + 1;
            }
        });

        const users = usersSnapshot.docs.map(doc => {
            const userData = doc.data();
            return {
                id: doc.id,
                ...userData,
                voteCount: voteCountByUser[doc.id] || 0
            };
        });

        res.render('stats_user', { users });
    } catch (error) {
        console.error('Erreur lors de la récupération des utilisateurs:', error);
        res.status(500).send('Erreur serveur');
    }
});



// Route API pour récupérer les statistiques d'un utilisateur
app.get('/api/user_stats', requireAuth, async (req, res) => {
    const { userId } = req.query;

    try {
        const userDoc = await firestore.collection('users').doc(userId).get();
        if (!userDoc.exists) {
            return res.status(404).json({ error: 'Utilisateur non trouvé' });
        }

        const userData = userDoc.data();
        const userEvents = userData.events || [];

        const eventsSnapshot = await firestore.collection('events').get();
        const totalEvents = eventsSnapshot.size;

        const votesSnapshot = await firestore.collection('votes').where('userId', '==', userId).get();
        const userVotes = {};
        votesSnapshot.forEach(doc => {
            const voteData = doc.data();
            userVotes[voteData.eventId] = voteData.choice;
        });

        const eventStats = await Promise.all(userEvents.map(async (eventId) => {
            const eventDoc = await firestore.collection('events').doc(eventId).get();
            if (!eventDoc.exists) {
                return { eventId, name: 'Événement supprimé', presence: false, vote: 'Non voté' };
            }

            const eventData = eventDoc.data();
            const presence = eventData.presence && eventData.presence[userId] === true;
            const vote = userVotes[eventId] || 'Non voté';

            return {
                eventId,
                name: eventData.name,
                startDate: eventData.startDate,
                endDate: eventData.endDate,
                presence,
                vote
            };
        }));

        res.json({ events: eventStats, totalEvents });
    } catch (error) {
        console.error('Erreur lors de la récupération des stats:', error);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});





// Fonction pour formater le nom (première lettre en majuscule, reste en minuscule)
function formatRoleName(name) {
    if (!name) return '';
    return name.charAt(0).toUpperCase() + name.slice(1).toLowerCase();
}

// Fonction pour initialiser les rôles par défaut (Organisateur et Membre)
async function initializeDefaultRoles() {
    try {
        // Vérifier et créer le rôle "Organisateur" (ID 1)
        const organisateurRef = firestore.collection('roles').doc('1');
        const organisateurDoc = await organisateurRef.get();
        if (!organisateurDoc.exists) {
            await organisateurRef.set({
                name: 'Organisateur',
                incrementedId: 1,
                createdAt: admin.firestore.FieldValue.serverTimestamp(),
                isProtected: true // Ajouter un champ pour indiquer que ce rôle est protégé
            });
            console.log('Rôle Organisateur (ID 1) créé avec succès');
        }

        // Vérifier et créer le rôle "Membre" (ID 2)
        const membreRef = firestore.collection('roles').doc('2');
        const membreDoc = await membreRef.get();
        if (!membreDoc.exists) {
            await membreRef.set({
                name: 'Membre',
                incrementedId: 2,
                createdAt: admin.firestore.FieldValue.serverTimestamp(),
                isProtected: true // Ajouter un champ pour indiquer que ce rôle est protégé
            });
            console.log('Rôle Membre (ID 2) créé avec succès');
        }
    } catch (error) {
        console.error('Erreur lors de l\'initialisation des rôles par défaut :', error);
    }
}

// Fonction pour obtenir le prochain ID incrémenté
async function getNextIncrementedId() {
    const rolesSnapshot = await firestore.collection('roles').orderBy('incrementedId', 'desc').limit(1).get();
    if (rolesSnapshot.empty) return 3; // Commencer à 3 car 1 et 2 sont réservés
    const lastRole = rolesSnapshot.docs[0].data();
    let nextId = lastRole.incrementedId + 1;
    // S'assurer que l'ID est supérieur ou égal à 3
    return Math.max(nextId, 3);
}

// Appeler la fonction d'initialisation au démarrage de l'application
initializeDefaultRoles();

// Route pour afficher la page de création de rôles
app.get('/create_role', async (req, res) => {
    try {
        // S'assurer que les rôles par défaut existent avant de charger la page
        await initializeDefaultRoles();

        const rolesSnapshot = await firestore.collection('roles').orderBy('incrementedId', 'asc').get();
        const roles = rolesSnapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        }));

        // Si la collection est vide (ce qui ne devrait pas arriver après initializeDefaultRoles),
        // on peut ajouter une sécurité supplémentaire
        if (roles.length === 0) {
            console.log('Aucun rôle trouvé, les rôles par défaut devraient être créés.');
        }

        res.render('create_role', { roles });
    } catch (error) {
        console.error('Erreur lors de la récupération des rôles :', error);
        res.status(500).send('Erreur serveur');
    }
});




// Route pour créer un nouveau rôle
app.post('/create_role', async (req, res) => {
    let { roleName, MobileAccessGlobal } = req.body;

    if (!roleName) {
        return res.status(400).json({ error: 'Le nom du rôle est requis' });
    }

    roleName = formatRoleName(roleName);
    MobileAccessGlobal = MobileAccessGlobal || false;

    if (roleName.toLowerCase() === 'organisateur' || roleName.toLowerCase() === 'membre') {
        return res.status(400).json({ error: 'Ce nom de rôle est réservé (Organisateur ou Membre)' });
    }

    try {
        // Vérifier si un rôle avec le même nom existe déjà (insensible à la casse)
        const rolesSnapshot = await firestore.collection('roles')
            .where('name', '==', roleName)
            .get();

        if (!rolesSnapshot.empty) {
            return res.status(400).json({ error: 'Un rôle avec ce nom existe déjà' });
        }

        const incrementedId = await getNextIncrementedId();
        await firestore.collection('roles').doc(incrementedId.toString()).set({
            name: roleName,
            incrementedId: incrementedId,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            isProtected: false,
            MobileAccessGlobal: MobileAccessGlobal
        });
        res.status(200).json({ message: 'Rôle créé avec succès' });
    } catch (error) {
        console.error('Erreur lors de la création du rôle :', error);
        res.status(500).json({ error: 'Erreur lors de la création du rôle' });
    }
});

// Route pour mettre à jour uniquement l'accès mobile
app.post('/update_role_mobile_access', async (req, res) => {
    const { roleId, MobileAccessGlobal } = req.body;

    if (!roleId) {
        return res.status(400).json({ error: 'ID du rôle requis' });
    }

    try {
        const roleDoc = await firestore.collection('roles').doc(roleId.toString()).get();
        if (!roleDoc.exists) {
            return res.status(404).json({ error: 'Rôle non trouvé' });
        }

        await firestore.collection('roles').doc(roleId.toString()).update({
            MobileAccessGlobal: MobileAccessGlobal,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        res.status(200).json({ message: 'Accès mobile mis à jour avec succès' });
    } catch (error) {
        console.error('Erreur lors de la mise à jour de l\'accès mobile :', error);
        res.status(500).json({ error: 'Erreur lors de la mise à jour de l\'accès mobile' });
    }
});

// Route pour mettre à jour un rôle
app.post('/update_role/:roleId', async (req, res) => {
    const { roleId } = req.params;
    let { roleName, MobileAccessGlobal } = req.body;

    if (!roleName) {
        return res.status(400).json({ error: 'Le nom du rôle est requis' });
    }

    roleName = formatRoleName(roleName);
    MobileAccessGlobal = MobileAccessGlobal || false;

    try {
        const roleDoc = await firestore.collection('roles').doc(roleId).get();
        if (!roleDoc.exists) {
            return res.status(404).json({ error: 'Rôle non trouvé' });
        }

        const roleData = roleDoc.data();
        if (roleData.isProtected) {
            return res.status(403).json({ error: 'Ce rôle est protégé et ne peut pas être modifié' });
        }

        await firestore.collection('roles').doc(roleId).update({
            name: roleName,
            MobileAccessGlobal: MobileAccessGlobal,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        res.status(200).json({ message: 'Rôle mis à jour avec succès' });
    } catch (error) {
        console.error('Erreur lors de la mise à jour du rôle :', error);
        res.status(500).json({ error: 'Erreur lors de la mise à jour du rôle' });
    }
});

// Route pour supprimer un rôle
app.post('/delete_role', async (req, res) => {
    const { roleId } = req.body;

    if (!roleId) {
        console.error('ID du rôle manquant dans la requête');
        return res.status(400).json({ error: 'ID du rôle requis' });
    }

    try {
        const roleIdStr = roleId.toString();
        console.log('Tentative de suppression du rôle avec ID :', roleIdStr);

        const roleDoc = await firestore.collection('roles').doc(roleIdStr).get();
        if (!roleDoc.exists) {
            console.error('Rôle non trouvé dans Firestore pour l\'ID :', roleIdStr);
            return res.status(404).json({ error: 'Rôle non trouvé' });
        }

        const roleData = roleDoc.data();
        // Vérifier si le rôle est protégé (Organisateur ou Membre)
        if (roleData.isProtected) {
            console.error('Tentative de suppression d\'un rôle protégé (ID :', roleIdStr, ')');
            return res.status(403).json({ error: 'Ce rôle est protégé et ne peut pas être supprimé' });
        }

        await firestore.collection('roles').doc(roleIdStr).delete();
        console.log('Rôle supprimé avec succès pour l\'ID :', roleIdStr);
        res.status(200).json({ message: 'Rôle supprimé avec succès' });
    } catch (error) {
        console.error('Erreur lors de la suppression du rôle :', error);
        res.status(500).json({ error: 'Erreur lors de la suppression du rôle' });
    }
});








// Route pour afficher la page de gestion des rôles et du vote
app.get('/gestion_event_role', requireAuth, async (req, res) => {
    try {
        const eventId = req.query.eventId;
        if (!eventId) {
            return res.status(400).send('ID de l\'événement requis.');
        }

        const eventSnapshot = await firestore.collection('events').doc(eventId).get();
        if (!eventSnapshot.exists) {
            return res.status(404).send('Événement non trouvé.');
        }

        const eventData = eventSnapshot.data();
        const eventName = eventData.name || 'Événement inconnu';
        const participants = eventData.participants || [];

        // Récupérer les rôles uniques des utilisateurs participants
        const userRoles = new Set();
        for (const userId of participants) {
            const userDoc = await firestore.collection('users').doc(userId).get();
            if (userDoc.exists) {
                const userRole = userDoc.data().role;
                if (userRole) userRoles.add(userRole);
            }
        }

        // Si aucun rôle n'est trouvé, retourner une liste vide
        let roles = [];
        if (userRoles.size > 0) {
            // Récupérer les rôles sans orderBy pour éviter l'index
            const rolesSnapshot = await firestore.collection('roles')
                .where('name', 'in', Array.from(userRoles))
                .get();

            // Mapper les données
            roles = rolesSnapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data(),
                voteEnabled: eventData.roleVoteSettings?.[doc.id]?.voteEnabled || false
            }));

            // Trier manuellement par incrementedId
            roles.sort((a, b) => a.incrementedId - b.incrementedId);
        }

        res.render('gestion_event_role', { eventId, eventName, roles });
    } catch (error) {
        console.error('Erreur dans /gestion_event_role :', error);
        res.status(500).send('Erreur lors de la récupération des rôles.');
    }
});

// Route pour récupérer les paramètres d'un rôle pour un événement
app.get('/get_role_settings', async (req, res) => {
    console.log('Route /get_role_settings atteinte avec eventId:', req.query.eventId, 'et roleId:', req.query.roleId);
    const { eventId, roleId } = req.query;

    if (!eventId || !roleId) {
        console.log('Erreur : ID de l\'événement ou ID du rôle manquant');
        return res.status(400).json({ error: 'ID de l\'événement et ID du rôle requis.' });
    }

    try {
        const eventRef = firestore.collection('events').doc(eventId);
        const eventDoc = await eventRef.get();

        if (!eventDoc.exists) {
            console.log('Erreur : Événement non trouvé pour eventId:', eventId);
            return res.status(404).json({ error: 'Événement non trouvé.' });
        }

        const eventData = eventDoc.data();
        const roleSettings = eventData.roleVoteSettings || {};

        console.log('Paramètres du rôle récupérés:', roleSettings[roleId]);
        res.json({
            mobileAccess: roleSettings[roleId]?.mobileAccess || false,
            voteEnabled: roleSettings[roleId]?.voteEnabled || false
        });
    } catch (error) {
        console.error('Erreur dans /get_role_settings :', error);
        res.status(500).json({ error: 'Erreur serveur.' });
    }
});

// Route pour mettre à jour les paramètres d'un rôle pour un événement
app.post('/update_role_settings', async (req, res) => {
    console.log('Route /update_role_settings atteinte avec body:', req.body);
    const { eventId, roleId, mobileAccess, voteEnabled } = req.body;

    if (!eventId || !roleId) {
        console.log('Erreur : ID de l\'événement ou ID du rôle manquant');
        return res.status(400).json({ error: 'ID de l\'événement et ID du rôle requis.' });
    }

    try {
        const eventRef = firestore.collection('events').doc(eventId);
        const eventDoc = await eventRef.get();

        if (!eventDoc.exists) {
            console.log('Erreur : Événement non trouvé pour eventId:', eventId);
            return res.status(404).json({ error: 'Événement non trouvé.' });
        }

        await eventRef.update({
            [`roleVoteSettings.${roleId}`]: {
                mobileAccess: mobileAccess,
                voteEnabled: voteEnabled
            }
        });

        console.log('Paramètres du rôle mis à jour avec succès pour roleId:', roleId);
        res.json({ success: true, message: 'Paramètres mis à jour avec succès.' });
    } catch (error) {
        console.error('Erreur dans /update_role_settings :', error);
        res.status(500).json({ error: 'Erreur serveur.' });
    }
});




// Route pour afficher la page d'exportation
app.get('/export_user', async (req, res) => {
    try {
        const filterDate = req.query.filterDate || '';
        const filterResult = req.query.filterResult || '';

        let query = firestore.collection('export_history');
        if (filterDate) {
            const startOfDay = new Date(filterDate);
            startOfDay.setHours(0, 0, 0, 0);
            const endOfDay = new Date(filterDate);
            endOfDay.setHours(23, 59, 59, 999);
            query = query.where('exportDate', '>=', startOfDay.toISOString())
                         .where('exportDate', '<=', endOfDay.toISOString());
        }
        if (filterResult) {
            query = query.where('result', '==', filterResult);
        }

        const exportHistorySnapshot = await query.orderBy('exportDate', 'desc').get();
        const exportHistory = exportHistorySnapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        }));

        res.render('export_user', {
            exportHistory,
            filterDate,
            filterResult
        });
    } catch (error) {
        console.error('Erreur lors de la récupération de l\'historique des exports :', error);
        res.status(500).send('Erreur serveur');
    }
});



// Log pour déboguer l'importation
console.log('createObjectCsvWriter est défini :', typeof createObjectCsvWriter);


app.post('/export', upload.none(), async (req, res) => {
    const { typeExport, eventId, orgCode, cultureExport, fileFormat } = req.body;
    const superAdmin = req.session.superAdmin || 'Inconnu';
    const exportDate = new Date();
    let result = 'Succès';
    let logMessage = '';
    let filePath = '';
    let fileName = '';

    try {
        console.log('Données reçues dans req.body :', req.body);

        let data = [];
        let columns = [];

        if (typeExport === 'export_utilisateurs') {
            fileName = `export_utilisateurs.${fileFormat}`;
            columns = [
                { id: 'id', title: 'id' },
                { id: 'birthdate', title: 'birthdate' },
                { id: 'civility', title: 'civility' },
                { id: 'email', title: 'email' },
                { id: 'name', title: 'name' },
                { id: 'surname', title: 'surname' },
                { id: 'role', title: 'role' }
            ];
            const usersSnapshot = await firestore.collection('users').get();
            data = usersSnapshot.docs.map(doc => {
                const userData = doc.data();
                return {
                    id: userData.id || '',
                    birthdate: userData.birthdate || '',
                    civility: userData.civility || '',
                    email: userData.email || '',
                    name: userData.name || '',
                    surname: userData.surname || '',
                    role: userData.role || ''
                };
            });
            logMessage = `Export réussi : ${data.length} utilisateurs exportés`;

        } else if (typeExport === 'export_utilisateurs_organisation') {
            if (!orgCode) {
                throw new Error('Le code de l\'organisation est requis.');
            }

            fileName = `export_utilisateurs_organisation_${orgCode}.${fileFormat}`;
            columns = [
                { id: 'id_user', title: 'id_user' },
                { id: 'name', title: 'name' },
                { id: 'surname', title: 'surname' },
                { id: 'email', title: 'email' },
                { id: 'name_organization', title: 'name_organization' },
                { id: 'code_organization', title: 'code_organization' }
            ];

            // Récupérer l'organisation par son code
            const orgsSnapshot = await firestore.collection('organisations')
                .where('code', '==', orgCode)
                .get();

            console.log(`Nombre d'organisations trouvées pour le code ${orgCode} : ${orgsSnapshot.size}`);

            if (orgsSnapshot.empty) {
                throw new Error(`Aucune organisation trouvée avec le code ${orgCode}`);
            }

            const orgDoc = orgsSnapshot.docs[0];
            const orgData = orgDoc.data();
            const orgId = orgDoc.id; // Utiliser l'ID du document Firestore

            console.log(`Organisation trouvée : ID=${orgId}, Données=`, orgData);

            // Récupérer les utilisateurs ayant cet ID d'organisation dans leur tableau 'orgs'
            const usersSnapshot = await firestore.collection('users')
                .where('orgs', 'array-contains', orgId)
                .get();

            console.log(`Nombre d'utilisateurs trouvés pour l'organisation ${orgId} : ${usersSnapshot.size}`);

            if (usersSnapshot.empty) {
                throw new Error(`Aucun utilisateur trouvé pour l'organisation avec le code ${orgCode}`);
            }

            data = usersSnapshot.docs.map(userDoc => {
                const userData = userDoc.data();
                return {
                    id_user: userDoc.id,
                    name: userData.name || '',
                    surname: userData.surname || '',
                    email: userData.email || '',
                    name_organization: orgData.name || '',
                    code_organization: orgData.code || ''
                };
            });

            logMessage = `Export réussi : ${data.length} utilisateurs exportés pour l'organisation ${orgCode}`;

        } else if (typeExport === 'exporter_utilisateurs_evenement') {
            if (!eventId) {
                throw new Error('L\'ID de l\'événement est requis.');
            }

            fileName = `exporter_utilisateurs_evenement_${eventId}.${fileFormat}`;
            columns = [
                { id: 'id_user', title: 'id_user' },
                { id: 'name', title: 'name' },
                { id: 'surname', title: 'surname' },
                { id: 'email', title: 'email' },
                { id: 'id_event', title: 'id_event' },
                { id: 'name_event', title: 'name_event' }
            ];

            const eventDoc = await firestore.collection('events').doc(eventId).get();
            console.log(`Événement ${eventId} existe : ${eventDoc.exists}`);

            if (!eventDoc.exists) {
                throw new Error(`L'événement avec l'ID ${eventId} n'existe pas.`);
            }

            const eventData = eventDoc.data();
            const participants = eventData.participants || [];

            console.log(`Nombre de participants pour l'événement ${eventId} : ${participants.length}`);

            if (!participants.length) {
                throw new Error(`Aucun participant trouvé pour l'événement ${eventId}`);
            }

            data = await Promise.all(participants.map(async (userId) => {
                const userDoc = await firestore.collection('users').doc(userId).get();
                if (userDoc.exists) {
                    const userData = userDoc.data();
                    return {
                        id_user: userId,
                        name: userData.name || '',
                        surname: userData.surname || '',
                        email: userData.email || '',
                        id_event: eventId,
                        name_event: eventData.name || ''
                    };
                } else {
                    console.log(`Utilisateur ${userId} non trouvé`);
                    return null;
                }
            }));

            data = data.filter(item => item !== null);

            if (data.length === 0) {
                throw new Error(`Aucun utilisateur valide trouvé pour l'événement ${eventId}`);
            }

            logMessage = `Export réussi : ${data.length} utilisateurs exportés pour l'événement ${eventId}`;
        } else {
            throw new Error('Type d\'export non valide.');
        }

        if (data.length === 0) {
            throw new Error('Aucune donnée à exporter.');
        }

        const tempDir = path.join(__dirname, 'temp');
        await mkdir(tempDir, { recursive: true });
        filePath = path.join(tempDir, fileName);

        if (fileFormat === 'csv') {
            const separator = cultureExport === 'English (United States)' ? ',' : ';';
            const csvWriter = createObjectCsvWriter({
                path: filePath,
                header: columns,
                fieldDelimiter: separator,
                encoding: 'utf8',
                appendBOM: true
            });
            await csvWriter.writeRecords(data);
        } else if (fileFormat === 'xlsx') {
            const worksheet = XLSX.utils.json_to_sheet(data);
            const workbook = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(workbook, worksheet, 'Export');
            XLSX.writeFile(workbook, filePath);
        } else {
            throw new Error('Format de fichier non supporté.');
        }

        await firestore.collection('export_history').add({
            fileName,
            superAdmin,
            exportDate: admin.firestore.Timestamp.fromDate(exportDate),
            result,
            log: logMessage,
            culture: cultureExport
        });

        res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
        res.sendFile(filePath, (err) => {
            if (err) {
                console.error('Erreur lors de l\'envoi du fichier:', err);
            }
            unlink(filePath).catch(err => console.error('Erreur suppression fichier:', err));
        });

    } catch (error) {
        console.error('Erreur lors de l\'exportation :', error);
        result = 'Échec';
        logMessage = `Erreur : ${error.message}`;

        await firestore.collection('export_history').add({
            fileName: fileName || 'Inconnu',
            superAdmin,
            exportDate: admin.firestore.Timestamp.fromDate(exportDate),
            result,
            log: logMessage,
            culture: cultureExport || 'Inconnue'
        });

        res.status(500).send(error.message);
    }
});


// Route pour afficher les détails d'une exportation
app.get('/export_history/:exportId', async (req, res) => {
    const { exportId } = req.params;

    try {
        const exportDoc = await firestore.collection('export_history').doc(exportId).get();
        if (!exportDoc.exists) {
            return res.status(404).send('Exportation introuvable.');
        }

        const exportData = exportDoc.data();
        exportData.id = exportDoc.id;

        res.render('export_history', { history: exportData });
    } catch (error) {
        console.error('Erreur lors de la récupération des détails de l\'exportation :', error);
        res.status(500).send('Erreur serveur.');
    }
});


// Fonction pour convertir une date (chaîne ISO ou timestamp Firestore) en objet Date
function convertToDate(dateField) {
    if (dateField instanceof admin.firestore.Timestamp) {
        return dateField.toDate();
    } else if (typeof dateField === 'string') {
        const date = new Date(dateField);
        if (!isNaN(date.getTime())) {
            return date;
        }
    }
    return null;
}

// Route pour supprimer les historiques plus anciens que 7 jours
app.get('/delete-old-logs', async (req, res) => {
    try {
        const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000); // 7 jours en millisecondes

        // Supprimer les anciennes entrées dans export_history
        const exportSnapshot = await firestore.collection('export_history').get();
        const exportBatch = firestore.batch();

        for (const doc of exportSnapshot.docs) {
            const data = doc.data();
            const exportDate = convertToDate(data.exportDate);

            if (exportDate && exportDate < sevenDaysAgo) {
                exportBatch.delete(doc.ref);
            }
        }

        await exportBatch.commit();
        const deletedExports = exportSnapshot.docs.length - exportBatch._ops.length / 2;

        // Supprimer les anciennes entrées dans import_history
        const importSnapshot = await firestore.collection('import_history').get();
        const importBatch = firestore.batch();

        for (const doc of importSnapshot.docs) {
            const data = doc.data();
            const importDate = convertToDate(data.importDate);

            if (importDate && importDate < sevenDaysAgo) {
                importBatch.delete(doc.ref);
            }
        }

        await importBatch.commit();
        const deletedImports = importSnapshot.docs.length - importBatch._ops.length / 2;

        res.status(200).json({
            message: `Suppression réussie : ${deletedExports} entrées supprimées dans export_history, ${deletedImports} entrées supprimées dans import_history`
        });
    } catch (error) {
        console.error('Erreur lors de la suppression des historiques :', error);
        res.status(500).json({ error: 'Erreur lors de la suppression des historiques' });
    }
});





app.get('/create_user_organisation', requireAuth, (req, res) => {
  res.render('create_user_organisation');
});




// Obtenir le prochain ID pour une organisation
async function getNextOrgId() {
    const snapshot = await admin.firestore().collection('organisations').orderBy('id', 'desc').limit(1).get();
    return snapshot.empty ? '1' : (parseInt(snapshot.docs[0].data().id) + 1).toString();
}

// Route pour afficher la page
app.get('/create_organisation', requireAuth, async (req, res) => {
    const snapshot = await admin.firestore().collection('organisations').get();
    const organisations = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    res.render('create_organisation', { organisations });
});


// Route pour créer une organisation
app.post('/create_organisation', requireAuth, async (req, res) => {
    const { name, code } = req.body;
    if (!name || !code) return res.status(400).json({ error: 'Nom et code requis' });

    const codeCheck = await admin.firestore().collection('organisations').where('code', '==', code).get();
    if (!codeCheck.empty) return res.status(400).json({ error: 'Code déjà utilisé' });

    const id = await getNextOrgId();
    const createdAt = new Date().toISOString();
    const orgData = { id, name, code, createdAt, userCount: 0 };

    await admin.firestore().collection('organisations').doc(id).set(orgData);
    res.json({ id, message: 'Organisation créée' });
});

// Route pour supprimer des organisations
app.post('/delete_organisations', requireAuth, async (req, res) => {
    const { orgIds } = req.body;
    const batch = admin.firestore().batch();

    for (const orgId of orgIds) {
        const orgRef = admin.firestore().collection('organisations').doc(orgId);
        batch.delete(orgRef);

        const usersSnapshot = await admin.firestore().collection('users').where('orgs', 'array-contains', orgId).get();
        usersSnapshot.forEach(doc => {
            batch.update(doc.ref, { orgs: admin.firestore.FieldValue.arrayRemove(orgId) });
        });
    }

    await batch.commit();
    res.json({ message: 'Organisations supprimées' });
});

// Route pour récupérer les utilisateurs d'une organisation
app.get('/api/getUsersByOrg/:orgId', async (req, res) => {
    const { orgId } = req.params;
    const snapshot = await admin.firestore().collection('users').where('orgs', 'array-contains', orgId).get();
    const users = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    res.json(users);
});

// Route pour récupérer tous les utilisateurs (pour le modal d'ajout)
app.get('/api/getUsers', async (req, res) => {
    const snapshot = await admin.firestore().collection('users').get();
    const users = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    res.json(users);
});



// Route pour ajouter des utilisateurs à une organisation
app.post('/add_users_to_org', requireAuth, async (req, res) => {
    const { orgId, userIds } = req.body;
    const batch = admin.firestore().batch();

    try {
        // Récupérer les utilisateurs actuels de l'organisation
        const usersSnapshot = await admin.firestore()
            .collection('users')
            .where('orgs', 'array-contains', orgId)
            .get();
        const existingUserIds = usersSnapshot.docs.map(doc => doc.id);

        // Filtrer les nouveaux utilisateurs (ceux qui ne sont pas déjà dans l'organisation)
        const newUserIds = userIds.filter(userId => !existingUserIds.includes(userId));

        // Ajouter uniquement les nouveaux utilisateurs au champ 'orgs'
        for (const userId of newUserIds) {
            const userRef = admin.firestore().collection('users').doc(userId);
            batch.update(userRef, { orgs: admin.firestore.FieldValue.arrayUnion(orgId) });
        }

        // Exécuter le batch uniquement s'il y a des modifications
        if (newUserIds.length > 0) {
            await batch.commit();

            // Mettre à jour le compteur userCount uniquement avec le nombre de nouveaux utilisateurs
            const orgRef = admin.firestore().collection('organisations').doc(orgId);
            await orgRef.update({ userCount: admin.firestore.FieldValue.increment(newUserIds.length) });
        }

        // Récupérer le nouveau userCount après mise à jour
        const orgDoc = await admin.firestore().collection('organisations').doc(orgId).get();
        const updatedUserCount = orgDoc.exists ? orgDoc.data().userCount : 0;

        res.json({
            message: newUserIds.length > 0 ? 'Utilisateurs ajoutés' : 'Aucun nouvel utilisateur ajouté',
            updatedOrgCounts: { [orgId]: updatedUserCount }
        });
    } catch (error) {
        console.error('Erreur lors de l’ajout des utilisateurs :', error);
        res.status(500).json({ error: 'Erreur interne lors de l’ajout des utilisateurs' });
    }
});

// Route pour retirer des utilisateurs d'une organisation
app.post('/remove_users_from_org', requireAuth, async (req, res) => {
    const { orgId, userIds } = req.body;

    if (!orgId || !userIds || !Array.isArray(userIds) || userIds.length === 0) {
        return res.status(400).json({ error: "orgId et une liste d'IDs d'utilisateurs sont requis." });
    }

    try {
        const batch = admin.firestore().batch();
        const updatedOrgCounts = {};

        for (const userId of userIds) {
            const userRef = admin.firestore().collection('users').doc(userId);
            const userDoc = await userRef.get();

            if (userDoc.exists && userDoc.data().orgs?.includes(orgId)) {
                batch.update(userRef, { orgs: admin.firestore.FieldValue.arrayRemove(orgId) });
            }
        }

        await batch.commit();

        // Recalculer le userCount réel
        const usersSnapshot = await admin.firestore().collection('users')
            .where('orgs', 'array-contains', orgId)
            .get();
        const newUserCount = usersSnapshot.size;
        const orgRef = admin.firestore().collection('organisations').doc(orgId);
        await orgRef.update({ userCount: newUserCount });
        updatedOrgCounts[orgId] = newUserCount;

        res.status(200).json({
            message: 'Utilisateurs retirés avec succès.',
            updatedOrgCounts
        });
    } catch (error) {
        console.error('Erreur dans /remove_users_from_org:', error);
        res.status(500).json({ error: 'Erreur interne lors du retrait des utilisateurs.' });
    }
});

// Route pour récupérer les noms des organisations par leurs IDs
app.post('/api/getOrgNames', async (req, res) => {
    const { orgIds } = req.body;

    if (!orgIds || !Array.isArray(orgIds) || orgIds.length === 0) {
        return res.status(400).json({ error: "Une liste d'IDs d'organisations est requise." });
    }

    try {
        const orgNames = {};
        const orgSnapshot = await admin.firestore().collection('organisations')
            .where(admin.firestore.FieldPath.documentId(), 'in', orgIds)
            .get();

        orgSnapshot.forEach(doc => {
            orgNames[doc.id] = doc.data().name;
        });

        res.json(orgNames);
    } catch (error) {
        console.error('Erreur lors de la récupération des noms des organisations :', error);
        res.status(500).json({ error: 'Erreur interne lors de la récupération des noms.' });
    }
});

// Route pour vérifier les organisations des utilisateurs
app.post('/api/checkUserOrgs/:orgId', async (req, res) => {
    const { orgId } = req.params;
    const { userIds } = req.body;

    if (!userIds || !Array.isArray(userIds) || userIds.length === 0) {
        return res.status(400).json({ error: "Une liste d'IDs d'utilisateurs est requise." });
    }

    try {
        const result = [];
        for (const userId of userIds) {
            const userRef = firestore.collection('users').doc(userId);
            const userDoc = await userRef.get();
            if (userDoc.exists) {
                const orgs = userDoc.data().orgs || [];
                result.push({ userId, orgs });
            } else {
                result.push({ userId, orgs: [] });
            }
        }
        res.json(result);
    } catch (error) {
        console.error('Erreur lors de la vérification des organisations des utilisateurs :', error);
        res.status(500).json({ error: 'Erreur interne lors de la vérification.' });
    }
});


// Route pour synchroniser le nombre d'utilisateurs d'une organisation
app.get('/api/syncUserCount/:orgId', async (req, res) => {
    const { orgId } = req.params;
    try {
        const usersSnapshot = await admin.firestore()
            .collection('users')
            .where('orgs', 'array-contains', orgId)
            .get();
        const realUserCount = usersSnapshot.size;

        const orgRef = admin.firestore().collection('organisations').doc(orgId);
        await orgRef.update({ userCount: realUserCount });

        res.json({ message: 'userCount synchronisé', newUserCount: realUserCount });
    } catch (error) {
        console.error('Erreur lors de la synchronisation :', error);
        res.status(500).json({ error: 'Erreur lors de la synchronisation' });
    }
});


app.post('/delete_users_from_create_org', requireAuth, async (req, res) => {
    const { orgId, userIds } = req.body;

    if (!orgId || !userIds || !Array.isArray(userIds) || userIds.length === 0) {
        return res.status(400).json({ error: "orgId et une liste d'IDs d'utilisateurs sont requis." });
    }

    try {
        const batch = admin.firestore().batch();
        const usersToDelete = [];
        const usersToKeep = [];
        const updatedOrgCounts = {};

        // Vérifier les organisations des utilisateurs
        const userOrgsSnapshot = await admin.firestore().collection('users')
            .where(admin.firestore.FieldPath.documentId(), 'in', userIds)
            .get();
        
        const userOrgs = userOrgsSnapshot.docs.map(doc => ({
            userId: doc.id,
            orgs: doc.data().orgs || []
        }));

        // Séparer les utilisateurs à supprimer (1 seule org) et ceux à conserver (plusieurs orgs)
        for (const { userId, orgs } of userOrgs) {
            if (orgs.length === 1 && orgs[0] === orgId) {
                usersToDelete.push(userId);
            } else if (orgs.includes(orgId)) {
                usersToKeep.push(userId);
            }
        }

        if (usersToDelete.length === 0 && usersToKeep.length > 0) {
            const orgIds = [...new Set(userOrgs.flatMap(u => u.orgs).filter(o => o !== orgId))];
            const orgNamesSnapshot = await admin.firestore().collection('organisations')
                .where(admin.firestore.FieldPath.documentId(), 'in', orgIds)
                .get();
            const orgNames = {};
            orgNamesSnapshot.forEach(doc => orgNames[doc.id] = doc.data().name);
            const attachedOrgs = usersToKeep.map(u => 
                userOrgs.find(uo => uo.userId === u).orgs.filter(o => o !== orgId).map(id => orgNames[id] || id).join(', ')
            ).join('; ');
            return res.status(400).json({ 
                error: `Impossible de supprimer les utilisateurs car ils sont rattachés à d'autres organisations : ${attachedOrgs}` 
            });
        }

        // Supprimer les utilisateurs (uniquement ceux avec 1 org)
        for (const userId of usersToDelete) {
            const userRef = admin.firestore().collection('users').doc(userId);
            const userDoc = await userRef.get();

            if (userDoc.exists) {
                const userData = userDoc.data();
                const userEvents = userData.events || [];

                batch.delete(userRef);

                for (const eventId of userEvents) {
                    const eventRef = admin.firestore().collection('events').doc(eventId);
                    batch.update(eventRef, {
                        participants: admin.firestore.FieldValue.arrayRemove(userId),
                        [`presence.${userId}`]: admin.firestore.FieldValue.delete()
                    });
                    const accessCodeRef = admin.firestore().collection('access_codes').doc(`${eventId}_${userId}`);
                    batch.delete(accessCodeRef);
                }
            }
        }

        // Mettre à jour l'organisation
        const orgRef = admin.firestore().collection('organisations').doc(orgId);
        const orgDoc = await orgRef.get();
        if (orgDoc.exists) {
            const currentUserCount = orgDoc.data().userCount || 0;
            const newUserCount = Math.max(0, currentUserCount - usersToDelete.length);
            batch.update(orgRef, { userCount: newUserCount });
            updatedOrgCounts[orgId] = newUserCount;
        }

        await batch.commit();

        res.status(200).json({
            message: `Utilisateurs supprimés avec succès (${usersToDelete.length} supprimés).`,
            updatedOrgCounts
        });
    } catch (error) {
        console.error('Erreur dans /delete_users_from_create_org:', error);
        res.status(500).json({ error: 'Erreur interne lors de la suppression.' });
    }
});






app.get('/event/:eventId/details', requireAuth, async (req, res) => {
    const eventId = req.params.eventId;
    try {
        const eventRef = firestore.collection('events').doc(eventId);
        const eventDoc = await eventRef.get();
        if (!eventDoc.exists) {
            return res.status(404).json({ message: 'Événement non trouvé' });
        }
        const event = eventDoc.data();
        res.json({
            endDate: event.endDate,
            status: event.status
        });
    } catch (error) {
        console.error('Erreur:', error);
        res.status(500).json({ message: 'Erreur serveur' });
    }
});


app.get('/gestion_event_invitation', requireAuth, async (req, res) => {
    const eventId = req.query.eventId;

    if (!eventId) {
        return res.status(400).send('ID de l\'événement manquant dans la requête.');
    }

    try {
        const eventRef = firestore.collection('events').doc(eventId);
        const eventDoc = await eventRef.get();

        if (!eventDoc.exists) {
            return res.status(404).send('Événement non trouvé');
        }

        const event = eventDoc.data();
        const eventName = event.name || 'Événement sans nom';
        const startDate = event.startDate || 'Non défini';
        const endDate = event.endDate || 'Non défini';
        const eventStatus = event.status || 'Inconnu';
        const eventAddress = event.address || 'Non défini';

        // Récupérer l'email de l'utilisateur connecté depuis la session
        const currentUserEmail = req.session.email;

        if (!currentUserEmail) {
            return res.status(403).send('Utilisateur non connecté ou email non trouvé dans la session.');
        }

        // Récupérer les emails des participants
        const participantIds = event.participants || [];
        const userEmails = [];
        for (const userId of participantIds) {
            const userDoc = await firestore.collection('users').doc(userId).get();
            if (userDoc.exists) {
                userEmails.push(userDoc.data().email);
            }
        }

        res.render('gestion_event_invitation', {
            eventId,
            eventName,
            startDate,
            endDate,
            eventStatus,
            eventAddress,
            currentUserEmail,
            userEmails // Passer les emails des participants à la vue
        });
    } catch (error) {
        console.error('Erreur lors de la récupération de l\'événement :', error);
        res.status(500).send('Erreur serveur lors de la récupération des données de l\'événement');
    }
});


/* invitation
const nodemailer = require('nodemailer');

app.post('/send_invitations', requireAuth, async (req, res) => {
    const { eventId, title, body, senderEmail1, emailPassword1, senderEmail2, emailPassword2, userEmails } = req.body;

    // Vérifier le premier compte (obligatoire)
    if (!senderEmail1 || !emailPassword1) {
        return res.status(400).json({ message: 'Le premier compte Gmail (email et mot de passe) est requis.' });
    }
    if (!userEmails || userEmails.length === 0) {
        return res.status(400).json({ message: 'Aucun destinataire spécifié.' });
    }

    // Vérifier si c'est le week-end
    const today = new Date();
    if (today.getDay() === 0 || today.getDay() === 6) {
        return res.status(400).json({ message: 'Pas d\'envoi le week-end.' });
    }

    // Limiter à 500 emails si un seul compte, 1000 si deux comptes
    const maxEmails = senderEmail2 && emailPassword2 ? 1000 : 500;
    if (userEmails.length > maxEmails) {
        return res.status(400).json({ message: `Limite de ${maxEmails} emails par jour dépassée (${senderEmail2 ? '1000 avec 2 comptes' : '500 avec 1 compte'}).` });
    }

    try {
        // Configurer le premier transporteur Gmail (obligatoire)
        const transporter1 = nodemailer.createTransport({
            host: 'smtp.gmail.com',
            port: 587,
            secure: false,
            auth: {
                user: senderEmail1,
                pass: emailPassword1
            },
            tls: { rejectUnauthorized: false }
        });

        // Configurer le deuxième transporteur Gmail (facultatif)
        let transporter2 = null;
        if (senderEmail2 && emailPassword2) {
            transporter2 = nodemailer.createTransport({
                host: 'smtp.gmail.com',
                port: 587,
                secure: false,
                auth: {
                    user: senderEmail2,
                    pass: emailPassword2
                },
                tls: { rejectUnauthorized: false }
            });
        }

        // Diviser les destinataires si deux comptes, sinon utiliser un seul
        let emails1 = userEmails;
        let emails2 = [];
        if (transporter2) {
            const half = Math.ceil(userEmails.length / 2);
            emails1 = userEmails.slice(0, half); // Première moitié
            emails2 = userEmails.slice(half);    // Seconde moitié
        }

        const mailOptions1 = {
            from: senderEmail1,
            to: emails1.join(','),
            subject: title,
            text: body
        };

        const mailOptions2 = transporter2 ? {
            from: senderEmail2,
            to: emails2.join(','),
            subject: title,
            text: body
        } : null;

        // Envoyer les emails
        const sendPromises = [transporter1.sendMail(mailOptions1)];
        if (transporter2 && mailOptions2) {
            sendPromises.push(transporter2.sendMail(mailOptions2));
        }

        await Promise.all(sendPromises);

        console.log(`Emails envoyés à : ${userEmails.join(', ')}`);
        console.log(`Titre : ${title}`);
        console.log(`Corps : ${body}`);
        console.log(`Expéditeurs : ${senderEmail1}${transporter2 ? ', ' + senderEmail2 : ''}`);

        res.status(200).json({ message: 'Invitations envoyées avec succès.' });
    } catch (error) {
        console.error('Erreur lors de l\'envoi des invitations :', error);
        res.status(500).json({ message: 'Erreur serveur lors de l\'envoi des invitations : ' + error.message });
    }
});
*/



app.use(router);



// Lancer le serveur sur le port 3000
app.listen(port, () => {
    console.log(`Serveur lancé sur le port ${port}`);
});