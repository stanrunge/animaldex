import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { animals, sightings } from '$lib/server/db/schema';
import { moderationActionSchema } from '$lib/validation/sighting';
import { eq, isNull } from 'drizzle-orm';
import { requireAdmin } from '$lib/server/auth';

export const POST: RequestHandler = async (event) => {
	requireAdmin(event);

	const body = await event.request.json().catch(() => null);
	const parsed = moderationActionSchema.safeParse(body);

	if (!parsed.success) {
		throw error(400, { message: 'action must be "accept" or "deny"' });
	}

	const now = new Date();
	const isAccept = parsed.data.action === 'accept';

	const [updated] = await db.transaction(async (tx) => {
		const result = await tx
			.update(animals)
			.set({
				acceptedAt: isAccept ? now : null,
				deniedAt: isAccept ? null : now
			})
			.where(eq(animals.id, event.params.id))
			.returning({ id: animals.id });

		if (result.length && isAccept) {
			await tx
				.update(sightings)
				.set({ acceptedAt: now, deniedAt: null })
				.where(eq(sightings.animalId, event.params.id));
		}

		return result;
	});

	if (!updated) {
		throw error(404, { message: 'Animal not found' });
	}

	console.log(
		`[moderate] animal ${event.params.id} → ${parsed.data.action}, updated ${updated?.id}`
	);

	return json({ ok: true, action: parsed.data.action });
};
