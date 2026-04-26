import {
	pgTable,
	uuid,
	text,
	timestamp,
	doublePrecision,
	real,
	integer
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

export const animals = pgTable('animals', {
	id: uuid('id').primaryKey().defaultRandom(),

	species: text('species').notNull(),
	breed: text('breed'),
	animalName: text('animal_name'),
	description: text('description'),

	// AI detection stored on the animal (from the first/primary photo)
	aiBreedSuggestion: text('ai_breed_suggestion'),
	aiBreedConfidence: real('ai_breed_confidence'),

	// Moderation — the animal entity is moderated once.
	// Accepted = visible on map (as long as it has accepted sightings too).
	// Denied animals are hidden but not deleted.
	submittedAt: timestamp('submitted_at', { withTimezone: true }).notNull().defaultNow(),
	acceptedAt: timestamp('accepted_at', { withTimezone: true }),
	deniedAt: timestamp('denied_at', { withTimezone: true })
});

export type Animal = typeof animals.$inferSelect;
export type NewAnimal = typeof animals.$inferInsert;

// The PostGIS `location geography(Point, 4326)` column is managed outside Drizzle
// via a trigger in the migration — it auto-syncs from lat/lng on insert/update.
// Never write to `location` directly from application code.

export const sightings = pgTable('sightings', {
	id: uuid('id').primaryKey().defaultRandom(),
	animalId: uuid('animal_id')
		.notNull()
		.references(() => animals.id, { onDelete: 'cascade' }),

	reporterName: text('reporter_name'),

	seenAt: timestamp('seen_at', { withTimezone: true }).notNull(),
	lat: doublePrecision('lat').notNull(),
	lng: doublePrecision('lng').notNull(),
	// `location` geography column exists in DB but not mapped in Drizzle — use sql`` for spatial queries

	submittedAt: timestamp('submitted_at', { withTimezone: true }).notNull().defaultNow(),
	acceptedAt: timestamp('accepted_at', { withTimezone: true }),
	deniedAt: timestamp('denied_at', { withTimezone: true })
});

export type Sighting = typeof sightings.$inferSelect;
export type NewSighting = typeof sightings.$inferInsert;

export const photos = pgTable('photos', {
	id: uuid('id').primaryKey().defaultRandom(),
	sightingId: uuid('sighting_id')
		.notNull()
		.references(() => sightings.id, { onDelete: 'cascade' }),
	r2Key: text('r2_key').notNull(),
	url: text('url').notNull(),
	sortOrder: integer('sort_order').notNull().default(0),
	uploadedAt: timestamp('uploaded_at', { withTimezone: true }).notNull().defaultNow()
});

export type Photo = typeof photos.$inferSelect;

// ── Relations ─────────────────────────────────────────────────────────────────

export const animalRelations = relations(animals, ({ many }) => ({
	sightings: many(sightings)
}));

export const sightingRelations = relations(sightings, ({ one, many }) => ({
	animal: one(animals, { fields: [sightings.animalId], references: [animals.id] }),
	photos: many(photos)
}));

export const photoRelations = relations(photos, ({ one }) => ({
	sighting: one(sightings, { fields: [photos.sightingId], references: [sightings.id] })
}));

// ── Helpers ───────────────────────────────────────────────────────────────────

export type ModerationStatus = 'pending' | 'accepted' | 'denied';

export function getModerationStatus(
	row: Pick<Animal | Sighting, 'acceptedAt' | 'deniedAt'>
): ModerationStatus {
	if (row.deniedAt) return 'denied';
	if (row.acceptedAt) return 'accepted';
	return 'pending';
}
