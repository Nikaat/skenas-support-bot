# FROM node:20-alpine
 FROM registry.hamdocker.ir/nikaatcorp/skenas-support-bot:91408ad6-76d700

WORKDIR /app

COPY . .

# RUN npm install

RUN npx tsc

EXPOSE 8090
ENV PORT=8090
CMD ["npm", "run", "start"]