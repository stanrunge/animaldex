import { env } from '$env/dynamic/private';
import { createAnthropic } from '@ai-sdk/anthropic';
import { generateText } from 'ai';

const anthropic = createAnthropic({
	apiKey: env.ANTHROPIC_API_KEY
});

export interface BreedDetectionResult {
	breed: string;
	confidence: number;
}

const PROMPT = `You are an expert at identifying animal breeds and species from photos.

Look at the animal in this image and identify its breed or species as specifically as possible.

Respond ONLY with a JSON object — no markdown, no explanation:
{"breed": "Golden Retriever", "confidence": 0.92}

Rules:
- "breed" should be the most specific correct identification (e.g. "Siberian Husky", not just "dog")
- "confidence" is your certainty from 0.0 to 1.0
- If you genuinely cannot identify the animal, respond: {"breed": null, "confidence": 0}`;

export async function detectBreed(imageUrl: string): Promise<BreedDetectionResult | null> {
	try {
		const { text } = await generateText({
			model: anthropic('claude-haiku-4-5'),
			messages: [
				{
					role: 'user',
					content: [
						{ type: 'image', image: new URL(imageUrl) },
						{ type: 'text', text: PROMPT }
					]
				}
			]
		});

		const parsed = JSON.parse(text.trim());

		return {
			breed: parsed.breed,
			confidence: Math.min(1, Math.max(0, Number(parsed.confidence) || 0))
		};
	} catch {
		return null;
	}
}
