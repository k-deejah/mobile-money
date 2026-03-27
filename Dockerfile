FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY . .
RUN npm run build

# Copy and set permissions on entrypoint script
COPY docker-entrypoint.sh /usr/local/bin/
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

EXPOSE 3000

# Support running migrations via entrypoint
ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["npm", "start"]
