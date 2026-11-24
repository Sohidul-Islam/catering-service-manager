import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";

export interface LogActivityParams {
  actorId?: string | null;
  targetUserId?: string | null;
  action: string;
  entityType: string;
  entityId: string;
  date?: string | null;
  previousValue?: string | null;
  newValue?: string | null;
  reason?: string | null;
  tx?: Prisma.TransactionClient;
}

export async function logActivity(params: LogActivityParams) {
  const client = params.tx ?? prisma;
  return client.activityLog.create({
    data: {
      actorId: params.actorId ?? null,
      targetUserId: params.targetUserId ?? null,
      action: params.action,
      entityType: params.entityType,
      entityId: params.entityId,
      date: params.date ?? null,
      previousValue: params.previousValue ?? null,
      newValue: params.newValue ?? null,
      reason: params.reason ?? null,
    },
  });
}
