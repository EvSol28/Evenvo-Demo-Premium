# Instructions pour résoudre l'erreur d'authentification Firebase

## Problème
L'erreur `16 UNAUTHENTICATED` indique que les clés du service account sont expirées ou révoquées.

## Solution

### 1. Générer une nouvelle clé de service account

1. Allez sur https://console.firebase.google.com/
2. Sélectionnez le projet `evenvo-ba568`
3. Cliquez sur l'icône engrenage → **Paramètres du projet**
4. Onglet **"Comptes de service"**
5. Cliquez sur **"Générer une nouvelle clé privée"**
6. Téléchargez le fichier JSON

### 2. Remplacer les fichiers

1. **Remplacez** `evenvo-ba568-firebase-adminsdk-fbsvc-a2d63101fe.json` par le nouveau fichier
2. **Mettez à jour** le fichier `.env` avec les nouvelles valeurs du JSON
3. **Mettez à jour** les variables d'environnement sur Render

### 3. Mettre à jour .env

Copiez les valeurs du nouveau fichier JSON dans `.env` :

```
NODE_ENV=development
FIREBASE_PROJECT_ID=[project_id du nouveau JSON]
FIREBASE_PRIVATE_KEY_ID=[private_key_id du nouveau JSON]
FIREBASE_CLIENT_EMAIL=[client_email du nouveau JSON]
FIREBASE_CLIENT_ID=[client_id du nouveau JSON]
FIREBASE_CLIENT_X509_CERT_URL=[client_x509_cert_url du nouveau JSON]
FIREBASE_DATABASE_URL=https://evenvo-ba568.firebaseio.com
FIREBASE_PRIVATE_KEY="[private_key du nouveau JSON - avec \n pour les retours à la ligne]"
```

### 4. Mettre à jour Render

Mettez à jour toutes les variables d'environnement sur Render avec les nouvelles valeurs.

### 5. Test

Redémarrez l'application. L'erreur d'authentification devrait disparaître.