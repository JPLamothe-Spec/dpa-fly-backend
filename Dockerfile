# Use official Node.js LTS image
FROM node:18

# Create app directory
WORKDIR /app

# Copy package.json and install deps
COPY package*.json ./
RUN npm install

# Copy remaining source
COPY . .

# Expose port (matches fly.toml PORT)
EXPOSE 3000

# Start the server
CMD ["node", "index.js"]
