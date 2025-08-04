# Use Node base image
FROM node:18

# Create app directory
WORKDIR /usr/src/app

# Install dependencies
COPY package*.json ./
RUN npm install

# Copy source
COPY . .

# Expose the port to access via localhost
EXPOSE 3000

# Run migrations on container start, then start app
CMD ["sh", "-c", "node index.js && npm start"]
