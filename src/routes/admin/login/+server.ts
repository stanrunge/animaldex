import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { env } from '$env/dynamic/private';
import { z } from 'zod';

const loginSchema = z.object({ password: z.string().min(1) });

export const POST: RequestHandler = async ({ request, cookies }) => {
	const body = await request.json().catch(() => null);
	const parsed = loginSchema.safeParse(body);

	if (!parsed.success || parsed.data.password !== env.ADMIN_SECRET) {
		throw error(401, { message: 'Invalid password' });
	}

	cookies.set('admin_token', env.ADMIN_SECRET, {
		path: '/',
		httpOnly: true,
		sameSite: 'strict',
		secure: process.env.NODE_ENV === 'production',
		maxAge: 60 * 60 * 24 * 7
	});

	return json({ ok: true });
};
