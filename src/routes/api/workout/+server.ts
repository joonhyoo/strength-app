import { error } from '@sveltejs/kit';
import { postHandler } from '$lib/server/apiHandler';
import * as queries from '$lib/server/workoutActions/queries';
import * as exerciseActions from '$lib/server/workoutActions/exercises';
import * as pasteAndClear from '$lib/server/workoutActions/pasteAndClear';

export const POST = postHandler('/api/workout', async (ctx) => {
	switch (ctx.action) {
		case 'getDay':
			return queries.getDay(ctx);
		case 'exerciseHistory':
			return queries.exerciseHistory(ctx);
		case 'getStatusMap':
			return queries.getStatusMap(ctx);

		case 'addExercise':
			return exerciseActions.addExercise(ctx);
		case 'updateExercise':
			return exerciseActions.updateExercise(ctx);
		case 'removeExercise':
			return exerciseActions.removeExercise(ctx);
		case 'reorderExercise':
			return exerciseActions.reorderExercise(ctx);
		case 'setExerciseComplete':
			return exerciseActions.setExerciseComplete(ctx);
		case 'updateSet':
			return exerciseActions.updateSet(ctx);

		case 'pasteDay':
			return pasteAndClear.pasteDay(ctx);
		case 'checkPasteWeekConflicts':
			return pasteAndClear.checkPasteWeekConflicts(ctx);
		case 'pasteWeek':
			return pasteAndClear.pasteWeek(ctx);
		case 'clearWeek':
			return pasteAndClear.clearWeek(ctx);

		default:
			return error(400, `Unknown action: ${ctx.action}`);
	}
});
