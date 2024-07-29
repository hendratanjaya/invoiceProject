FROM  node:16-alpine
WORKDIR /app

COPY package*.json server.js ./

RUN npm install
COPY . .

# EXPOSE 3000
CMD ["npm", "start"]