import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { animals, sightings, photos } from '$lib/server/db/schema';
import { addSightingSchema } from '$lib/validation/sighting';
import { eq, sql } from 'drizzle-orm';
import { env } from '$env/dynamic/private';

const MAX_DISTANCE_METERS = 30_000;

export const POST: RequestHandler = async ({ request, params }) => {
	const body = await request.json().catch(() => null);
	const parsed = addSightingSchema.safeParse({ ...body, animalId: params.id });

	if (!parsed.success) {
		throw error(400, { message: parsed.error.issues[0]?.message ?? 'Invalid request' });
	}

	const data = parsed.data;

	const [animal] = await db
		.select({ id: animals.id, acceptedAt: animals.acceptedAt })
		.from(animals)
		.where(eq(animals.id, params.id))
		.limit(1);

	if (!animal) {
		throw error(404, { message: 'Animal not found' });
	}

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

	const animalAlreadyAccepted = animal.acceptedAt !== null;

	const result = await db.transaction(async (tx) => {
		const [sighting] = await tx
			.insert(sightings)
			.values({
				animalId: data.animalId,
				reporterName: data.reporterName,
				seenAt: new Date(data.seenAt),
				lat: data.lat,
				lng: data.lng,
				...(animalAlreadyAccepted ? { acceptedAt: new Date() } : {})
			})
			.returning({ id: sightings.id });

		if (data.photoKeys && data.photoKeys.length > 0) {
			await tx.insert(photos).values(
				data.photoKeys.map((key, i) => ({
					sightingId: sighting.id,
					r2Key: key,
					url: `${env.R2_PUBLIC_URL}/${key}`,
					sortOrder: i
				}))
			);
		}

		return { sightingId: sighting.id };
	});

	console.log(
		`[sightings] created sighting ${result.sightingId} for animal ${params.id} (auto-accepted: ${animalAlreadyAccepted})`
	);
	return json(result, { status: 201 });
};
