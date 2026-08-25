import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { needsUsername, roleHome } from '$lib/guards';

export const load: PageServerLoad = async ({ parent }) => {
	const { user } = await parent();
	if (!user) redirect(303, '/auth/login');
	if (!needsUsername(user)) redirect(303, roleHome(user.role));
	return {};
};

export const actions: Actions = {
	save: async ({ request, locals: { supabase } }) => {
		const formData = await request.formData();
		const username = (formData.get('username') as string)?.trim();
		const name = (formData.get('name') as string)?.trim();

		if (!username || !name) {
			return fail(400, { message: 'Please fill out both fields.', username, name });
		}

		const { error } = await supabase.rpc('complete_profile', {
			p_username: username,
			p_name: name
		});

		if (error) {
			const message =
				error.message === 'username_taken'
					? 'That username is already taken.'
					: error.message === 'invalid_username'
						? 'Usernames are 3-20 characters — letters, numbers, and underscores only.'
						: error.message === 'invalid_name'
							? 'Please enter a valid name.'
							: 'Could not save. Please try again.';
			return fail(400, { message, username, name });
		}

		const { data: claimsData } = await supabase.auth.getClaims();
		const { data: profile } = await supabase
			.from('profiles')
			.select('role')
			.eq('id', claimsData?.claims?.sub)
			.single();

		redirect(303, roleHome(profile?.role ?? null));
	}
};
