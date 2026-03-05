FROM node:20-alpine

# Establecer el directorio de trabajo
WORKDIR /app

# Copiar configuración de dependencias
COPY package*.json ./

# Instalar dependencias
RUN npm install

# Copiar el resto del código
COPY . .

# Exponer el puerto del servidor web (7000 por defecto en server.js)
EXPOSE 7000

# Iniciar ambos procesos: backend-pong en segundo plano y server.js en primer plano
CMD node backend-pong.js & node server.js
