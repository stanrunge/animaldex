import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { env } from '$env/dynamic/private';
import { randomUUID } from 'crypto';

function isConfigured(): boolean {
	return !!(
		env.R2_ACCESS_KEY_ID &&
		env.R2_SECRET_ACCESS_KEY &&
		env.R2_ACCOUNT_ID &&
		env.R2_BUCKET &&
		env.R2_PUBLIC_URL
	);
}

let _client: S3Client | null = null;

function getClient(): S3Client {
	if (!_client) {
		if (!isConfigured()) throw new Error('R2 is not configured — check your .env');
		_client = new S3Client({
			region: 'auto',
			endpoint: `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
			credentials: {
				accessKeyId: env.R2_ACCESS_KEY_ID!,
				secretAccessKey: env.R2_SECRET_ACCESS_KEY!
			}
		});
	}
	return _client;
}

const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic'] as const;
export type AllowedMimeType = (typeof ALLOWED_MIME_TYPES)[number];

export function isAllowedMimeType(mime: string): mime is AllowedMimeType {
	return (ALLOWED_MIME_TYPES as readonly string[]).includes(mime);
}

const EXT: Record<AllowedMimeType, string> = {
	'image/jpeg': 'jpg',
	'image/png': 'png',
	'image/webp': 'webp',
	'image/heic': 'heic'
};

export interface PresignedUpload {
	/** R2 object key — store this in the DB */
	key: string;
	/** One-time presigned PUT URL — browser PUTs file directly here */
	uploadUrl: string;
	/** Permanent public URL to store in photos table */
	publicUrl: string;
}

/**
 * Generate a presigned PUT URL for a single photo.
 *
 * Flow:
 *   1. Client POSTs to /api/upload/presign → gets { key, uploadUrl, publicUrl }
 *   2. Client PUTs file to uploadUrl (direct to R2, server never sees the bytes)
 *   3. Client submits sighting with photo keys included
 *   4. Server stores key + publicUrl in photos table
 */
export async function createPresignedUpload(mimeType: AllowedMimeType): Promise<PresignedUpload> {
	const key = `sightings/${randomUUID()}.${EXT[mimeType]}`;

	const uploadUrl = await getSignedUrl(
		getClient(),
		new PutObjectCommand({
			Bucket: env.R2_BUCKET,
			Key: key,
			ContentType: mimeType
		}),
		{ expiresIn: 3600 }
	);

	return { key, uploadUrl, publicUrl: `${env.R2_PUBLIC_URL}/${key}` };
}

/**
 * Delete a photo from R2 by its key.
 */
export async function deleteObject(key: string): Promise<void> {
	await getClient().send(new DeleteObjectCommand({ Bucket: env.R2_BUCKET, Key: key }));
}
