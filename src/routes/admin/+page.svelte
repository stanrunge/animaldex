<script lang="ts">
	import type { PageData } from './$types';
	import { invalidateAll } from '$app/navigation';
	import { resolve } from '$app/paths';

	let { data }: { data: PageData } = $props();

	let password = $state('');
	let loginError = $state('');
	let loginLoading = $state(false);

	async function login() {
		loginLoading = true;
		loginError = '';
		const res = await fetch('/admin/login', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ password })
		});
		if (res.ok) {
			await invalidateAll();
		} else {
			loginError = 'Wrong password';
		}
		loginLoading = false;
	}

	let actionLoading = $state<string | null>(null);

	async function moderate(type: 'animals' | 'sightings', id: string, action: 'accept' | 'deny') {
		actionLoading = `${type}-${id}-${action}`;
		await fetch(`/api/${type}/${id}/moderate`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ action })
		});
		actionLoading = null;
		await invalidateAll();
	}

	const queue = $derived(data.queue ?? []);
</script>

<svelte:head><title>Animaldex - Admin</title></svelte:head>

{#if !data.admin}
	<div class="flex min-h-screen items-center justify-center bg-gray-50">
		<div class="w-80 rounded-2xl bg-white p-8 shadow-xl">
			<h1 class="mb-6 text-xl font-semibold text-gray-900">Admin login</h1>
			<input
				type="password"
				bind:value={password}
				placeholder="Password"
				onkeydown={(e) => e.key === 'Enter' && login()}
				class="mb-3 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-orange-400"
			/>
			{#if loginError}
				<p class="mb-3 text-xs text-red-500">{loginError}</p>
			{/if}
			<button
				onclick={login}
				disabled={loginLoading}
				class="w-full rounded-lg bg-orange-500 py-2 text-sm font-semibold text-white hover:bg-orange-600 disabled:opacity-50"
			>
				{loginLoading ? 'Logging in…' : 'Log in'}
			</button>
		</div>
	</div>
{:else}
	<div class="min-h-screen bg-gray-50">
		<div
			class="sticky top-0 z-10 flex items-center justify-between border-b border-gray-100 bg-white px-6 py-3"
		>
			<div class="flex items-center gap-3">
				<a href={resolve('/')} class="text-gray-400 hover:text-gray-600">←</a>
				<h1 class="font-semibold text-gray-900">Animaldex admin</h1>
			</div>
			<span class="rounded-full bg-orange-100 px-2 py-0.5 text-xs font-medium text-orange-700">
				{queue.filter((r) => !r.acceptedAt && !r.deniedAt).length} pending
			</span>
		</div>

		<div class="mx-auto max-w-3xl space-y-4 px-4 py-6">
			{#if queue.length === 0}
				<div class="rounded-2xl bg-white p-8 text-center text-gray-400 shadow-sm">
					No submissions yet
				</div>
			{/if}

			{#each queue as item (item.animalId)}
				{@const status = item.acceptedAt ? 'accepted' : item.deniedAt ? 'denied' : 'pending'}
				<div
					class="overflow-hidden rounded-2xl bg-white shadow-sm {status === 'denied'
						? 'opacity-60'
						: ''}"
				>
					<div class="flex gap-4 p-4">
						<div class="h-24 w-24 shrink-0 overflow-hidden rounded-xl bg-gray-100">
							{#if item.photoUrl}
								<img src={item.photoUrl} alt="" class="h-full w-full object-cover" />
							{:else}
								<div class="flex h-full items-center justify-center text-2xl">🐾</div>
							{/if}
						</div>
						<div class="min-w-0 flex-1">
							<div class="flex items-start justify-between gap-2">
								<div>
									<p class="font-semibold text-gray-900">{item.animalName ?? item.species}</p>
									<p class="text-sm text-gray-500">
										{item.species}{item.breed ? ` · ${item.breed}` : ''}
									</p>
								</div>
								<span
									class="shrink-0 rounded-full px-2 py-0.5 text-xs font-medium
									{status === 'accepted'
										? 'bg-green-100 text-green-700'
										: status === 'denied'
											? 'bg-red-100 text-red-700'
											: 'bg-yellow-100 text-yellow-700'}"
								>
									{status}
								</span>
							</div>
							{#if item.aiBreedSuggestion}
								<p class="mt-1 text-xs text-gray-400">
									🤖 AI: {item.aiBreedSuggestion} ({Math.round(
										(item.aiBreedConfidence ?? 0) * 100
									)}%)
								</p>
							{/if}
							<p class="mt-1 text-xs text-gray-400">
								{new Date(item.submittedAt).toLocaleDateString('nl-NL', {
									day: 'numeric',
									month: 'short',
									year: 'numeric',
									hour: '2-digit',
									minute: '2-digit'
								})}
								{#if item.reporterName}· by {item.reporterName}{/if}
							</p>
							<p class="mt-0.5 text-xs text-gray-400">
								📍 {item.sightingLat.toFixed(5)}, {item.sightingLng.toFixed(5)}
							</p>
						</div>
					</div>
					<div class="flex gap-2 border-t border-gray-100 px-4 py-3">
						<button
							onclick={() => moderate('animals', item.animalId, 'accept')}
							disabled={actionLoading !== null || status === 'accepted'}
							class="flex-1 rounded-lg py-1.5 text-sm font-medium {status === 'accepted'
								? 'cursor-default bg-green-100 text-green-700'
								: 'bg-gray-100 text-gray-700 hover:bg-green-100 hover:text-green-700'}"
						>
							{actionLoading === `animals-${item.animalId}-accept` ? '…' : '✓ Accept'}
						</button>
						<button
							onclick={() => moderate('animals', item.animalId, 'deny')}
							disabled={actionLoading !== null || status === 'denied'}
							class="flex-1 rounded-lg py-1.5 text-sm font-medium {status === 'denied'
								? 'cursor-default bg-red-100 text-red-700'
								: 'bg-gray-100 text-gray-700 hover:bg-red-100 hover:text-red-700'}"
						>
							{actionLoading === `animals-${item.animalId}-deny` ? '…' : '✕ Deny'}
						</button>
					</div>
				</div>
			{/each}
		</div>
	</div>
{/if}
