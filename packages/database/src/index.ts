// Only this facade exposes generated query/types to the application.
export * from './generated/prisma/client.js';
export { PrismaClient, createDatabaseClient } from './client.js';
export type { DatabaseClientOptions } from './client.js';
import { Prisma } from './generated/prisma/client.js';
export const Decimal = Prisma.Decimal;
export type Decimal = Prisma.Decimal;
