export type Clipboard =
	| { type: 'day'; athleteId: string; athleteName: string; dateKey: string }
	| { type: 'week'; athleteId: string; athleteName: string; weekStart: string };

/** Which of the merged copy/paste affordances a day cell should show: 'cancel'
 *  on the day that's currently copied, 'paste' on every other day once
 *  something's on the clipboard, 'copy' otherwise. */
export function dayClipboardMode(
	clipboard: Clipboard | null,
	athleteId: string,
	dateKey: string
): 'copy' | 'paste' | 'cancel' {
	if (clipboard?.type !== 'day') return 'copy';
	if (clipboard.athleteId === athleteId && clipboard.dateKey === dateKey) return 'cancel';
	return 'paste';
}

/** Same three-way state for the selected week's toolbar button. */
export function weekClipboardMode(
	clipboard: Clipboard | null,
	athleteId: string | null,
	weekStart: string
): 'copy' | 'paste' | 'cancel' {
	if (clipboard?.type !== 'week') return 'copy';
	if (clipboard.athleteId === athleteId && clipboard.weekStart === weekStart) return 'cancel';
	return 'paste';
}
