# Stage 1: Build the React frontend
# Use a Node.js image as a builder
FROM node:18-alpine AS builder

# Set the working directory
WORKDIR /app

# Copy package.json and package-lock.json to leverage Docker cache
COPY package*.json ./

# Install all dependencies (including devDependencies for building)
RUN npm install

# Copy the rest of the application source code
COPY . .

# Build the React application for production
# This command should match the build script in your package.json
RUN npm run build


# Stage 2: Setup the production server
# Use a lightweight Node.js image for the final container
FROM node:18-alpine

WORKDIR /app

# Copy only the necessary package files for production
COPY package*.json ./

# Install only production dependencies
RUN npm install --production

# Copy the server file
COPY server.js .

# Copy the built React app from the 'builder' stage
# This assumes your build output is in a 'dist' folder. 
# If it's 'build', change 'dist' to 'build' below.
COPY --from=builder /app/dist ./dist

# Expose the port the server will run on. Cloud Run provides this via the PORT env var.
EXPOSE 8080

# The command to start the server
CMD [ "node", "server.js" ]