import type { EmergencyContact } from "@prisma/client";
import type { EmergencyContactDto } from "@/lib/types";
import { cacheDel, cacheGet, cacheSet } from "./cache";
import { prisma } from "./db";
import { ApiError, isUniqueConstraintError } from "./errors";

const CONTACTS_CACHE_TTL_SECONDS = 30;
export const MAX_CONTACTS = 5;

function toContactDto(contact: EmergencyContact): EmergencyContactDto {
  return {
    id: contact.id,
    name: contact.name,
    phone: contact.phone,
    email: contact.email,
    relationship: contact.relationship,
  };
}

function cacheKey(userId: string): string {
  return `contacts:${userId}`;
}

export async function listContacts(userId: string): Promise<EmergencyContactDto[]> {
  const cached = await cacheGet<EmergencyContactDto[]>(cacheKey(userId));
  if (cached) return cached;

  const contacts = await prisma.emergencyContact.findMany({
    where: { userId },
    orderBy: { createdAt: "asc" },
  });
  const dto = contacts.map(toContactDto);
  await cacheSet(cacheKey(userId), dto, CONTACTS_CACHE_TTL_SECONDS);
  return dto;
}

async function assertNoDuplicate(
  userId: string,
  phone: string | null | undefined,
  email: string | null | undefined,
  excludeId?: string,
): Promise<void> {
  const or: Array<{ phone: string } | { email: string }> = [];
  if (phone) or.push({ phone });
  if (email) or.push({ email });
  if (or.length === 0) return;

  const existing = await prisma.emergencyContact.findFirst({
    where: {
      userId,
      OR: or,
      ...(excludeId ? { NOT: { id: excludeId } } : {}),
    },
  });
  if (existing) {
    throw new ApiError(409, "A contact with this phone or email already exists.");
  }
}

export async function createContact(
  userId: string,
  input: { name: string; phone: string; email: string; relationship?: string },
): Promise<EmergencyContactDto> {
  const count = await prisma.emergencyContact.count({ where: { userId } });
  if (count >= MAX_CONTACTS) {
    throw new ApiError(400, `Maximum of ${MAX_CONTACTS} contacts allowed.`);
  }

  await assertNoDuplicate(userId, input.phone, input.email);

  try {
    const contact = await prisma.emergencyContact.create({
      data: {
        userId,
        name: input.name,
        phone: input.phone,
        email: input.email,
        relationship: input.relationship ?? null,
      },
    });
    await cacheDel(cacheKey(userId));
    return toContactDto(contact);
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      throw new ApiError(409, "A contact with this phone or email already exists.");
    }
    throw error;
  }
}

export async function updateContact(
  userId: string,
  id: string,
  input: {
    name?: string;
    phone?: string | null;
    email?: string;
    relationship?: string | null;
  },
): Promise<EmergencyContactDto> {
  const contact = await prisma.emergencyContact.findUnique({ where: { id } });
  if (!contact || contact.userId !== userId) {
    throw new ApiError(404, "Contact not found.");
  }

  await assertNoDuplicate(userId, input.phone, input.email, id);

  try {
    const updated = await prisma.emergencyContact.update({
      where: { id: contact.id },
      data: {
        ...(input.name !== undefined && { name: input.name }),
        ...(input.phone !== undefined && { phone: input.phone }),
        ...(input.email !== undefined && { email: input.email }),
        ...(input.relationship !== undefined && { relationship: input.relationship }),
      },
    });
    await cacheDel(cacheKey(userId));
    return toContactDto(updated);
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      throw new ApiError(409, "A contact with this phone or email already exists.");
    }
    throw error;
  }
}

export async function removeContact(userId: string, id: string): Promise<void> {
  const contact = await prisma.emergencyContact.findUnique({ where: { id } });
  if (!contact || contact.userId !== userId) {
    throw new ApiError(404, "Contact not found.");
  }
  await prisma.emergencyContact.delete({ where: { id } });
  await cacheDel(cacheKey(userId));
}
