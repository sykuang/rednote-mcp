FROM mcr.microsoft.com/playwright:v1.49.0-jammy

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install --omit=dev

COPY tsconfig.json ./
COPY src ./src
RUN npm install typescript --no-save && npx tsc

ENV NODE_ENV=production
EXPOSE 18060

CMD ["node", "dist/main.js", "--port", ":18060"]
