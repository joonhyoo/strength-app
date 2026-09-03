<script lang="ts">
	import { dev } from '$app/environment';
	import { enhance } from '$app/forms';
	import { tick } from 'svelte';
	import { enhanceReplace } from '$lib/forms';
	import {
		clearCodeSent,
		clearPendingVerify,
		getCooldownAgreed,
		getCooldownRemaining,
		getPendingVerify,
		markCodeSent,
		normalizeEmail,
		setPendingVerify
	} from '$lib/authCodeCooldown';
	import OtpInput from '$lib/components/OtpInput.svelte';
	import AuthHeader from '$lib/components/AuthHeader.svelte';

	interface AuthFormData {
		step?: string;
		email?: string;
		agreed?: boolean;
		message?: string;
		errors?: { email?: string };
	}

	interface Props {
		form: AuthFormData | null | undefined;
		confirmed?: boolean;
	}

	let { form, confirmed = false }: Props = $props();

	let loading = $state(false);
	// svelte-ignore state_referenced_locally -- intentional one-time seed from
	// SSR'd `form`; `emailValue` is then owned by the input's `bind:value`.
	let emailValue = $state(form?.email ?? '');

	// Mirrors `form?.message` for display, except it's set explicitly by each
	// form handler below rather than reactively off `form` — that lets it (a)
	// be dismissed locally (e.g. "Use a different email") without waiting on
	// a new action result, and (b) land in step with the verify form's
	// artificial "Verifying..." delay instead of popping in before the button
	// stops loading. Can't be a `$derived` of `form?.message` — it needs to be
	// manually clearable/settable, which a derived value can't be.
	// svelte-ignore state_referenced_locally -- see above, this is deliberate.
	let errorMessage = $state(form?.message);
	const handleSubmit = enhanceReplace({
		onSubmit: () => (loading = true),
		onDone: () => {
			loading = false;
			errorMessage = form?.message;
		}
	});

	let showEmailStep = $state(false);
	let agreed = $state(false);
	let token = $state('');
	let verifyForm: HTMLFormElement | undefined = $state();

	let resending = $state(false);
	let resendCooldown = $state(0);
	let cooldownEmail = $state('');
	let resendTimer: ReturnType<typeof setInterval> | undefined;

	/** Starts (or resumes, if `remaining` is passed) the visible cooldown countdown. */
	function startResendCooldown(email: string, remaining?: number) {
		cooldownEmail = normalizeEmail(email);
		resendCooldown = remaining ?? 60;
		clearInterval(resendTimer);
		resendTimer = setInterval(() => {
			resendCooldown -= 1;
			if (resendCooldown <= 0) clearInterval(resendTimer);
		}, 1000);
	}

	// Which screen (email vs. code-entry) is plain component state, which a
	// reload wipes — restore it from localStorage so a reload (or the PWA
	// getting backgrounded and reopened) doesn't strand the user back on the
	// email screen mid-verification. See src/lib/authCodeCooldown.ts.
	//
	// Landing here with `confirmed=1` (fresh from /auth/confirmed) takes
	// priority over a leftover pending verification from an earlier visit —
	// otherwise the restored code-entry screen silently hides the "Email
	// confirmed" banner below them, since the two are mutually exclusive.
	// svelte-ignore state_referenced_locally -- `confirmed` reflects the URL
	// at this SSR'd load, a one-time read same as `form` below, not something
	// that changes live within the component's lifetime.
	if (confirmed) clearPendingVerify();
	// svelte-ignore state_referenced_locally -- see above, this is deliberate.
	const pending = confirmed ? null : getPendingVerify();
	let showVerify = $state(!!pending);
	let verifyEmail = $state(pending?.email ?? '');
	let verifyAgreed = $state(pending?.agreed ?? false);
	if (pending) {
		const remaining = getCooldownRemaining(pending.email);
		if (remaining > 0) startResendCooldown(pending.email, remaining);
	}

	function goToVerify(email: string, agreedFlag: boolean) {
		verifyEmail = email;
		verifyAgreed = agreedFlag;
		showVerify = true;
		showEmailStep = false;
		setPendingVerify(email, agreedFlag);
	}

	/**
	 * A code was already sent to `email` recently — resume the cooldown
	 * countdown and send the user straight to the code-entry screen for it
	 * instead of letting them fire off (or get blocked behind) another send.
	 * Returns whether a cooldown was found.
	 */
	function resumeIfCoolingDown(email: string): boolean {
		const remaining = getCooldownRemaining(email);
		if (remaining <= 0) return false;
		startResendCooldown(email, remaining);
		goToVerify(email, getCooldownAgreed(email));
		return true;
	}

	/** Blocks a submit if `email` is still within a prior send's cooldown. */
	function cooldownGuard(email: string): boolean {
		return !resumeIfCoolingDown(email);
	}

	// A `send_code` submission only actually emails a code when the result
	// lands on the verify step without an error message — the "agree to
	// terms" intermediate step (invited-but-not-yet-agreed) sends nothing,
	// and a failed verify_code attempt re-renders {step: 'verify', message}
	// without sending anything either. Only mark+start the resend cooldown
	// for a real send, so the "agree" follow-up submit and retrying a wrong
	// code are never mistaken for a resend — but any time we ARE on the
	// verify step for this email, keep the persisted pending-verify state
	// (via goToVerify) in sync regardless.
	$effect(() => {
		if (form?.step === 'verify' && form?.email) {
			goToVerify(form.email, !!form.agreed);
			if (!form.message) {
				markCodeSent(form.email, !!form.agreed);
				startResendCooldown(form.email);
				token = '';
			}
		}
	});

	const handleVerify = enhanceReplace({
		onSubmit: () => {
			loading = true;
			// Hide any previous error immediately once a new attempt is in
			// flight, so the two don't overlap.
			errorMessage = undefined;
		},
		onDone: () => {
			loading = false;
			errorMessage = form?.message;
		},
		// A redirect here means the OTP verified and the user is being sent
		// past /auth/login entirely — clear the persisted verify state so a
		// logout shortly after doesn't drop them back on this screen instead
		// of the normal sign-in screen.
		onRedirect: () => {
			clearPendingVerify();
			clearCodeSent(verifyEmail);
		}
	});

	const handleResend = enhanceReplace({
		confirm: () => cooldownGuard(verifyEmail),
		onSubmit: () => (resending = true),
		onDone: () => {
			resending = false;
			errorMessage = form?.message;
		}
	});

	const handleSendCode = enhanceReplace({
		confirm: () => cooldownGuard(emailValue),
		onSubmit: () => (loading = true),
		onDone: () => {
			loading = false;
			errorMessage = form?.message;
		},
		// emailValue is bind:value-owned state seeded once from form?.email, not
		// resynced every render — a native reset would blank the DOM without
		// telling it (see src/lib/forms.ts).
		resetOnSuccess: false
	});

	const testAccounts = [
		{ name: 'Coach', email: 'coach@test.com' },
		{ name: 'Anthony', email: 'anthony@test.com' },
		{ name: 'Jack', email: 'jack@test.com' }
	];

	$effect(() => {
		// A fresh verify step (first send, or after "use a different email"
		// + resubmitting) always wins over the local back-navigation flag.
		if (form?.step === 'verify') showEmailStep = false;
	});

	$effect(() => {
		// Clear a stale/wrong code after a failed verify attempt so the user
		// isn't stuck editing digits that already failed.
		if (form?.step === 'verify' && form?.message) token = '';
	});

	async function submitVerify() {
		// The last digit's state change (bindable value -> parent `token` ->
		// the hidden input's DOM value) hasn't been flushed yet at this point —
		// wait for it, or requestSubmit serializes a stale/empty token.
		await tick();
		verifyForm?.requestSubmit();
	}

	function useAnotherEmail() {
		showEmailStep = true;
		showVerify = false;
		token = '';
		errorMessage = undefined;
		clearPendingVerify();
	}
</script>

<div
	class="mx-auto flex min-h-[calc(100dvh-env(safe-area-inset-top))] max-w-md flex-col justify-center px-4 py-6"
>
	<AuthHeader
		title={showVerify && !showEmailStep
			? 'OTP Verification'
			: form?.step === 'agree'
				? 'Confirm to continue'
				: 'Sign in'}
	/>

	{#if confirmed && !(showVerify && !showEmailStep)}
		<p class="mb-2 text-sm text-success">Email confirmed! Sign in to continue.</p>
	{/if}

	{#if errorMessage}
		<div class="mb-4 rounded-lg bg-error/10 p-3 text-center text-sm text-error">
			{errorMessage}
		</div>
	{/if}

	{#if showVerify && !showEmailStep}
		<form
			bind:this={verifyForm}
			method="POST"
			action="/auth/login?/verify_code"
			use:enhance={handleVerify}
			class="flex flex-col items-center gap-4"
		>
			<input type="hidden" name="email" value={verifyEmail} />
			<input type="hidden" name="agreed" value={verifyAgreed ? 'true' : ''} />
			<input type="hidden" name="token" value={token} />
			<p class="text-center text-sm text-base-content/60">
				Enter the code sent to <strong class="text-base-content">{verifyEmail}</strong>
			</p>
			<OtpInput bind:value={token} oncomplete={submitVerify} />
			<button class="btn w-full btn-primary" disabled={loading}>
				{loading ? 'Verifying...' : 'Verify'}
			</button>
		</form>

		<div class="mt-5 flex items-center justify-center gap-3 text-xs">
			<button type="button" class="link text-base-content/60 link-hover" onclick={useAnotherEmail}>
				Use a different email
			</button>
			<span class="text-base-content/20">·</span>
			<form method="POST" action="/auth/login?/send_code" use:enhance={handleResend}>
				<input type="hidden" name="email" value={verifyEmail} />
				<input type="hidden" name="agreed" value={verifyAgreed ? 'true' : ''} />
				<button
					class="link text-base-content/60 link-hover disabled:text-base-content/30 disabled:no-underline"
					disabled={resendCooldown > 0 && cooldownEmail === normalizeEmail(verifyEmail)}
				>
					{resending
						? 'Sending...'
						: resendCooldown > 0 && cooldownEmail === normalizeEmail(verifyEmail)
							? `Resend code (${resendCooldown}s)`
							: 'Resend code'}
				</button>
			</form>
		</div>
	{:else}
		<!-- Email OTP -->
		<form
			method="POST"
			action="/auth/login?/send_code"
			use:enhance={handleSendCode}
			class="mb-6 flex flex-col gap-3"
		>
			<input
				name="email"
				type="email"
				bind:value={emailValue}
				placeholder="Your email"
				class="input w-full"
				required
			/>
			{#if form?.errors?.email}
				<span class="text-xs text-error">{form.errors.email}</span>
			{/if}

			{#if form?.step === 'agree'}
				<label class="label cursor-pointer justify-start gap-2">
					<input
						type="checkbox"
						name="agreed"
						value="true"
						bind:checked={agreed}
						class="checkbox checkbox-sm"
						required
					/>
					<span class="text-xs">
						I agree to the
						<a href="https://hyuji.dev/privacy" target="_blank" rel="noopener" class="link"
							>Privacy Policy</a
						>
						and
						<a href="https://hyuji.dev/terms" target="_blank" rel="noopener" class="link"
							>Terms of Service</a
						>
					</span>
				</label>
			{/if}

			<button class="btn w-full btn-primary" disabled={loading}>
				{#if loading}
					{form?.step === 'agree' ? 'Continuing...' : 'Sending...'}
				{:else}
					{form?.step === 'agree' ? 'Continue' : 'Next'}
				{/if}
			</button>
		</form>

		{#if dev}
			<!-- Quick login (testing only) -->
			<div class="border-t border-base-300 pt-6">
				<p
					class="mb-3 text-center text-xs font-semibold tracking-widest text-base-content/40 uppercase"
				>
					Test Accounts
				</p>
				<div class="flex flex-col gap-2">
					{#each testAccounts as account (account.email)}
						<form method="POST" action="/auth/login?/quick_login" use:enhance={handleSubmit}>
							<input type="hidden" name="email" value={account.email} />
							<button class="btn w-full justify-between btn-outline">
								<span>{account.name}</span>
								<span class="text-xs text-base-content/40">{account.email}</span>
							</button>
						</form>
					{/each}
				</div>
			</div>
		{/if}
	{/if}
</div>
