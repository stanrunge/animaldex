import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createPresignedUpload, isAllowedMimeType } from '$lib/server/r2';
import { presignedUploadSchema } from '$lib/validation/sighting';

export const POST: RequestHandler = async ({ request }) => {
	const body = await request.json().catch(() => null);
	const parsed = presignedUploadSchema.safeParse(body);

	if (!parsed.success) {
		throw error(400, { message: 'Invalid request body' });
	}

	const { mimeType } = parsed.data;

	if (!isAllowedMimeType(mimeType)) {
		throw error(400, { message: 'Unsupported image type' });
	}

	const result = await createPresignedUpload(mimeType);
	return json(result);
};
