FROM node:20-alpine

WORKDIR /app

COPY . .

RUN npm install

RUN npx tsc

EXPOSE 8090
ENV PORT=8090
CMD ["npm", "run", "start"]