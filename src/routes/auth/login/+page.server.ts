import { dev } from '$app/environment';
import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { roleHome, roleHomeFor } from '$lib/guards';
import { adminClient } from '$lib/server/supabaseAdmin';

export const load: PageServerLoad = async ({ parent, url }) => {
	const { user } = await parent();
	if (user) redirect(303, roleHome(user.role));
	return { confirmed: url.searchParams.get('confirmed') === '1' };
};

export const actions: Actions = {
	quick_login: async ({ request, locals: { supabase } }) => {
		if (!dev) return fail(404, { message: 'Not found' });

		const formData = await request.formData();
		const email = formData.get('email') as string;

		// Test accounts have unique, unknown passwords, so we can't sign in with
		// signInWithPassword. Instead, use the service-role key (dev-only, never
		// set in prod) to mint a magic-link token, then redeem it through the
		// normal verifyOtp flow so the session cookies get set correctly.
		const admin = adminClient();

		const { data, error: linkError } = await admin.auth.admin.generateLink({
			type: 'magiclink',
			email
		});

		if (linkError || !data.properties?.hashed_token) {
			return fail(400, { message: 'Quick login failed' });
		}

		const { data: otpData, error } = await supabase.auth.verifyOtp({
			type: 'magiclink',
			token_hash: data.properties.hashed_token
		});

		if (error || !otpData.user) {
			return fail(400, { message: 'Quick login failed' });
		}

		redirect(303, await roleHomeFor(supabase, otpData.user.id));
	},

	send_code: async ({ request, locals: { supabase } }) => {
		const formData = await request.formData();
		const email = (formData.get('email') as string)?.trim();
		const agreed = formData.get('agreed') === 'true';
		const validEmail = /^[\w.+-]+@([\w-]+\.)+[\w-]{2,8}$/.test(email);

		if (!validEmail) {
			return fail(400, { errors: { email: 'Please enter a valid email address' }, email });
		}

		// Account creation is gated on a pending invite, not on which page the
		// user is on — checked server-side via the service-role key so this
		// lookup isn't exposed as a public RPC (which would let anyone
		// enumerate invited emails via supabase.rpc(...) from a browser console).
		const admin = adminClient();

		const { data: invite, error: inviteError } = await admin
			.from('coach_invites')
			.select('id')
			.eq('email', email.toLowerCase())
			.maybeSingle();

		// Fail closed on a lookup error (treated as "not invited"), but log it —
		// silently swallowing this would look identical to "no invite exists"
		// and hide a real bug (e.g. a missing grant) behind a normal-looking
		// rejection message.
		if (inviteError) {
			console.error('coach_invites lookup failed:', inviteError);
		}

		const invited = !!invite;

		if (invited && !agreed) {
			// Not an error — the same form re-renders with the agreement
			// checkbox added. An existing (non-invited) email never hits this.
			return { step: 'agree', email };
		}

		const { error } = await supabase.auth.signInWithOtp({
			email,
			options: { shouldCreateUser: invited }
		});

		if (error) {
			return fail(400, {
				message: invited
					? 'Failed to send code. Please try again.'
					: "We couldn't sign you in — if you're new, ask your coach to invite you first.",
				email
			});
		}

		return { step: 'verify', email, agreed: invited };
	},

	verify_code: async ({ request, locals: { supabase } }) => {
		const formData = await request.formData();
		const email = formData.get('email') as string;
		const token = formData.get('token') as string;
		const agreed = formData.get('agreed') === 'true';

		if (!token) {
			return fail(400, { step: 'verify', email, agreed, message: 'Please enter the code.' });
		}

		const { data: otpData, error } = await supabase.auth.verifyOtp({ email, token, type: 'email' });

		if (error || !otpData.user) {
			return fail(400, {
				step: 'verify',
				email,
				agreed,
				message: 'Invalid code. Please try again.'
			});
		}

		if (agreed) {
			// Only now — after the OTP is actually verified, proving the athlete
			// owns this inbox — do we link them to the inviting coach. Doing
			// this any earlier (e.g. at account-creation/send_code time) would
			// let anyone who merely knows an invited email consume the invite
			// without ever confirming it.
			await supabase.rpc('claim_invite');
			await supabase.rpc('accept_terms');
		}

		redirect(303, await roleHomeFor(supabase, otpData.user.id));
	},

	logout: async ({ locals: { supabase } }) => {
		await supabase.auth.signOut();
		redirect(303, '/auth/login');
	}
};
