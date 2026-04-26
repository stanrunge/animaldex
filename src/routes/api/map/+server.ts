import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { animals, sightings } from '$lib/server/db/schema';
import { mapQuerySchema } from '$lib/validation/sighting';
import { and, eq, gte, ilike, isNotNull, isNull, lte, sql } from 'drizzle-orm';

export const GET: RequestHandler = async ({ url }) => {
	const params = Object.fromEntries(url.searchParams);
	const parsed = mapQuerySchema.safeParse(params);

	if (!parsed.success) {
		throw error(400, { message: 'Invalid query parameters' });
	}

	const q = parsed.data;

	const conditions = [
		isNotNull(animals.acceptedAt),
		isNull(animals.deniedAt),
		isNotNull(sightings.acceptedAt),
		isNull(sightings.deniedAt),
		sql`ST_Within(
			${sightings}.location::geometry,
			ST_MakeEnvelope(${q.minLng}, ${q.minLat}, ${q.maxLng}, ${q.maxLat}, 4326)
		)`
	];

	if (q.species) conditions.push(ilike(animals.species, `%${q.species}%`));
	if (q.breed) conditions.push(ilike(animals.breed, `%${q.breed}%`));
	if (q.name) conditions.push(ilike(animals.animalName, `%${q.name}%`));
	if (q.reporter) conditions.push(ilike(sightings.reporterName, `%${q.reporter}%`));
	if (q.fromDate) conditions.push(gte(sightings.seenAt, new Date(q.fromDate)));
	if (q.toDate) conditions.push(lte(sightings.seenAt, new Date(q.toDate)));

	const rows = await db
		.select({
			animalId: animals.id,
			species: animals.species,
			breed: animals.breed,
			animalName: animals.animalName,
			sightingId: sightings.id,
			seenAt: sightings.seenAt,
			reporterName: sightings.reporterName,
			lat: sightings.lat,
			lng: sightings.lng,
			photoUrl: sql<string>`(
				SELECT url FROM photos
				WHERE sighting_id = ${sightings.id}
				ORDER BY sort_order ASC
				LIMIT 1
			)`
		})
		.from(sightings)
		.innerJoin(animals, eq(sightings.animalId, animals.id))
		.where(and(...conditions))
		.orderBy(sightings.seenAt);

	const animalMap = new Map<
		string,
		{
			animalId: string;
			species: string;
			breed: string | null;
			animalName: string | null;
			sightings: Array<{
				id: string;
				lat: number;
				lng: number;
				seenAt: Date;
				reporterName: string | null;
				photoUrl: string | null;
			}>;
		}
	>();

	for (const row of rows) {
		if (!animalMap.has(row.animalId)) {
			animalMap.set(row.animalId, {
				animalId: row.animalId,
				species: row.species,
				breed: row.breed,
				animalName: row.animalName,
				sightings: []
			});
		}
		animalMap.get(row.animalId)!.sightings.push({
			id: row.sightingId,
			lat: row.lat,
			lng: row.lng,
			seenAt: row.seenAt,
			reporterName: row.reporterName,
			photoUrl: row.photoUrl
		});
	}

	const features = Array.from(animalMap.values()).map((animal) => {
		const sorted = [...animal.sightings].sort((a, b) => b.seenAt.getTime() - a.seenAt.getTime());
		const latest = sorted[0];
		return {
			type: 'Feature' as const,
			geometry: { type: 'Point' as const, coordinates: [latest.lng, latest.lat] },
			properties: {
				animalId: animal.animalId,
				species: animal.species,
				breed: animal.breed,
				animalName: animal.animalName,
				sightingCount: animal.sightings.length,
				trail: animal.sightings.map((s) => ({
					id: s.id,
					lng: s.lng,
					lat: s.lat,
					seenAt: s.seenAt.toISOString(),
					reporterName: s.reporterName,
					photoUrl: s.photoUrl
				}))
			}
		};
	});

	console.log(
		`[map] query returned ${rows.length} rows for bbox ${q.minLng},${q.minLat} → ${q.maxLng},${q.maxLat}`
	);
	console.log(`[map] built ${features.length} features`);

	return json({ type: 'FeatureCollection', features });
};
