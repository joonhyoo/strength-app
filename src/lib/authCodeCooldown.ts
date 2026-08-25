/**
 * Persists two bits of the /auth/login OTP flow across page loads, since
 * AuthForm.svelte's own step (email vs. verify) is plain component `$state`
 * that a reload wipes:
 *  - "a code was sent to this email" — the resend cooldown.
 *  - "the user is mid-verification for this email" — which screen to show.
 */

export const RESEND_COOLDOWN_SECONDS = 60;

export function normalizeEmail(email: string) {
	return email.trim().toLowerCase();
}

function cooldownKey(email: string) {
	return `auth-code-sent:${normalizeEmail(email)}`;
}

interface CooldownInfo {
	sentAt: number;
	agreed: boolean;
}

function readCooldown(email: string): CooldownInfo | null {
	if (!email || typeof localStorage === 'undefined') return null;
	try {
		const raw = localStorage.getItem(cooldownKey(email));
		if (!raw) return null;
		const parsed = JSON.parse(raw) as Partial<CooldownInfo>;
		return parsed?.sentAt ? { sentAt: parsed.sentAt, agreed: !!parsed.agreed } : null;
	} catch {
		return null;
	}
}

/** Seconds remaining in the cooldown for `email`, or 0 if none/expired/unavailable. */
export function getCooldownRemaining(email: string): number {
	const info = readCooldown(email);
	if (!info) return 0;
	return Math.max(0, RESEND_COOLDOWN_SECONDS - Math.floor((Date.now() - info.sentAt) / 1000));
}

/** The `agreed` flag recorded alongside the cooldown for `email`, if any. */
export function getCooldownAgreed(email: string): boolean {
	return readCooldown(email)?.agreed ?? false;
}

export function markCodeSent(email: string, agreed: boolean) {
	if (typeof localStorage === 'undefined') return;
	try {
		localStorage.setItem(cooldownKey(email), JSON.stringify({ sentAt: Date.now(), agreed }));
	} catch {
		// Storage unavailable (private mode, quota) — cooldown just won't persist across reload.
	}
}

/** Clears the resend cooldown for `email` — e.g. once its code has been used to log in. */
export function clearCodeSent(email: string) {
	if (typeof localStorage === 'undefined') return;
	try {
		localStorage.removeItem(cooldownKey(email));
	} catch {
		// Nothing to do — best-effort cleanup only.
	}
}

const PENDING_VERIFY_KEY = 'auth-pending-verify';
// Matches supabase/config.toml's `[auth.email] otp_expiry` — no point resuming
// the code-entry screen for a code that's already expired server-side.
const PENDING_VERIFY_TTL_SECONDS = 60 * 60;

interface PendingVerify {
	email: string;
	agreed: boolean;
}

/** The email (and its `agreed` flag) currently mid-verification, if any and not yet expired. */
export function getPendingVerify(): PendingVerify | null {
	if (typeof localStorage === 'undefined') return null;
	try {
		const raw = localStorage.getItem(PENDING_VERIFY_KEY);
		if (!raw) return null;
		const parsed = JSON.parse(raw) as { email?: string; agreed?: boolean; sentAt?: number };
		if (!parsed?.email || !parsed.sentAt) return null;
		if (Date.now() - parsed.sentAt > PENDING_VERIFY_TTL_SECONDS * 1000) return null;
		return { email: parsed.email, agreed: !!parsed.agreed };
	} catch {
		return null;
	}
}

export function setPendingVerify(email: string, agreed: boolean) {
	if (typeof localStorage === 'undefined') return;
	try {
		localStorage.setItem(PENDING_VERIFY_KEY, JSON.stringify({ email, agreed, sentAt: Date.now() }));
	} catch {
		// Storage unavailable — just won't survive a reload.
	}
}

export function clearPendingVerify() {
	if (typeof localStorage === 'undefined') return;
	try {
		localStorage.removeItem(PENDING_VERIFY_KEY);
	} catch {
		// Nothing to do — best-effort cleanup only.
	}
}
