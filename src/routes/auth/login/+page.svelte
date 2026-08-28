<script lang="ts">
	import AuthForm from '$lib/components/AuthForm.svelte';
	import type { ActionData, PageData } from './$types.js';

	interface Props {
		data: PageData;
		form: ActionData;
	}

	let { data, form }: Props = $props();
</script>

<svelte:head>
	<title>Strength App — Sign In</title>
</svelte:head>

<AuthForm confirmed={data.confirmed} {form} />
