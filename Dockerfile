FROM node:18-slim

# Install ffmpeg for prism-media
RUN apt-get update && apt-get install -y ffmpeg

WORKDIR /app
COPY . .
RUN npm install

EXPOSE 3000
CMD ["node", "index.js"]
