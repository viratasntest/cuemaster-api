/* eslint-disable no-console */
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

/** Seeds match types + two demo player accounts, mirroring
 * cuemaster-ui/src/services/mock/seedData.ts so the app has real reference
 * data and opponents to find on a fresh backend. Safe to re-run — it only
 * inserts what's missing. Log in as a demo account with password `demo1234`. */

const prisma = new PrismaClient();

const MATCH_TYPES = [
  {
    id: 'standard-snooker',
    name: 'Standard Snooker',
    description: 'Full 15-red frame(s), best of 3.',
    redBallCount: 15,
    framesToWin: 2,
    isSolo: false,
  },
  {
    id: '6-red-snooker',
    name: '6-Red Snooker',
    description: 'Faster variant with 6 reds, best of 3 — great for a quick session.',
    redBallCount: 6,
    framesToWin: 2,
    isSolo: false,
  },
  {
    id: 'practice-solo',
    name: 'Practice (Solo)',
    description: 'Build breaks on your own — no opponent or invite needed.',
    redBallCount: 15,
    framesToWin: 1,
    isSolo: true,
  },
];

const DEMO_PLAYERS = [
  {
    email: 'ronnie@demo.cuemaster.app',
    username: 'ronnie_rocket',
    displayName: 'Ronnie',
    bio: 'Potting reds since forever. Fancy a frame?',
  },
  {
    email: 'judd@demo.cuemaster.app',
    username: 'judd_t',
    displayName: 'Judd',
    bio: 'Break-building specialist.',
  },
];

const DEMO_PASSWORD = 'demo1234';

async function main() {
  for (const { id, ...fields } of MATCH_TYPES) {
    await prisma.matchType.upsert({
      where: { id },
      create: { id, ...fields },
      update: fields,
    });
  }
  console.log(`Seeded ${MATCH_TYPES.length} match types.`);

  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 12);
  for (const player of DEMO_PLAYERS) {
    const existing = await prisma.user.findUnique({ where: { email: player.email } });
    if (existing) continue;
    await prisma.user.create({
      data: { role: 'player', passwordHash, ...player },
    });
  }
  console.log(`Seeded demo players (password: ${DEMO_PASSWORD}).`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
