# Use Node.js base image
FROM node:18-slim

# Install system dependencies (Python, C/C++ compilers, and headless Java)
RUN apt-get update && apt-get install --no-install-recommends -y \
    python3 \
    gcc \
    g++ \
    openjdk-17-jdk-headless \
    && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install production dependencies
RUN npm install

# Copy application code
COPY . .

# Expose the application port
EXPOSE 3000

# Start the application with a safe memory heap allocation for 512MB containers
CMD ["node", "--max-old-space-size=350", "app.js"]
