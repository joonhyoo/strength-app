import { error } from '@sveltejs/kit';
import { getOrCreateExercise } from '$lib/server/exercises';
import { postHandler, json } from '$lib/server/apiHandler';
import { dbList, dbWrite, dbWriteReturning } from '$lib/server/db';
import { DbError } from '$lib/server/db';

export const POST = postHandler('/api/exercises', async ({ action, data, supabase, log }) => {
	switch (action) {
		case 'list': {
			// `note` is excluded — the shared 'Note' catalog row backs the note
			// feature but isn't a real, pickable catalog exercise.
			const exercises = await dbList(
				log,
				'exercise.list',
				supabase
					.from('exercises')
					.select('id, name, category, video_url')
					.neq('category', 'note')
					.order('name')
			);

			return json({ data: exercises });
		}

		case 'create': {
			const { name, category, videoUrl } = data;
			const exercise = await getOrCreateExercise(supabase, name, category, videoUrl, log);
			return json({ data: exercise });
		}

		case 'update': {
			const { id, name, category, videoUrl } = data;
			try {
				const updated = await dbWriteReturning(
					log,
					'exercise.update',
					supabase
						.from('exercises')
						.update({ name, category, video_url: videoUrl || null })
						.eq('id', id)
						.select('id, name, category, video_url')
						.single(),
					{ soft: ['23505'] } // duplicate name — an expected 409 below, not a failure
				);
				return json({ data: updated });
			} catch (e) {
				if (e instanceof DbError && e.code === '23505') {
					return error(409, 'An exercise with that name already exists.');
				}
				throw e;
			}
		}

		case 'delete': {
			const { id } = data;
			try {
				await dbWrite(
					log,
					'exercise.delete',
					supabase.from('exercises').delete().eq('id', id),
					{ soft: ['23503'] } // in-use FK — an expected 409 below, not a failure
				);
			} catch (e) {
				if (e instanceof DbError && e.code === '23503') {
					return error(409, "This exercise is used in a scheduled workout and can't be deleted.");
				}
				throw e;
			}
			return json({ data: { id } });
		}

		default:
			return error(400, `Unknown action: ${action}`);
	}
});
