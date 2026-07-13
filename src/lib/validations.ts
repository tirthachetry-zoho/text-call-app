import { z } from "zod";

// Indian phone number: +91 followed by 10 digits (first digit 6-9).
const phoneRegex = /^\+91[6-9]\d{9}$/;

export const phoneSchema = z.object({
  phone_number: z
    .string()
    .regex(phoneRegex, "Enter a valid Indian phone number, e.g. +919500000001"),
});

export const registerSchema = z.object({
  phone_number: phoneSchema.shape.phone_number,
  display_name: z.string().min(1, "Name is required").max(50, "Name is too long"),
});

export const sendConnectionRequestSchema = z.object({
  phone_number: phoneSchema.shape.phone_number,
});

export const respondRequestSchema = z.object({
  request_id: z.string().uuid(),
  action: z.enum(["accept", "reject"]),
});

export const sendMessageSchema = z.object({
  connection_id: z.string().uuid(),
  content: z.string().max(4000).optional(),
  attachment_url: z.string().url().optional(),
  attachment_type: z.string().max(50).optional(),
});

export const updateProfileSchema = z.object({
  display_name: z.string().min(1).max(50).optional(),
  avatar: z.string().url().optional().nullable(),
});

export const blockUserSchema = z.object({
  blocked_id: z.string().uuid(),
});

export const deleteMessageSchema = z.object({
  message_id: z.string().uuid(),
});

export const editMessageSchema = z.object({
  message_id: z.string().uuid(),
  content: z.string().min(1, "Message cannot be empty").max(4000),
});

export const searchMessagesSchema = z.object({
  connection_id: z.string().uuid(),
  query: z.string().min(1).max(100),
});

export const callActionSchema = z.object({
  call_id: z.string().uuid(),
  action: z.enum(["accept", "reject", "end", "cancel"]),
});

export type PhoneInput = z.infer<typeof phoneSchema>;
export type RegisterInput = z.infer<typeof registerSchema>;
