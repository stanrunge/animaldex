import { z } from 'zod';

// ── Presigned upload ──────────────────────────────────────────────────────────

export const presignedUploadSchema = z.object({
	mimeType: z.enum(['image/jpeg', 'image/png', 'image/webp', 'image/heic'])
});

// ── Register new animal (+ first sighting) ────────────────────────────────────

export const registerAnimalSchema = z.object({
	// Animal identity
	species: z.string().min(1).max(100),
	breed: z.string().max(100).optional(),
	animalName: z.string().max(100).optional(),
	description: z.string().max(1000).optional(),

	// AI suggestion to persist for admin review
	aiBreedSuggestion: z.string().max(100).optional(),
	aiBreedConfidence: z.number().min(0).max(1).optional(),

	// First sighting details
	reporterName: z.string().max(100).optional(),
	seenAt: z.iso.datetime(),
	lat: z.number().min(-90).max(90),
	lng: z.number().min(-180).max(180),

	// Device GPS — used server-side for 30km check, never stored
	deviceLat: z.number().min(-90).max(90),
	deviceLng: z.number().min(-180).max(180),

	// Already-uploaded R2 keys (1–10 photos, browser uploaded directly)
	photoKeys: z.array(z.string().min(1)).min(1).max(10)
});

export type RegisterAnimalInput = z.infer<typeof registerAnimalSchema>;

// ── Add sighting to existing animal ──────────────────────────────────────────

export const addSightingSchema = z.object({
	animalId: z.string().uuid(),
	reporterName: z.string().max(100).optional(),
	seenAt: z.iso.datetime(),
	lat: z.number().min(-90).max(90),
	lng: z.number().min(-180).max(180),
	deviceLat: z.number().min(-90).max(90),
	deviceLng: z.number().min(-180).max(180),
	photoKeys: z.array(z.string().min(1)).max(10).optional()
});

export type AddSightingInput = z.infer<typeof addSightingSchema>;

// ── Map viewport query ────────────────────────────────────────────────────────

export const mapQuerySchema = z.object({
	minLat: z.coerce.number().min(-90).max(90),
	minLng: z.coerce.number().min(-180).max(180),
	maxLat: z.coerce.number().min(-90).max(90),
	maxLng: z.coerce.number().min(-180).max(180),

	// Optional filters
	species: z.string().optional(),
	breed: z.string().optional(),
	name: z.string().optional(),
	reporter: z.string().optional(),
	fromDate: z.iso.datetime().optional(),
	toDate: z.iso.datetime().optional()
});

export type MapQuery = z.infer<typeof mapQuerySchema>;

// ── Admin ─────────────────────────────────────────────────────────────────────

export const moderationActionSchema = z.object({
	action: z.enum(['accept', 'deny'])
});
