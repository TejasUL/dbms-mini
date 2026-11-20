import { z } from "zod";

export const phoneSchema = z
  .string()
  .trim()
  .regex(/^\+[1-9]\d{7,14}$/, "phone must include country code, e.g. +919876543210");

export const signupSchema = z.object({
  name: z.string().trim().min(1, "name is required").max(120),
  email: z.email("enter a valid email").transform((value) => value.trim().toLowerCase()),
  password: z.string().min(6, "password must be at least 6 characters").max(72),
});

export const signinSchema = z.object({
  email: z.email("enter a valid email").transform((value) => value.trim().toLowerCase()),
  password: z.string().min(1, "password is required"),
});

export const updateUserSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  phone: phoneSchema.nullish(),
});

export const contactCreateSchema = z.object({
  name: z.string().trim().min(1, "name is required").max(120),
  phone: phoneSchema,
  email: z.email("enter a valid email").transform((value) => value.trim().toLowerCase()),
  relationship: z.string().trim().min(1).max(80).optional(),
});

export const contactUpdateSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  phone: phoneSchema.nullish(),
  // Email is the only notification channel, so it can no longer be cleared.
  email: z
    .email("enter a valid email")
    .transform((value) => value.trim().toLowerCase())
    .optional(),
  relationship: z.string().trim().min(1).max(80).nullish(),
});

export const triggerAlertSchema = z
  .object({
    triggerType: z.enum(["tap", "longPress"]).optional(),
    latitude: z.number().min(-90).max(90).optional(),
    longitude: z.number().min(-180).max(180).optional(),
    accuracy: z.number().nonnegative().optional(),
  })
  .refine(
    (value) => (value.latitude === undefined) === (value.longitude === undefined),
    "latitude and longitude must be supplied together",
  );

export const updateLocationSchema = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  accuracy: z.number().nonnegative().optional(),
});

export const updateStatusSchema = z.object({
  status: z.enum(["acknowledged", "resolved"]),
});

export const adminAlertsQuerySchema = z.object({
  status: z.enum(["sent", "acknowledged", "resolved"]).optional(),
  from: z.iso.datetime({ offset: true }).optional(),
  to: z.iso.datetime({ offset: true }).optional(),
  userId: z.uuid().optional(),
  take: z.coerce.number().int().min(1).max(200).optional(),
  skip: z.coerce.number().int().min(0).optional(),
});
