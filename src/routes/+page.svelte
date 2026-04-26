<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { resolve } from '$app/paths';
	import type { Map as MaptilerMap, Marker as MaptilerMarker } from '@maptiler/sdk';

	interface TrailPoint {
		id: string;
		lat: number;
		lng: number;
		seenAt: string;
		reporterName: string | null;
		photoUrl: string | null;
	}

	interface AnimalFeatureProps {
		animalId: string;
		species: string;
		breed: string | null;
		animalName: string | null;
		sightingCount: number;
		trail: string | TrailPoint[];
	}

	interface GeoJSONFeature {
		type: 'Feature';
		geometry: { type: 'Point'; coordinates: [number, number] };
		properties: AnimalFeatureProps;
	}

	let mapContainer: HTMLDivElement;
	let map: MaptilerMap | null = null;
	let htmlMarkers: MaptilerMarker[] = [];
	let MapMarker: typeof MaptilerMarker | null = null;

	let filterSpecies = $state('');
	let filterBreed = $state('');
	let filterName = $state('');
	let filterReporter = $state('');
	let filterFrom = $state('');
	let filterTo = $state('');
	let showFilters = $state(false);

	let selected = $state<{
		animalId: string;
		species: string;
		breed: string | null;
		animalName: string | null;
		sightingCount: number;
		trail: TrailPoint[];
	} | null>(null);

	function parseTrail(raw: string | TrailPoint[]): TrailPoint[] {
		return typeof raw === 'string' ? JSON.parse(raw) : raw;
	}

	onMount(async () => {
		const { Map, Marker, config } = await import('@maptiler/sdk');
		const { PUBLIC_MAPTILER_API_KEY } = await import('$env/static/public');

		config.apiKey = PUBLIC_MAPTILER_API_KEY;
		MapMarker = Marker;

		const initMap = (center: [number, number], zoom: number) => {
			map = new Map({
				container: mapContainer,
				style: 'https://api.maptiler.com/maps/satellite/style.json?key=' + PUBLIC_MAPTILER_API_KEY,
				center,
				zoom
			});

			map.on('load', () => {
				map!.addSource('trails', {
					type: 'geojson',
					data: { type: 'FeatureCollection', features: [] }
				});
				map!.addLayer({
					id: 'trails',
					type: 'line',
					source: 'trails',
					paint: {
						'line-color': '#f97316',
						'line-width': 2,
						'line-dasharray': [2, 2],
						'line-opacity': 0.7
					}
				});
				loadMarkers(Marker);
			});

			map.on('moveend', () => {
				if (MapMarker) loadMarkers(MapMarker);
			});
		};

		navigator.geolocation.getCurrentPosition(
			(pos) => initMap([pos.coords.longitude, pos.coords.latitude], 13),
			() => initMap([4.708, 52.009], 15.5),
			{ enableHighAccuracy: true, timeout: 5000 }
		);
	});

	onDestroy(() => {
		htmlMarkers.forEach((m) => m.remove());
		map?.remove();
	});

	async function loadMarkers(Marker: typeof MaptilerMarker) {
		if (!map) return;
		const bounds = map.getBounds();
		// eslint-disable-next-line svelte/prefer-svelte-reactivity
		const params = new URLSearchParams({
			minLat: String(bounds.getSouth()),
			minLng: String(bounds.getWest()),
			maxLat: String(bounds.getNorth()),
			maxLng: String(bounds.getEast())
		});
		if (filterSpecies) params.set('species', filterSpecies);
		if (filterBreed) params.set('breed', filterBreed);
		if (filterName) params.set('name', filterName);
		if (filterReporter) params.set('reporter', filterReporter);
		if (filterFrom) params.set('fromDate', new Date(filterFrom).toISOString());
		if (filterTo) params.set('toDate', new Date(filterTo).toISOString());

		const res = await fetch(`/api/map?${params}`);
		if (!res.ok) return;
		const geojson: { features: GeoJSONFeature[] } = await res.json();

		htmlMarkers.forEach((m) => m.remove());
		htmlMarkers = [];

		const lineFeatures = geojson.features
			.filter((f) => parseTrail(f.properties.trail).length > 1)
			.map((f) => {
				const trail = parseTrail(f.properties.trail);
				return {
					type: 'Feature' as const,
					geometry: {
						type: 'LineString' as const,
						coordinates: [...trail]
							.sort((a, b) => new Date(a.seenAt).getTime() - new Date(b.seenAt).getTime())
							.map((s) => [s.lng, s.lat])
					},
					properties: {}
				};
			});

		const trailSource = map?.getSource('trails');
		// @ts-expect-error setData exists on GeoJSONSource
		trailSource?.setData({ type: 'FeatureCollection', features: lineFeatures });

		for (const feature of geojson.features) {
			const props = feature.properties;
			const trail = parseTrail(props.trail);
			const photoUrl = trail[0]?.photoUrl ?? null;

			const el = document.createElement('div');
			el.style.cssText = `
				width: 44px; height: 44px; border-radius: 50%;
				border: 3px solid white;
				box-shadow: 0 2px 8px rgba(0,0,0,0.4);
				cursor: pointer; overflow: hidden;
				background: #f97316;
			`;
			if (photoUrl) {
				el.style.backgroundImage = `url(${photoUrl})`;
				el.style.backgroundSize = 'cover';
				el.style.backgroundPosition = 'center';
			} else {
				el.innerHTML = `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;font-size:18px">🐾</div>`;
			}

			el.onclick = () => {
				selected = {
					animalId: props.animalId,
					species: props.species,
					breed: props.breed,
					animalName: props.animalName,
					sightingCount: props.sightingCount,
					trail
				};
			};

			const marker = new Marker({ element: el })
				.setLngLat(feature.geometry.coordinates)
				.addTo(map!);
			htmlMarkers.push(marker);
		}
	}

	function applyFilters() {
		showFilters = false;
		if (MapMarker) loadMarkers(MapMarker);
	}
	function clearFilters() {
		filterSpecies = '';
		filterBreed = '';
		filterName = '';
		filterReporter = '';
		filterFrom = '';
		filterTo = '';
		if (MapMarker) loadMarkers(MapMarker);
	}

	const activeFilterCount = $derived(
		[filterSpecies, filterBreed, filterName, filterReporter, filterFrom, filterTo].filter(Boolean)
			.length
	);
</script>

<svelte:head>
	<title>Animaldex</title>
	<link rel="stylesheet" href="https://cdn.maptiler.com/maptiler-sdk-js/latest/maptiler-sdk.css" />
</svelte:head>

<div class="relative h-screen w-full overflow-hidden">
	<div bind:this={mapContainer} class="h-full w-full"></div>

	<div class="absolute top-4 left-1/2 z-10 flex -translate-x-1/2 gap-2">
		<a
			href={resolve('/register')}
			class="flex items-center gap-2 rounded-full bg-orange-500 px-4 py-2 text-sm font-semibold text-white shadow-lg hover:bg-orange-600"
		>
			+ Log a sighting
		</a>
		<button
			onclick={() => (showFilters = !showFilters)}
			class="relative rounded-full bg-white px-4 py-2 text-sm font-semibold text-gray-700 shadow-lg hover:bg-gray-50"
		>
			Filters
			{#if activeFilterCount > 0}
				<span
					class="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-orange-500 text-[10px] text-white"
					>{activeFilterCount}</span
				>
			{/if}
		</button>
	</div>

	{#if showFilters}
		<div
			class="absolute top-16 left-1/2 z-20 w-80 -translate-x-1/2 rounded-2xl bg-white p-4 shadow-xl"
		>
			<div class="mb-3 flex items-center justify-between">
				<h2 class="font-semibold text-gray-800">Filter sightings</h2>
				<button onclick={() => (showFilters = false)} class="text-gray-400 hover:text-gray-600"
					>✕</button
				>
			</div>
			<div class="space-y-2">
				<input
					bind:value={filterSpecies}
					placeholder="Species"
					class="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-orange-400"
				/>
				<input
					bind:value={filterBreed}
					placeholder="Breed"
					class="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-orange-400"
				/>
				<input
					bind:value={filterName}
					placeholder="Animal name"
					class="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-orange-400"
				/>
				<input
					bind:value={filterReporter}
					placeholder="Reporter name"
					class="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-orange-400"
				/>
				<div class="grid grid-cols-2 gap-2">
					<div>
						<label for="filter-from" class="mb-1 block text-xs text-gray-500">From</label>
						<input
							id="filter-from"
							type="date"
							bind:value={filterFrom}
							class="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-orange-400"
						/>
					</div>
					<div>
						<label for="filter-to" class="mb-1 block text-xs text-gray-500">To</label>
						<input
							id="filter-to"
							type="date"
							bind:value={filterTo}
							class="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-orange-400"
						/>
					</div>
				</div>
			</div>
			<div class="mt-3 flex gap-2">
				<button
					onclick={applyFilters}
					class="flex-1 rounded-lg bg-orange-500 py-2 text-sm font-semibold text-white hover:bg-orange-600"
					>Apply</button
				>
				<button
					onclick={clearFilters}
					class="rounded-lg border border-gray-200 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50"
					>Clear</button
				>
			</div>
		</div>
	{/if}

	{#if selected}
		<div class="absolute right-4 bottom-8 z-10 w-80 overflow-hidden rounded-2xl bg-white shadow-xl">
			{#if selected.trail[0]?.photoUrl}
				<div class="relative h-40 bg-gray-100">
					<img src={selected.trail[0].photoUrl} alt="" class="h-full w-full object-cover" />
					<button
						onclick={() => (selected = null)}
						class="absolute top-2 right-2 flex h-7 w-7 items-center justify-center rounded-full bg-black/50 text-white"
						>✕</button
					>
				</div>
			{/if}
			<div class="p-4">
				<div class="mb-1 flex items-start justify-between">
					<div>
						<p class="text-lg font-semibold text-gray-900">
							{selected.animalName ?? selected.species}
						</p>
						<p class="text-sm text-gray-500">
							{selected.species}{selected.breed ? ` · ${selected.breed}` : ''}
						</p>
					</div>
					<span class="rounded-full bg-orange-100 px-2 py-0.5 text-xs font-medium text-orange-700"
						>{selected.sightingCount}
						{selected.sightingCount === 1 ? 'sighting' : 'sightings'}</span
					>
				</div>
				<div class="mt-3 max-h-36 space-y-1.5 overflow-y-auto">
					{#each [...selected.trail].sort((a, b) => new Date(b.seenAt).getTime() - new Date(a.seenAt).getTime()) as s (s.id)}
						<div class="flex items-center justify-between rounded-lg bg-gray-50 px-3 py-2 text-xs">
							<span class="text-gray-600"
								>{new Date(s.seenAt).toLocaleDateString('nl-NL', {
									day: 'numeric',
									month: 'short',
									year: 'numeric'
								})}</span
							>
							{#if s.reporterName}<span class="text-gray-400">by {s.reporterName}</span>{/if}
						</div>
					{/each}
				</div>
				<a
					href={resolve(`/register?animalId=${selected.animalId}`)}
					class="mt-3 block w-full rounded-lg bg-orange-500 py-2 text-center text-sm font-semibold text-white hover:bg-orange-600"
				>
					I saw this animal too!
				</a>
			</div>
		</div>
	{/if}
</div>
