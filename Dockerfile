# Utilise une image Node.js officielle
FROM node:22.14.0

# Installe les dépendances système pour canvas
RUN apt-get update && apt-get install -y \
    build-essential \
    libcairo2-dev \
    libpango1.0-dev \
    libjpeg-dev \
    libgif-dev \
    librsvg2-dev \
    pkg-config \
    python3 \
    && rm -rf /var/lib/apt/lists/*

# Définit le répertoire de travail
WORKDIR /app

# Copie package.json et package-lock.json
COPY package*.json ./

# Installe les dépendances
RUN npm install

# Copie le reste du code
COPY . .

# Expose le port (remplace 4000 par le port de ton app si différent)
EXPOSE 4000

# Commande pour démarrer l’app
CMD ["node", "server.js"]
