import { MeetingSlotStatus, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export const DEFAULT_MEETING_AVAILABILITY = {
  timezone: "Asia/Kuwait",
  weeks: 8,
  durationMinutes: 30,
  weekdayStartMinutes: 10 * 60,
  weekdayEndMinutes: 18 * 60,
  saturdayStartMinutes: 12 * 60 + 30,
  saturdayEndMinutes: 20 * 60
} as const;

type GenerateAvailabilityInput = {
  weeks?: number;
  now?: Date;
  tx?: Prisma.TransactionClient | typeof prisma;
};

export type GeneratedMeetingAvailability = {
  created: number;
  skipped: number;
  considered: number;
  fromDate: string;
  throughDate: string;
  timezone: string;
};

export async function generateDefaultMeetingAvailability({
  weeks = DEFAULT_MEETING_AVAILABILITY.weeks,
  now = new Date(),
  tx = prisma
}: GenerateAvailabilityInput = {}): Promise<GeneratedMeetingAvailability> {
  const boundedWeeks = Math.min(26, Math.max(1, Math.round(weeks)));
  const kuwaitToday = kuwaitDateKey(now);
  const startDate = localDateAnchor(kuwaitToday);
  const totalDays = boundedWeeks * 7;
  const starts = buildDefaultSlotStarts(startDate, totalDays, now);

  if (!starts.length) {
    return {
      created: 0,
      skipped: 0,
      considered: 0,
      fromDate: kuwaitToday,
      throughDate: kuwaitToday,
      timezone: DEFAULT_MEETING_AVAILABILITY.timezone
    };
  }

  const existingSlots = await tx.meetingSlot.findMany({
    where: { startAt: { in: starts } },
    select: { startAt: true }
  });
  const existingStartTimes = new Set(existingSlots.map((slot) => slot.startAt.getTime()));
  const createData = starts
    .filter((startAt) => !existingStartTimes.has(startAt.getTime()))
    .map((startAt) => ({
      startAt,
      endAt: new Date(startAt.getTime() + DEFAULT_MEETING_AVAILABILITY.durationMinutes * 60_000),
      timezone: DEFAULT_MEETING_AVAILABILITY.timezone,
      status: MeetingSlotStatus.AVAILABLE,
      notes: "Generated weekly availability"
    }));

  if (createData.length) {
    await tx.meetingSlot.createMany({ data: createData });
  }

  const throughDate = dateKeyFromAnchor(addDays(startDate, totalDays - 1));
  const result = {
    created: createData.length,
    skipped: starts.length - createData.length,
    considered: starts.length,
    fromDate: kuwaitToday,
    throughDate,
    timezone: DEFAULT_MEETING_AVAILABILITY.timezone
  };

  await tx.auditLog.create({
    data: {
      action: "meeting_slots.availability_generated",
      entityType: "meeting_slot",
      metadata: {
        ...result,
        weeks: boundedWeeks,
        durationMinutes: DEFAULT_MEETING_AVAILABILITY.durationMinutes,
        schedule: "Sun-Thu 10:00-18:00, Sat 12:30-20:00, Fri off"
      }
    }
  });

  return result;
}

function buildDefaultSlotStarts(startDate: Date, totalDays: number, now: Date) {
  const starts: Date[] = [];
  for (let dayOffset = 0; dayOffset < totalDays; dayOffset += 1) {
    const date = addDays(startDate, dayOffset);
    const day = date.getUTCDay();
    if (day === 5) continue;

    const startMinutes =
      day === 6
        ? DEFAULT_MEETING_AVAILABILITY.saturdayStartMinutes
        : DEFAULT_MEETING_AVAILABILITY.weekdayStartMinutes;
    const endMinutes =
      day === 6
        ? DEFAULT_MEETING_AVAILABILITY.saturdayEndMinutes
        : DEFAULT_MEETING_AVAILABILITY.weekdayEndMinutes;

    for (
      let minutes = startMinutes;
      minutes + DEFAULT_MEETING_AVAILABILITY.durationMinutes <= endMinutes;
      minutes += DEFAULT_MEETING_AVAILABILITY.durationMinutes
    ) {
      const startAt = kuwaitSlotDate(date, minutes);
      if (startAt.getTime() > now.getTime()) starts.push(startAt);
    }
  }
  return starts;
}

function kuwaitDateKey(date: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: DEFAULT_MEETING_AVAILABILITY.timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(date);
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;
  if (!year || !month || !day) throw new Error("Could not calculate Kuwait calendar date.");
  return `${year}-${month}-${day}`;
}

function localDateAnchor(dateKey: string) {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function dateKeyFromAnchor(date: Date) {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function kuwaitSlotDate(date: Date, minutes: number) {
  const hour = String(Math.floor(minutes / 60)).padStart(2, "0");
  const minute = String(minutes % 60).padStart(2, "0");
  return new Date(`${dateKeyFromAnchor(date)}T${hour}:${minute}:00+03:00`);
}
