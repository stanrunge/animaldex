import type { PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import { animals, sightings } from '$lib/server/db/schema';
import { isAdmin } from '$lib/server/auth';
import { and, eq, isNull, sql } from 'drizzle-orm';

export const load: PageServerLoad = async (event) => {
	const admin = isAdmin(event);
	if (!admin) return { admin: false, queue: [] };

	const pending = await db
		.select({
			animalId: animals.id,
			species: animals.species,
			breed: animals.breed,
			animalName: animals.animalName,
			description: animals.description,
			aiBreedSuggestion: animals.aiBreedSuggestion,
			aiBreedConfidence: animals.aiBreedConfidence,
			submittedAt: animals.submittedAt,
			acceptedAt: animals.acceptedAt,
			deniedAt: animals.deniedAt,
			sightingId: sightings.id,
			sightingLat: sightings.lat,
			sightingLng: sightings.lng,
			seenAt: sightings.seenAt,
			reporterName: sightings.reporterName,
			sightingAcceptedAt: sightings.acceptedAt,
			sightingDeniedAt: sightings.deniedAt,
			photoUrl: sql<string>`(
				SELECT url FROM photos
				WHERE sighting_id = ${sightings.id}
				ORDER BY sort_order ASC
				LIMIT 1
			)`
		})
		.from(animals)
		.innerJoin(
			sightings,
			and(
				eq(sightings.animalId, animals.id),
				sql`${sightings.id} = (
					SELECT id FROM sightings
					WHERE animal_id = ${animals.id}
					ORDER BY submitted_at ASC
					LIMIT 1
				)`
			)
		)
		.orderBy(animals.submittedAt);

	return { admin: true, queue: pending };
};
