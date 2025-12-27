# Configuration Firebase sur Render

## Étapes pour configurer les variables d'environnement sur Render

1. **Aller dans votre dashboard Render**
2. **Sélectionner votre service web**
3. **Aller dans l'onglet "Environment"**
4. **Ajouter les variables suivantes :**

### Variables d'environnement requises (NOUVELLES VALEURS) :

```
NODE_ENV=production
FIREBASE_PROJECT_ID=evenvo-ba568
FIREBASE_PRIVATE_KEY_ID=0f2a90b30b58301a03614bc7d34ce9f230644cd2
FIREBASE_CLIENT_EMAIL=firebase-adminsdk-fbsvc@evenvo-ba568.iam.gserviceaccount.com
FIREBASE_CLIENT_ID=111723515748057305586
FIREBASE_CLIENT_X509_CERT_URL=https://www.googleapis.com/robot/v1/metadata/x509/firebase-adminsdk-fbsvc%40evenvo-ba568.iam.gserviceaccount.com
FIREBASE_DATABASE_URL=https://evenvo-ba568.firebaseio.com
```

### Variable FIREBASE_PRIVATE_KEY (NOUVELLE CLÉ) :

```
-----BEGIN PRIVATE KEY-----
MIIEvwIBADANBgkqhkiG9w0BAQEFAASCBKkwggSlAgEAAoIBAQDBLhQTlfRB47J4
Tb+zs/Zdu4EkIsy/mBon8oeu4HALSFIIpqK5nY4Z8P747YYZnI2XpwgEnx/x1TqU
zxrWH+paKZb0pXHqV8l8b9+KP5FbCFLGRay19K3hYz/wEBYYv1AF+O8bzcgkFIrQ
y87peyajlA0jNkmayWtcyG4/8a+Xz4nQzoRMfxqeUVit8nUj9AgBDfdMc+qh4GFk
Dr1fIHOaM/ri5Yu/ry3kYMF9EAYfvhRzjxoFYCHgYq1DCWKuQoBNAOPa0Ah8QT7u
zU0SPt0PnNLmKy8Il2yHAqcdV/XElWUzfXmc3/QqISQARm909tBCGzT2t/eDNgYy
GiPOkdi3AgMBAAECggEAUcDFYFCKsUPCaKVGpq9XaO2MRpWvnrmpABTklP6IjE3L
4btbjEAAPjw+O2yR3s7hITff7czFwRtjEkzfZ5TUIdoN93T405rZOx9BNAmY4zSP
izc7Uzm8SHEvQtIb99cm75Ac6OBafeJvqNNHuomSnZFvSeKUnbv2AqsT9V272PuQ
W/QJnGQr97glFs8cVdvOqUb8ZXyATCnYFFytdPT7kwHM9aG1l+zFbW73UVFVzQ3s
RCCgtqi3S9UQyJtTKGpNyj9b79df+XjGP3WakfLSEF4lu3ZGJw8RbGoXd4n0oekh
vk2wkzV3AR809xDR53xtA0nrKgvMVHH850TOpbyhyQKBgQDl5OG8fDkZCYdpLvKx
RZWkkj5E9RsrT1oARurDi8X0D4wsJ1SNQnMcGoNxlfSea4THhg1VEXak3Kg4TDB9
c3OcpPa/UvCET44tJlT7bNsT2b+Bki+bpqYTDTHy+CCmkWRAk+a9GP/qe2icbHfb
hR16djDnIa3P4WWIs/grm5UwgwKBgQDXHeciuitKZj1jie0CCyu8x9JP0qBZHon+
z2WMixFQ8DioWXYkLfZSnqLCCCBxlgG0NqEwwlBskguyD+NIFnSPfX8F8KIXRyfV
kn452s0qzxfmo72uc6Tv9fdS8gV5TzeSCydbRDuB3RwkKlqN6n4NjeXoATmc9IFF
9hwU2EBYvQKBgQDIeF+0mmq7/4g6W7s8hJ5qZTCxtz9a9BZamXzMyozzN7+XHTDp
AaIZRrGKkiY/IyklSCtGHDVmrBhxB1ddfhi550xYKH4eErW7f2qp2RHtbHtIBO9I
/vhhMqd05ZSrS6uteIvEKBG6KqVdimS2Y40CJiCc3MyRs05z9+QYOtLM+wKBgQC/
+DKNXiBF68l669ozSa7FcHkxvOBVx5gUahbQfkZ8uXOGYRe6H75DasgKaeAyHVD1
9w6QCchlq0t+owkMCuYIK1FRBrZQGbLluC6nCKixPFCzBYq/hPo7HoCRZ+QUpuoL
jaKYouKL+LslVxqqrQnCpM/35Cf69oPq4D+dJoL97QKBgQCeDuJ1L1QI9+S9a4ml
87DtgXqUEObt0e9uxeRHEp4EAUidNNVr7oyRnOX6TaucXLRDiMHtylGJWJvOPLHm
ceYTJ7IjZG1TmgCUStYWgfAw8wnnQ2/9nBPR6sUBTM+YUBaGuSX5xVYrDScjCD1X
DwNZc8+VimNtGVHkmcIaijg3AA==
-----END PRIVATE KEY-----
```

## Important :
- ✅ **PROBLÈME RÉSOLU** : La nouvelle clé Firebase fonctionne correctement
- Après avoir ajouté ces variables, redéployez votre service
- Les variables d'environnement sont plus sécurisées que les fichiers de configuration

## Test :
✅ L'application fonctionne maintenant sans erreur d'authentification Firebase.