import { describe, it, expect } from 'vitest';
import { countsTowardCompletion, exerciseComplete, isSetEntryComplete } from '$lib/complete';
import type { Exercise, SetEntry } from '$lib/types';

/** A weight exercise's log entry: complete once a weight is present. */
const weightSet = (weight: string | null, setNumber = 1): SetEntry => ({
	setNumber,
	weight,
	reps: null,
	done: false
});

/** A conditioning unit: complete only once the athlete taps it. */
const unit = (done: boolean): SetEntry => ({ setNumber: 1, weight: null, reps: null, done });

function exercise(
	category: Exercise['category'],
	performed: SetEntry[],
	plan: number[] = []
): Exercise {
	return { category, activity: 'Bench Press', plan, performed, note: '' };
}

describe('countsTowardCompletion', () => {
	it('excludes a note from completion math entirely', () => {
		expect(countsTowardCompletion({ category: 'note' })).toBe(false);
	});
	it('includes circuit in completion math', () => {
		expect(countsTowardCompletion({ category: 'circuit' })).toBe(true);
	});
});

describe('isSetEntryComplete', () => {
	it('completes a weight set once a weight is entered', () => {
		expect(isSetEntryComplete(exercise('weight', []), weightSet('80'))).toBe(true);
	});
	it('treats an unentered weight as incomplete', () => {
		expect(isSetEntryComplete(exercise('weight', []), weightSet(null))).toBe(false);
	});
	// athlete_sets.weight is `text`, so a zero-plate set is a real entry. A
	// truthiness test would silently mark it incomplete forever.
	it("counts a logged '0' as a real weight", () => {
		expect(isSetEntryComplete(exercise('weight', []), weightSet('0'))).toBe(true);
	});
	it('completes a conditioning unit only once tapped', () => {
		expect(isSetEntryComplete(exercise('circuit', []), unit(false))).toBe(false);
		expect(isSetEntryComplete(exercise('circuit', []), unit(true))).toBe(true);
	});
	// A conditioning unit carries no weight; its completion must not borrow the
	// weight rule, or every circuit would read as done the moment it exists.
	it('ignores weight for a conditioning unit', () => {
		const stray: SetEntry = { setNumber: 1, weight: '20', reps: null, done: false };
		expect(isSetEntryComplete(exercise('circuit', []), stray)).toBe(false);
	});
});

describe('exerciseComplete', () => {
	it('is complete when a weight exercise has a weight on every set', () => {
		const ex = exercise(
			'weight',
			[weightSet('80', 1), weightSet('80', 2), weightSet('80', 3)],
			[5, 5, 5]
		);
		expect(exerciseComplete(ex)).toBe(true);
	});

	it('is incomplete while any set has no weight', () => {
		const ex = exercise('weight', [weightSet('80', 1), weightSet(null, 2)], [5, 5]);
		expect(exerciseComplete(ex)).toBe(false);
	});

	// `[].every()` is true, so without the length guard an exercise with no
	// units would read as complete — and a coach can save a weight exercise with
	// its set count at zero.
	it('is not complete with no units at all', () => {
		expect(exerciseComplete(exercise('weight', []))).toBe(false);
	});

	it('completes a tapped conditioning exercise', () => {
		expect(exerciseComplete(exercise('circuit', [unit(true)]))).toBe(true);
		expect(exerciseComplete(exercise('circuit', [unit(false)]))).toBe(false);
	});

	it('is never complete for a note', () => {
		expect(exerciseComplete(exercise('note', []))).toBe(false);
		expect(exerciseComplete(exercise('note', [weightSet('80')]))).toBe(false);
	});

	// The invariant updateExercise's set diff depends on: performed[i] answers
	// plan[i]. A length mismatch means the two arrays have drifted and the reps
	// input would show the wrong plan for a set.
	it('keeps a weight log index-aligned with its plan', () => {
		const plan = [5, 5, 8];
		const performed = plan.map((_, i) => weightSet('80', i + 1));
		expect(performed).toHaveLength(plan.length);
		expect(exerciseComplete(exercise('weight', performed, plan))).toBe(true);
	});
});
