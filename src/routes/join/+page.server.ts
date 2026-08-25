import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

// coach_id is assigned by claim_invite() after OTP verification, not at
// account-creation time, so a real (if narrow) race exists: the coach can
// revoke the invite between send_code and verify_code. This page explains
// that state rather than offering a way to fix it — fixing it means the
// coach re-inviting the email.
export const load: PageServerLoad = async ({ parent }) => {
	const { user } = await parent();
	if (!user) redirect(303, '/auth/login');
	if (user.role !== 'athlete') redirect(303, '/');
	if (user.coach_id !== null) redirect(303, '/train');
	return {};
};
