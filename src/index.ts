import { createServer } from 'http';
import { createApp } from './app';
import { createSocketServer } from './realtime/socketServer';
import { prisma } from './lib/prisma';
import { env } from './config/env';

async function main() {
  await prisma.$connect();

  const app = createApp();
  const httpServer = createServer(app);
  createSocketServer(httpServer);

  httpServer.listen(env.port, () => {
    console.log(`cuemaster-api listening on :${env.port} (REST + Socket.IO)`);
  });

  const shutdown = async (signal: string) => {
    console.log(`${signal} received, shutting down...`);
    httpServer.close();
    await prisma.$disconnect();
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

main().catch((err) => {
  console.error('Fatal error starting cuemaster-api:', err);
  process.exit(1);
});
