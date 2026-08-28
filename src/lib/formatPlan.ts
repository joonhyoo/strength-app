/** Collapses a rep-scheme plan like [5, 5, 5, 8] into a display string like "3 x 5, 8". */
export function formatPlan(plan: number[]): string {
	if (plan.length === 0) return '';

	const counts = new Map<number, number>();
	for (const reps of plan) {
		counts.set(reps, (counts.get(reps) ?? 0) + 1);
	}

	return [...counts.entries()]
		.map(([num, count]) => (count > 1 ? `${count} x ${num}` : `${num}`))
		.join(', ');
}
