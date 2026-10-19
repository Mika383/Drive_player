import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";
import { databaseUrl } from "./config";

const globalDb = globalThis as unknown as { drivePlayerDb?: PrismaClient };

export const db = globalDb.drivePlayerDb ?? new PrismaClient({
  adapter: new PrismaPg({ connectionString: databaseUrl() }),
});

if (process.env.NODE_ENV !== "production") globalDb.drivePlayerDb = db;
