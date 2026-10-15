FROM node:22-alpine
WORKDIR /app
COPY package.json tsconfig.json tsconfig.admin.json ./
RUN npm install
COPY src ./src
COPY public ./public
RUN npm run build
ENV NODE_ENV=production
EXPOSE 8080
CMD ["npm", "run", "start"]
