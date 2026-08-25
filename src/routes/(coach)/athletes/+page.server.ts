import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { adminClient } from '$lib/server/supabaseAdmin';

export const load: PageServerLoad = async ({ locals: { supabase } }) => {
	// `athletes` comes from the (coach) layout's load and is merged into
	// page data automatically — no need to re-fetch it here. Streamed (not
	// awaited) so the page shell renders before this resolves.
	//
	// Reads the coach id directly from getClaims() rather than `parent()`:
	// calling `parent()` here would force the root + coach layout loads to
	// actually re-execute on every navigation to this page (their own
	// getClaims()/profile/athletes queries), even when SvelteKit's client-side
	// invalidation logic says they should be skipped since nothing changed.
	const { data: claimsData } = await supabase.auth.getClaims();
	const coachId = claimsData?.claims?.sub;

	return {
		pendingInvites: coachId
			? supabase
					.from('coach_invites')
					.select('id, email, created_at')
					.eq('coach_id', coachId)
					.order('created_at', { ascending: false })
					.then(({ data }) => data ?? [])
			: Promise.resolve([])
	};
};

export const actions: Actions = {
	invite_athlete: async ({ request, url, locals: { supabase } }) => {
		const formData = await request.formData();
		const email = (formData.get('email') as string)?.trim();

		if (!email) return fail(400, { message: 'Enter an email address.', action: 'invite_athlete' });

		const { error } = await supabase.rpc('invite_athlete', { p_email: email });

		if (error) {
			const message =
				error.message === 'already_registered'
					? 'That email already has an account.'
					: error.message === 'invalid_email'
						? 'Please enter a valid email address.'
						: error.message === 'already_invited_by_another_coach'
							? 'That email is already invited by another coach.'
							: 'Could not send invite. Please try again.';
			return fail(400, { message, action: 'invite_athlete' });
		}

		// Best-effort — the coach_invites row above is what actually gates
		// account creation, so a failure here (e.g. re-inviting an email whose
		// auth.users row already exists from a prior, still-unconfirmed invite)
		// doesn't need to fail the whole action: the athlete can still self-serve
		// via /auth/login's existing send_code flow even without this email.
		const admin = adminClient();
		const { error: emailError } = await admin.auth.admin.inviteUserByEmail(email, {
			redirectTo: `${url.origin}/auth/confirmed`
		});

		if (emailError) {
			console.error('inviteUserByEmail failed:', emailError);
			return {
				message: 'Invite created, but the confirmation email may not have sent.',
				action: 'invite_athlete'
			};
		}
	},

	revoke_invite: async ({ request, locals: { supabase } }) => {
		const formData = await request.formData();
		const email = formData.get('email') as string;
		if (email) await supabase.rpc('revoke_invite', { p_email: email });
	},

	remove_athlete: async ({ request, locals: { supabase } }) => {
		const formData = await request.formData();
		const athleteId = formData.get('athlete_id') as string;

		if (!athleteId) return fail(400, { message: 'Missing athlete.', action: 'remove_athlete' });

		const { error } = await supabase.rpc('remove_athlete', { p_athlete_id: athleteId });

		if (error) {
			return fail(400, {
				message: 'Could not remove athlete. Please try again.',
				action: 'remove_athlete'
			});
		}
	}
};
