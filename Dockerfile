# Use Node.js base image
FROM node:18-slim

# Install system dependencies (Python and C/C++ compilers)
RUN apt-get update && apt-get install -y \
    python3 \
    gcc \
    g++ \
    openjdk-17-jdk-headless \
    && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy application code
COPY . .

# Expose the application port
EXPOSE 3000

# Start the application
CMD ["npm", "start"]
