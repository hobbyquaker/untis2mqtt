FROM node:22-alpine

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY index.js config.js ./
COPY lib/ ./lib/

ENV NODE_ENV=production \
    UNTIS2MQTT_MQTT_URL=mqtt://localhost \
    UNTIS2MQTT_NAME=untis \
    UNTIS2MQTT_VERBOSITY=info

USER node

ENTRYPOINT ["node", "index.js"]
