import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { sightings } from '$lib/server/db/schema';
import { moderationActionSchema } from '$lib/validation/sighting';
import { eq } from 'drizzle-orm';
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

	const [updated] = await db
		.update(sightings)
		.set({
			acceptedAt: isAccept ? now : null,
			deniedAt: isAccept ? null : now
		})
		.where(eq(sightings.id, event.params.id))
		.returning({ id: sightings.id });

	if (!updated) {
		throw error(404, { message: 'Sighting not found' });
	}

	return json({ ok: true, action: parsed.data.action });
};
