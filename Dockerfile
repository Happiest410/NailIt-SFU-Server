FROM node:20-bullseye

# Install mediasoup build dependencies
RUN apt-get update && apt-get install -y \
    python3 \
    python3-pip \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy package files first for better Docker layer caching
COPY package*.json ./
COPY prisma ./prisma/

# Install ALL dependencies (including devDependencies for tsx)
RUN npm install --production=false

# Generate Prisma client
RUN npx prisma generate

# Copy source code
COPY . .

# Expose HTTP port and Mediasoup UDP port range
EXPOSE 8080
EXPOSE 40000-40019/udp

CMD ["npx", "tsx", "src/index.ts"]
