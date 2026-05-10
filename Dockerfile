FROM mcr.microsoft.com/playwright:v1.49.0-jammy AS builder

WORKDIR /app
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1

COPY package.json package-lock.json* ./
RUN npm ci --ignore-scripts

COPY tsconfig.json ./
COPY src ./src
RUN npx tsc

FROM mcr.microsoft.com/playwright:v1.49.0-jammy

WORKDIR /app
ENV NODE_ENV=production
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1

COPY package.json package-lock.json* ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force

COPY --from=builder /app/dist ./dist

EXPOSE 18060
CMD ["node", "dist/main.js", "--port", ":18060"]
