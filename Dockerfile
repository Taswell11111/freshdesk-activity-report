# 1. Use Node image
FROM node:20

# 2. Set working directory
WORKDIR /app

# 3. Copy package files and install
COPY package*.json ./
RUN npm install

# 4. Copy the rest of your code (the flat structure)
COPY . .

# 5. BUILD the frontend (This fixes the index.tsx 404)
RUN npm run build

# 6. Set the Port for Cloud Run
ENV PORT=8080
EXPOSE 8080

# 7. Start the server
CMD ["node", "server.js"]