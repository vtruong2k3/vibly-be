const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const updated = await prisma.user.updateMany({
    where: { emailVerifiedAt: null },
    data: { emailVerifiedAt: new Date() }
  });
  console.log(`Updated ${updated.count} users!`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
