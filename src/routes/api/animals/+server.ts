import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { animals, sightings, photos } from '$lib/server/db/schema';
import { registerAnimalSchema } from '$lib/validation/sighting';
import { sql } from 'drizzle-orm';
import { env } from '$env/dynamic/private';

const MAX_DISTANCE_METERS = 30_000;

export const POST: RequestHandler = async ({ request }) => {
	const body = await request.json().catch(() => null);
	const parsed = registerAnimalSchema.safeParse(body);

	if (!parsed.success) {
		throw error(400, { message: parsed.error.issues[0]?.message ?? 'Invalid request' });
	}

	const data = parsed.data;

	const [distRow] = await db.execute(sql`
		SELECT ST_Distance(
			ST_MakePoint(${data.deviceLng}, ${data.deviceLat})::geography,
			ST_MakePoint(${data.lng}, ${data.lat})::geography
		) AS dist
	`);

	const dist = Number((distRow as Record<string, unknown>).dist);
	if (dist > MAX_DISTANCE_METERS) {
		throw error(422, {
			message: `Location is ${Math.round(dist / 1000)}km from your device. Maximum is 30km.`
		});
	}

	const result = await db.transaction(async (tx) => {
		const [animal] = await tx
			.insert(animals)
			.values({
				species: data.species,
				breed: data.breed,
				animalName: data.animalName,
				description: data.description,
				aiBreedSuggestion: data.aiBreedSuggestion,
				aiBreedConfidence: data.aiBreedConfidence
			})
			.returning({ id: animals.id });

		const [sighting] = await tx
			.insert(sightings)
			.values({
				animalId: animal.id,
				reporterName: data.reporterName,
				seenAt: new Date(data.seenAt),
				lat: data.lat,
				lng: data.lng
			})
			.returning({ id: sightings.id });

		await tx.insert(photos).values(
			data.photoKeys.map((key, i) => ({
				sightingId: sighting.id,
				r2Key: key,
				url: `${env.R2_PUBLIC_URL}/${key}`,
				sortOrder: i
			}))
		);

		return { animalId: animal.id, sightingId: sighting.id };
	});

	console.log(`[animals] created animal ${result.animalId}, sighting ${result.sightingId}`);
	return json(result, { status: 201 });
};
