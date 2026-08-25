FROM node:lts-alpine

RUN addgroup -S -g 1880 appuser && adduser -S -u 1880 -G appuser appuser

WORKDIR /app

COPY server.js .
COPY stage2.html stage2-language.js design-tokens.css index.html ./
COPY model/ ./model/
COPY interviewer/ ./interviewer/

RUN mkdir -p /app/data && chown -R appuser:appuser /app

USER appuser

ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://localhost:3000/health').then(r => r.ok ? undefined : process.exit(1)).catch(() => process.exit(1))"

CMD ["node", "server.js"]
