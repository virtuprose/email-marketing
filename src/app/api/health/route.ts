import { NextResponse } from "next/server";
import { Redis } from "ioredis";
import { prisma } from "@/lib/prisma";
import { redisConnection } from "@/lib/queue";

export async function GET() {
  const startedAt = Date.now();
  const redis = new Redis(redisConnection());

  try {
    const [dbResult, redisResult] = await Promise.all([
      prisma.$queryRaw<Array<{ ok: number }>>`select 1 as ok`,
      redis.ping()
    ]);

    return NextResponse.json({
      ok: dbResult[0]?.ok === 1 && redisResult === "PONG",
      database: dbResult[0]?.ok === 1 ? "ok" : "error",
      redis: redisResult === "PONG" ? "ok" : "error",
      latencyMs: Date.now() - startedAt
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Unknown health check failure"
      },
      { status: 503 }
    );
  } finally {
    await redis.quit();
  }
}
