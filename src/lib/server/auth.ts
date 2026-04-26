import { env } from '$env/dynamic/private';
import type { RequestEvent } from '@sveltejs/kit';

export function isAdmin(event: RequestEvent): boolean {
	const token = event.cookies.get('admin_token');
	return !!token && token === env.ADMIN_SECRET;
}

export function requireAdmin(event: RequestEvent): void {
	if (!isAdmin(event)) {
		throw new Response(JSON.stringify({ error: 'Unauthorized' }), {
			status: 401,
			headers: { 'Content-Type': 'application/json' }
		});
	}
}
