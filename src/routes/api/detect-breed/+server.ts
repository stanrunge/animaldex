import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { detectBreed } from '$lib/server/breed-detector';
import { z } from 'zod';

const schema = z.object({ imageUrl: z.string().url() });

export const POST: RequestHandler = async ({ request }) => {
	const body = await request.json().catch(() => null);
	const parsed = schema.safeParse(body);

	if (!parsed.success) {
		throw error(400, { message: 'imageUrl is required' });
	}

	const result = await detectBreed(parsed.data.imageUrl);
	return json(result ?? { breed: null, confidence: 0 });
};
