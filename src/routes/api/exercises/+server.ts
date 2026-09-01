import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getOrCreateExercise } from '$lib/server/exercises';

export const POST: RequestHandler = async ({ request, locals: { supabase } }) => {
	const body = await request.json();
	const { action, data } = body;

	switch (action) {
		case 'list': {
			// `note` is excluded — the shared 'Note' catalog row backs the note
			// feature but isn't a real, pickable catalog exercise.
			const { data: exercises } = await supabase
				.from('exercises')
				.select('id, name, category')
				.neq('category', 'note')
				.order('name');

			return json({ data: exercises ?? [] });
		}

		case 'create': {
			const { name, category } = data;
			const exercise = await getOrCreateExercise(supabase, name, category);
			if (!exercise) return error(500, 'Failed to create exercise');
			return json({ data: exercise });
		}

		case 'update': {
			const { id, name, category } = data;
			const { data: updated, error: updateErr } = await supabase
				.from('exercises')
				.update({ name, category })
				.eq('id', id)
				.select('id, name, category')
				.single();

			if (updateErr) {
				if (updateErr.code === '23505') {
					return error(409, 'An exercise with that name already exists.');
				}
				return error(500, 'Failed to update exercise');
			}
			return json({ data: updated });
		}

		case 'delete': {
			const { id } = data;
			const { error: deleteErr } = await supabase.from('exercises').delete().eq('id', id);

			if (deleteErr) {
				if (deleteErr.code === '23503') {
					return error(409, "This exercise is used in a scheduled workout and can't be deleted.");
				}
				return error(500, 'Failed to delete exercise');
			}
			return json({ data: { id } });
		}

		default:
			return error(400, `Unknown action: ${action}`);
	}
};
