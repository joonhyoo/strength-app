import { error } from '@sveltejs/kit';
import { postHandler } from '$lib/server/apiHandler';
import * as programActions from '$lib/server/programActions/program';
import * as cycleActions from '$lib/server/programActions/cycles';
import * as weekActions from '$lib/server/programActions/weeks';
import * as sessionActions from '$lib/server/programActions/sessions';
import * as exerciseActions from '$lib/server/programActions/exercises';
import * as assignmentActions from '$lib/server/programActions/assignments';

export const POST = postHandler('/api/program', async (ctx) => {
	switch (ctx.action) {
		case 'listPrograms':
			return programActions.listPrograms(ctx);
		case 'getProgram':
			return programActions.getProgram(ctx);
		case 'createProgram':
			return programActions.createProgram(ctx);
		case 'updateProgram':
			return programActions.updateProgram(ctx);
		case 'deleteProgram':
			return programActions.deleteProgram(ctx);

		case 'addCycle':
			return cycleActions.addCycle(ctx);
		case 'updateCycle':
			return cycleActions.updateCycle(ctx);
		case 'removeCycle':
			return cycleActions.removeCycle(ctx);

		case 'addWeek':
			return weekActions.addWeek(ctx);
		case 'duplicateWeek':
			return weekActions.duplicateWeek(ctx);
		case 'removeWeek':
			return weekActions.removeWeek(ctx);

		case 'addSession':
			return sessionActions.addSession(ctx);
		case 'duplicateSession':
			return sessionActions.duplicateSession(ctx);
		case 'updateSession':
			return sessionActions.updateSession(ctx);
		case 'removeSession':
			return sessionActions.removeSession(ctx);

		case 'addProgramExercise':
			return exerciseActions.addProgramExercise(ctx);
		case 'updateProgramExercise':
			return exerciseActions.updateProgramExercise(ctx);
		case 'removeProgramExercise':
			return exerciseActions.removeProgramExercise(ctx);
		case 'reorderProgramExercise':
			return exerciseActions.reorderProgramExercise(ctx);

		case 'checkAssignConflicts':
			return assignmentActions.checkAssignConflicts(ctx);
		case 'assignProgram':
			return assignmentActions.assignProgram(ctx);
		case 'checkShiftConflicts':
			return assignmentActions.checkShiftConflicts(ctx);
		case 'shiftSchedule':
			return assignmentActions.shiftSchedule(ctx);
		case 'getBreadcrumb':
			return assignmentActions.getBreadcrumb(ctx);

		default:
			return error(400, `Unknown action: ${ctx.action}`);
	}
});
