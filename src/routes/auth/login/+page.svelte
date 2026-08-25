<script lang="ts">
	import AuthForm from '$lib/components/AuthForm.svelte';
	import type { ActionData } from './$types.js';

	interface Props {
		form: ActionData;
	}

	let { form }: Props = $props();
</script>

<svelte:head>
	<title>Strength App — Sign In</title>
</svelte:head>

<AuthForm {form} />
