<script lang="ts">
	import { resolve } from '$app/paths';
	import type { Map as MaptilerMap, Marker as MaptilerMarker } from '@maptiler/sdk';
	import { onMount } from 'svelte';
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';

	const animalId = $derived($page.url.searchParams.get('animalId'));
	const isNewSighting = $derived(!!animalId);

	let species = $state('');
	let customSpecies = $state('');
	let breed = $state('');
	let animalName = $state('');
	let description = $state('');
	let reporterName = $state('');
	let seenAt = $state(new Date().toISOString().slice(0, 16));

	let aiSuggestion = $state<{ breed: string; confidence: number } | null>(null);
	let aiLoading = $state(false);
	let aiDismissed = $state(false);

	let photoFiles = $state<File[]>([]);
	let photoPreviews = $state<string[]>([]);

	let lat = $state<number | null>(null);
	let lng = $state<number | null>(null);
	let deviceLat = $state<number | null>(null);
	let deviceLng = $state<number | null>(null);
	let locationError = $state('');
	let locationLoading = $state(false);

	let mapContainer = $state<HTMLDivElement>(null!);
	let map: MaptilerMap | null = null;
	let marker: MaptilerMarker | null = null;

	let submitting = $state(false);
	let submitError = $state('');

	$effect(() => {
		if (mapContainer && lat !== null && lng !== null && !map) {
			initMap();
		}
	});

	const COMMON_SPECIES = ['Dog', 'Cat', 'Fox', 'Bird', 'Rabbit', 'Deer', 'Squirrel', 'Hedgehog'];
	const finalSpecies = $derived(species === '__custom__' ? customSpecies : species);

	onMount(async () => {
		reporterName = localStorage.getItem('reporterName') ?? '';
		locationLoading = true;
		navigator.geolocation.getCurrentPosition(
			(pos) => {
				deviceLat = pos.coords.latitude;
				deviceLng = pos.coords.longitude;
				lat = pos.coords.latitude;
				lng = pos.coords.longitude;
				locationLoading = false;
			},
			() => {
				locationLoading = false;
				locationError = 'Location access denied. GPS is required to register a sighting.';
			},
			{ enableHighAccuracy: true, timeout: 10000 }
		);
	});

	async function initMap() {
		if (!mapContainer || lat === null || lng === null) return;
		const { Map, Marker, config } = await import('@maptiler/sdk');
		const { PUBLIC_MAPTILER_API_KEY } = await import('$env/static/public');
		config.apiKey = PUBLIC_MAPTILER_API_KEY;

		map = new Map({
			container: mapContainer,
			style: 'https://api.maptiler.com/maps/satellite/style.json?key=' + PUBLIC_MAPTILER_API_KEY,
			center: [lng!, lat!],
			zoom: 15
		});

		map.on('load', () => {
			marker = new Marker({ draggable: true }).setLngLat([lng!, lat!]).addTo(map!);
			marker.on('dragend', () => {
				const lngLat = marker!.getLngLat();
				lat = lngLat.lat;
				lng = lngLat.lng;
			});
		});
	}

	function handlePhotoChange(e: Event) {
		const input = e.target as HTMLInputElement;
		const newFiles = Array.from(input.files ?? []).slice(0, 10 - photoFiles.length);
		photoFiles = [...photoFiles, ...newFiles].slice(0, 10);
		photoPreviews = photoFiles.map((f) => URL.createObjectURL(f));
		if (photoFiles.length === 1 && !isNewSighting) runAIDetection(photoFiles[0]);
	}

	function removePhoto(index: number) {
		photoFiles = photoFiles.filter((_, i) => i !== index);
		photoPreviews = photoPreviews.filter((_, i) => i !== index);
	}

	async function runAIDetection(file: File) {
		aiLoading = true;
		aiDismissed = false;
		try {
			const presignRes = await fetch('/api/upload', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ mimeType: file.type })
			});
			if (!presignRes.ok) return;
			const { uploadUrl, publicUrl } = await presignRes.json();
			await fetch(uploadUrl, { method: 'PUT', body: file, headers: { 'Content-Type': file.type } });
			const aiRes = await fetch('/api/detect-breed', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ imageUrl: publicUrl })
			});
			if (!aiRes.ok) return;
			const result = await aiRes.json();
			if (result.breed) {
				aiSuggestion = result;
				if (!breed) breed = result.breed;
			}
		} catch {
			/* silent */
		} finally {
			aiLoading = false;
		}
	}

	async function submit() {
		if (submitting) return;
		submitError = '';
		if (!finalSpecies && !isNewSighting) {
			submitError = 'Please select or enter a species.';
			return;
		}
		if (photoFiles.length === 0 && !isNewSighting) {
			submitError = 'At least one photo is required.';
			return;
		}
		if (lat === null || lng === null || deviceLat === null || deviceLng === null) {
			submitError = 'Location is required.';
			return;
		}
		submitting = true;
		try {
			const photoKeys: string[] = [];
			if (photoFiles.length > 0) {
				for (const file of photoFiles) {
					const presignRes = await fetch('/api/upload', {
						method: 'POST',
						headers: { 'Content-Type': 'application/json' },
						body: JSON.stringify({ mimeType: file.type })
					});
					if (!presignRes.ok) throw new Error('Failed to get upload URL');
					const { key, uploadUrl } = await presignRes.json();
					const uploadRes = await fetch(uploadUrl, {
						method: 'PUT',
						body: file,
						headers: { 'Content-Type': file.type }
					});
					if (!uploadRes.ok) throw new Error('Photo upload failed');
					photoKeys.push(key);
				}
			}
			if (reporterName) localStorage.setItem('reporterName', reporterName);

			const endpoint = isNewSighting ? `/api/animals/${animalId}/sightings` : '/api/animals';
			const body = isNewSighting
				? {
						animalId,
						reporterName: reporterName || undefined,
						seenAt: new Date(seenAt).toISOString(),
						lat,
						lng,
						deviceLat,
						deviceLng,
						photoKeys
					}
				: {
						species: finalSpecies,
						breed: breed || undefined,
						animalName: animalName || undefined,
						description: description || undefined,
						reporterName: reporterName || undefined,
						aiBreedSuggestion: aiSuggestion?.breed,
						aiBreedConfidence: aiSuggestion?.confidence,
						seenAt: new Date(seenAt).toISOString(),
						lat,
						lng,
						deviceLat,
						deviceLng,
						photoKeys
					};

			const res = await fetch(endpoint, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(body)
			});
			if (!res.ok) {
				const err = await res.json();
				throw new Error(err.message ?? 'Submission failed');
			}
			goto(resolve('/?submitted=1'));
		} catch (e: unknown) {
			submitError = e instanceof Error ? e.message : 'Something went wrong.';
		} finally {
			submitting = false;
		}
	}
</script>

<svelte:head>
	<title>Animaldex - Log a sighting</title>
	<link rel="stylesheet" href="https://cdn.maptiler.com/maptiler-sdk-js/latest/maptiler-sdk.css" />
</svelte:head>

<div class="min-h-screen bg-gray-50">
	<div
		class="sticky top-0 z-10 flex items-center gap-3 border-b border-gray-100 bg-white px-4 py-3"
	>
		<a href={resolve('/')} class="text-gray-400 hover:text-gray-600">←</a>
		<h1 class="font-semibold text-gray-900">
			{isNewSighting ? 'Log another sighting' : 'Register an animal'}
		</h1>
	</div>

	<div class="mx-auto max-w-lg space-y-5 px-4 py-6">
		{#if locationError}
			<div class="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
				<p class="font-medium">📍 Location required</p>
				<p class="mt-1">{locationError}</p>
				<p class="mt-2 text-xs">
					Go to <strong>Settings → Site permissions → Location</strong> and allow this site.
				</p>
			</div>
		{/if}

		<section class="rounded-2xl bg-white p-4 shadow-sm">
			<h2 class="mb-3 text-sm font-semibold text-gray-700">
				Photos
				{#if isNewSighting}
					<span class="text-xs font-normal text-gray-400">(optional)</span>
				{:else}
					<span class="text-red-400">*</span>
				{/if}
			</h2>
			<div class="flex flex-wrap gap-2">
				{#each photoPreviews as preview, i (i)}
					<div class="relative h-20 w-20 overflow-hidden rounded-xl">
						<img src={preview} alt="" class="h-full w-full object-cover" />
						<button
							onclick={() => removePhoto(i)}
							class="absolute top-1 right-1 flex h-5 w-5 items-center justify-center rounded-full bg-black/60 text-xs text-white"
							>✕</button
						>
					</div>
				{/each}
				{#if photoFiles.length < 10}
					<label
						class="flex h-20 w-20 cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-gray-200 text-gray-400 hover:border-orange-300"
					>
						<span class="text-2xl">+</span>
						<span class="text-xs">Photo</span>
						<input
							type="file"
							accept="image/jpeg,image/png,image/webp,image/heic"
							multiple
							class="hidden"
							onchange={handlePhotoChange}
						/>
					</label>
				{/if}
			</div>
			<p class="mt-2 text-xs text-gray-400">Max 10 photos · JPEG, PNG, WebP, HEIC</p>
		</section>

		{#if aiLoading}
			<div class="flex items-center gap-2 rounded-xl bg-orange-50 p-3 text-sm text-orange-700">
				<span class="animate-spin">⟳</span> Identifying breed…
			</div>
		{:else if aiSuggestion && !aiDismissed}
			<div class="rounded-xl border border-orange-200 bg-orange-50 p-3">
				<p class="text-sm font-medium text-orange-800">
					🤖 AI thinks this is a <strong>{aiSuggestion.breed}</strong>
					<span class="text-xs font-normal text-orange-600"
						>({Math.round(aiSuggestion.confidence * 100)}% confident)</span
					>
				</p>
				<div class="mt-2 flex gap-2">
					<button
						onclick={() => {
							if (aiSuggestion) breed = aiSuggestion.breed;
						}}
						class="rounded-lg bg-orange-500 px-3 py-1 text-xs font-semibold text-white"
						>Use this</button
					>
					<button
						onclick={() => {
							aiDismissed = true;
							aiSuggestion = null;
						}}
						class="rounded-lg border border-orange-200 px-3 py-1 text-xs text-orange-700"
						>Dismiss</button
					>
				</div>
			</div>
		{/if}

		{#if !isNewSighting}
			<section class="rounded-2xl bg-white p-4 shadow-sm">
				<h2 class="mb-3 text-sm font-semibold text-gray-700">
					Species <span class="text-red-400">*</span>
				</h2>
				<div class="flex flex-wrap gap-2">
					{#each COMMON_SPECIES as s (s)}
						<button
							onclick={() => {
								species = s;
								customSpecies = '';
							}}
							class="rounded-full px-3 py-1.5 text-sm {species === s
								? 'bg-orange-500 text-white'
								: 'bg-gray-100 text-gray-700 hover:bg-gray-200'}">{s}</button
						>
					{/each}
					<button
						onclick={() => {
							species = '__custom__';
						}}
						class="rounded-full px-3 py-1.5 text-sm {species === '__custom__'
							? 'bg-orange-500 text-white'
							: 'bg-gray-100 text-gray-700 hover:bg-gray-200'}">Other…</button
					>
				</div>
				{#if species === '__custom__'}
					<input
						bind:value={customSpecies}
						placeholder="Enter species"
						class="mt-3 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-orange-400"
					/>
				{/if}
			</section>

			<section class="rounded-2xl bg-white p-4 shadow-sm">
				<h2 class="mb-1 text-sm font-semibold text-gray-700">
					Breed <span class="text-xs font-normal text-gray-400">(optional)</span>
				</h2>
				<input
					bind:value={breed}
					placeholder="e.g. Golden Retriever"
					class="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-orange-400"
				/>
			</section>

			<section class="space-y-3 rounded-2xl bg-white p-4 shadow-sm">
				<div>
					<h2 class="mb-1 text-sm font-semibold text-gray-700">
						Animal name <span class="text-xs font-normal text-gray-400">(optional)</span>
					</h2>
					<input
						bind:value={animalName}
						placeholder="e.g. Fluffy"
						class="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-orange-400"
					/>
				</div>
				<div>
					<h2 class="mb-1 text-sm font-semibold text-gray-700">
						Description <span class="text-xs font-normal text-gray-400">(optional)</span>
					</h2>
					<textarea
						bind:value={description}
						placeholder="Behaviour, features, context…"
						rows="3"
						class="w-full resize-none rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-orange-400"
					></textarea>
				</div>
			</section>
		{/if}

		<section class="space-y-3 rounded-2xl bg-white p-4 shadow-sm">
			<div>
				<h2 class="mb-1 text-sm font-semibold text-gray-700">
					When did you see it? <span class="text-red-400">*</span>
				</h2>
				<input
					type="datetime-local"
					bind:value={seenAt}
					max={new Date().toISOString().slice(0, 16)}
					class="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-orange-400"
				/>
			</div>
			<div>
				<h2 class="mb-1 text-sm font-semibold text-gray-700">
					Your name <span class="text-xs font-normal text-gray-400">(optional)</span>
				</h2>
				<input
					bind:value={reporterName}
					placeholder="Saved for next time"
					class="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-orange-400"
				/>
			</div>
		</section>

		<section class="rounded-2xl bg-white p-4 shadow-sm">
			<h2 class="mb-2 text-sm font-semibold text-gray-700">
				Location <span class="text-red-400">*</span>
			</h2>
			{#if locationLoading}
				<div
					class="flex h-40 items-center justify-center rounded-xl bg-gray-100 text-sm text-gray-400"
				>
					Getting your location…
				</div>
			{:else if lat !== null}
				<div bind:this={mapContainer} class="h-48 w-full overflow-hidden rounded-xl"></div>
				<p class="mt-2 text-xs text-gray-400">Drag the pin to fine-tune (max 30 km from you).</p>
			{/if}
		</section>

		{#if submitError}
			<div class="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
				{submitError}
			</div>
		{/if}

		<button
			onclick={submit}
			disabled={submitting || !!locationError || lat === null}
			class="w-full rounded-xl bg-orange-500 py-3 font-semibold text-white hover:bg-orange-600 disabled:cursor-not-allowed disabled:opacity-50"
		>
			{submitting ? 'Submitting…' : isNewSighting ? 'Submit sighting' : 'Register animal'}
		</button>

		<p class="pb-8 text-center text-xs text-gray-400">
			All submissions are reviewed before appearing on the map.
		</p>
	</div>
</div>
