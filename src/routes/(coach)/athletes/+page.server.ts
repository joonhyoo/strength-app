import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals: { supabase }, parent }) => {
	const { user } = await parent();

	const { data: athletes } = await supabase
		.from('profiles')
		.select('id, name, email, coach_id')
		.eq('coach_id', user!.id)
		.eq('role', 'athlete')
		.order('name');

	const { data: invites } = await supabase
		.from('coach_invites')
		.select('id, email, created_at')
		.eq('coach_id', user!.id)
		.order('created_at', { ascending: false });

	return {
		athletes: athletes ?? [],
		pendingInvites: invites ?? []
	};
};

export const actions: Actions = {
	invite_athlete: async ({ request, locals: { supabase } }) => {
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
