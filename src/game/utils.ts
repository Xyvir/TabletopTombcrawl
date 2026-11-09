function sortedDiff<T>(a: T[], b: T[]) {
	const in_a: T[] = [];
	const in_b: T[] = [];
	const in_both: T[] = [];

	let idx_a = 0;
	let idx_b = 0;
	while (idx_a < a.length && idx_b < b.length) {
		const value_a = a[idx_a];
		const value_b = b[idx_b];
		if (value_a === value_b) {
			in_both.push(value_a);
			idx_a++;
			idx_b++;
		} else if (value_a < value_b) {
			in_a.push(value_a);
			idx_a++;
		} else {
			in_b.push(value_b);
			idx_b++;
		}
	}

	// if there is anything else, it's unique
	Array.prototype.push.apply(in_a, a.slice(idx_a));
	Array.prototype.push.apply(in_b, b.slice(idx_b));

	return { in_a, in_b, in_both };
}

/** @return a number 1 <= result <= max */
function randomInteger(max = Number.MAX_SAFE_INTEGER): number {
	const val = Math.floor(Math.random() * max) + 1;
	return Math.min(Math.max(1, val), max);
}

/** @return array.map(callback).filter((a): a is R => !!a); */
function mapAndFilter<T, R>(array: T[], callback: (item: T) => R | undefined | null | false): R[] {
	return array.reduce<R[]>((acc, item) => {
		const mapped = callback(item);
		if (mapped) acc.push(mapped);
		return acc;
	}, []);
}

export const utils = {
	sortedDiff,
	randomInteger,
	mapAndFilter,
};
