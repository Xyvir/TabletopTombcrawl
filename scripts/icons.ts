/**
 * Renders `public/favicon.svg` into the icon set `public/icons/`, with a hand-rolled SVG reader and PNG
 * encoder so the icons need no image library and no rebuild dance: edit the favicon and rerun this.
 *
 *   node scripts/run.mjs scripts/icons.ts
 *
 * It writes 192 and 512 for the manifest, a 512 with the glyph inside the maskable safe zone, and the 180
 * iOS touch icon. Coverage is supersampled 4×4, which is plenty at these sizes and keeps the edges from
 * stair-stepping.
 *
 * The reader understands what an icon is drawn with — a `<rect>` plate and `<path>` artwork, straight or
 * curved, filled with one solid colour under the nonzero rule — and refuses anything else out loud (a
 * gradient, a stroke, an arc) rather than quietly drawing half the picture. An icon that came out
 * half-drawn and went unnoticed is the worse answer.
 */
import { deflateSync } from 'node:zlib';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const SOURCE = 'public/favicon.svg';
/** How many straight steps each curve is walked in. Small enough to be invisible, few enough to draw fast. */
const CURVE_STEPS = 24;

type Point = [number, number];
type Rgb = [number, number, number];

/* ------------------------------------------------------------ reading the drawing */

interface Plate {
	fill: Rgb;
	/** Corner radius as a fraction of the canvas. */
	radius: number;
	x: number;
	y: number;
	w: number;
	h: number;
}

interface Shape {
	fill: Rgb;
	/** Closed subpaths, in viewBox units, in the order the drawing fills them. */
	subpaths: Point[][];
}

function colour(value: string | undefined, where: string): Rgb {
	const text = (value ?? '').trim();
	const six = /^#([0-9a-f]{6})$/i.exec(text);
	const three = /^#([0-9a-f]{3})$/i.exec(text);
	if (six) {
		const n = parseInt(six[1], 16);
		return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
	}
	if (three) {
		const [r, g, b] = three[1].split('').map((c) => parseInt(c + c, 16));
		return [r, g, b];
	}
	throw new Error(`${where}: no solid fill (${text || 'none'}) — this reader fills flat colours only`);
}

/** The fill is written either as an attribute or inside `style`; both appear in the wild. */
function fillOf(attributes: Record<string, string>, where: string): Rgb {
	const styled = /(?:^|;)\s*fill\s*:\s*([^;]+)/i.exec(attributes.style ?? '');
	return colour(attributes.fill ?? styled?.[1], where);
}

function attributesOf(text: string): Record<string, string> {
	const attributes: Record<string, string> = {};
	for (const match of text.matchAll(/([\w:-]+)\s*=\s*"([^"]*)"/g)) attributes[match[1]] = match[2];
	return attributes;
}

function number(value: string | undefined, fallback = 0): number {
	return value === undefined ? fallback : Number.parseFloat(value);
}

/**
 * Path data into closed polylines: every curve is walked in CURVE_STEPS straight steps, so the scanline
 * below only ever deals with one kind of edge. Arcs are refused rather than approximated badly, and so
 * are the elliptical-arc-heavy emissaries Inkscape reaches for when a circle is cut.
 */
function flatten(d: string, where: string): Point[][] {
	const tokens = d.match(/[a-zA-Z]|-?(?:\d*\.\d+|\d+)(?:[eE][-+]?\d+)?/g) ?? [];
	const subpaths: Point[][] = [];
	let index = 0;
	let x = 0;
	let y = 0;
	let startX = 0;
	let startY = 0;
	let cubic: Point | null = null;
	let quad: Point | null = null;
	let current: Point[] | null = null;
	let command = '';
	const next = () => {
		if (index >= tokens.length) throw new Error(`${where}: path data ends mid-command`);
		return Number(tokens[index++]);
	};
	const begin = () => {
		if (!current) {
			current = [[x, y]];
			subpaths.push(current);
		}
		return current;
	};
	while (index < tokens.length) {
		if (/[a-zA-Z]/.test(tokens[index])) command = tokens[index++];
		if (!command) throw new Error(`${where}: path data starts with a number`);
		const relative = command === command.toLowerCase();
		const kind = command.toUpperCase();
		const point = (px: number, py: number): Point => [relative ? x + px : px, relative ? y + py : py];
		switch (kind) {
			case 'M': {
				[x, y] = point(next(), next());
				startX = x;
				startY = y;
				current = [[x, y]];
				subpaths.push(current);
				// A second pair after a moveto is a lineto, in every SVG reader there has ever been.
				command = relative ? 'l' : 'L';
				cubic = quad = null;
				break;
			}
			case 'L': {
				[x, y] = point(next(), next());
				begin().push([x, y]);
				cubic = quad = null;
				break;
			}
			case 'H': {
				x = relative ? x + next() : next();
				begin().push([x, y]);
				cubic = quad = null;
				break;
			}
			case 'V': {
				y = relative ? y + next() : next();
				begin().push([x, y]);
				cubic = quad = null;
				break;
			}
			case 'C':
			case 'S': {
				const c1: Point = kind === 'C' ? point(next(), next()) : cubic ? [2 * x - cubic[0], 2 * y - cubic[1]] : [x, y];
				const c2 = point(next(), next());
				const end = point(next(), next());
				const path = begin();
				const from: Point = [x, y];
				for (let step = 1; step <= CURVE_STEPS; step++) {
					const t = step / CURVE_STEPS;
					const u = 1 - t;
					path.push([
						u * u * u * from[0] + 3 * u * u * t * c1[0] + 3 * u * t * t * c2[0] + t * t * t * end[0],
						u * u * u * from[1] + 3 * u * u * t * c1[1] + 3 * u * t * t * c2[1] + t * t * t * end[1],
					]);
				}
				x = end[0];
				y = end[1];
				cubic = c2;
				quad = null;
				break;
			}
			case 'Q':
			case 'T': {
				const control: Point = kind === 'Q' ? point(next(), next()) : quad ? [2 * x - quad[0], 2 * y - quad[1]] : [x, y];
				const end = point(next(), next());
				const path = begin();
				const from: Point = [x, y];
				for (let step = 1; step <= CURVE_STEPS; step++) {
					const t = step / CURVE_STEPS;
					const u = 1 - t;
					path.push([
						u * u * from[0] + 2 * u * t * control[0] + t * t * end[0],
						u * u * from[1] + 2 * u * t * control[1] + t * t * end[1],
					]);
				}
				x = end[0];
				y = end[1];
				quad = control;
				cubic = null;
				break;
			}
			case 'Z': {
				if (current && (current[0][0] !== x || current[0][1] !== y)) current.push([startX, startY]);
				x = startX;
				y = startY;
				current = null;
				cubic = quad = null;
				break;
			}
			default:
				throw new Error(`${where}: "${command}" is a path command this reader does not draw (arcs, and anything else exotic)`);
		}
	}
	return subpaths;
}

function readDrawing(file: string): { size: number; plate: Plate; shapes: Shape[] } {
	const svg = readFileSync(file, 'utf8');
	const viewBox = /viewBox\s*=\s*"([^"]+)"/.exec(svg)?.[1];
	if (!viewBox) throw new Error(`${file}: no viewBox`);
	const [, , width, height] = viewBox.trim().split(/[\s,]+/).map(Number);
	if (width !== height) throw new Error(`${file}: the icon must be square, this viewBox is ${width}×${height}`);

	const rect = /<rect\b([^>]*)>/i.exec(svg);
	if (!rect) throw new Error(`${file}: no <rect> to read as the plate`);
	const rectAttributes = attributesOf(rect[1]);
	const rectWidth = number(rectAttributes.width, width);
	const rectHeight = number(rectAttributes.height, height);
	if (rectWidth !== width || rectHeight !== height)
		throw new Error(`${file}: the plate must cover the whole canvas — a bare glyph has nothing to sit on`);
	const plate: Plate = {
		fill: fillOf(rectAttributes, `${file}: <rect>`),
		radius: number(rectAttributes.rx, 0) / width,
		x: number(rectAttributes.x, 0),
		y: number(rectAttributes.y, 0),
		w: rectWidth,
		h: rectHeight,
	};

	const shapes: Shape[] = [];
	for (const match of svg.matchAll(/<path\b([^>]*)>/gi)) {
		const attributes = attributesOf(match[1]);
		if (!attributes.d) throw new Error(`${file}: a <path> with no d`);
		shapes.push({ fill: fillOf(attributes, `${file}: <path>`), subpaths: flatten(attributes.d, `${file}: <path>`) });
	}
	if (!shapes.length) throw new Error(`${file}: no <path> artwork to draw`);
	if (/\b(?:stroke|linearGradient|radialGradient|image|use|text)\b/.test(svg))
		throw new Error(`${file}: strokes, gradients, images and text are not drawn by this reader`);
	return { size: width, plate, shapes };
}

/* ------------------------------------------------------------ drawing it into pixels */

/**
 * One scanline's worth of a shape: every edge crossing this y, sorted by x, with the running winding
 * number kept beside it. The nonzero rule is then a lookup per sample, which is what makes a 512 icon
 * draw in a blink instead of testing a few thousand edges for each of a few million samples.
 */
interface Scan {
	xs: number[];
	/** `winding[i]` is the winding number just left of `xs[i]`. */
	winding: number[];
}

function scanShape(subpaths: Point[][], y: number): Scan {
	const xs: number[] = [];
	const direction: number[] = [];
	for (const path of subpaths) {
		for (let i = 0; i < path.length; i++) {
			const [ax, ay] = path[i];
			const [bx, by] = path[(i + 1) % path.length];
			if (ay === by) continue;
			if (ay <= y && by > y) {
				xs.push(ax + ((y - ay) / (by - ay)) * (bx - ax));
				direction.push(1);
			} else if (by <= y && ay > y) {
				xs.push(ax + ((y - ay) / (by - ay)) * (bx - ax));
				direction.push(-1);
			}
		}
	}
	const order = xs.map((_, index) => index).sort((a, b) => xs[a] - xs[b]);
	const sortedXs = order.map((index) => xs[index]);
	const winding = [0];
	let running = 0;
	for (const index of order) {
		running += direction[index];
		winding.push(running);
	}
	return { xs: sortedXs, winding };
}

/** Winding number at x, from the left of the scanline: the last crossing to its left carries it. */
function windingAt(scan: Scan, x: number): number {
	let low = 0;
	let high = scan.xs.length;
	while (low < high) {
		const middle = (low + high) >> 1;
		if (scan.xs[middle] <= x) low = middle + 1;
		else high = middle;
	}
	return scan.winding[low];
}

function inPlate(plate: Plate, x: number, y: number, maskable: boolean): boolean {
	if (maskable) return true;
	// a sample lands on the plate when it is inside the rounded rect the favicon draws
	const r = plate.radius * plate.w;
	const right = plate.x + plate.w;
	const bottom = plate.y + plate.h;
	if (x < plate.x || x > right || y < plate.y || y > bottom) return false;
	const dx = Math.max(plate.x + r - x, 0, x - (right - r));
	const dy = Math.max(plate.y + r - y, 0, y - (bottom - r));
	return dx * dx + dy * dy <= r * r;
}

function crc32(bytes: Buffer): number {
	let crc = 0xffffffff;
	for (const byte of bytes) {
		crc ^= byte;
		for (let bit = 0; bit < 8; bit++) crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
	}
	return (crc ^ 0xffffffff) >>> 0;
}

const chunk = (type: string, data: Buffer) => {
	const head = Buffer.alloc(8);
	head.writeUInt32BE(data.length, 0);
	head.write(type, 4, 'ascii');
	const crc = Buffer.alloc(4);
	crc.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), data])), 0);
	return Buffer.concat([head, data, crc]);
};

/**
 * `maskable` fills the whole canvas with the plate's colour and keeps the glyph inside the 80% safe zone,
 * because a launcher may crop the icon to a circle; the plain icon is the rounded plate exactly as the
 * favicon draws it.
 */
function icon(size: number, { maskable }: { maskable: boolean }): Buffer {
	const drawing = readDrawing(SOURCE);
	const scale = maskable ? 0.6 : 1;
	const samples = 4;
	const total = samples * samples;
	const middle = drawing.size / 2;
	const rows: Buffer[] = [];

	for (let py = 0; py < size; py++) {
		const row = Buffer.alloc(1 + size * 4);
		row[0] = 0;
		// each sub-sample row is scanned once per shape, then every pixel on it is a lookup
		const scans: { y: number; shapes: Scan[] }[] = [];
		for (let sy = 0; sy < samples; sy++) {
			const y = ((py + (sy + 0.5) / samples) / size) * drawing.size;
			const glyphY = middle + (y - middle) / scale;
			scans.push({ y, shapes: drawing.shapes.map((shape) => scanShape(shape.subpaths, glyphY)) });
		}
		for (let px = 0; px < size; px++) {
			let plate = 0;
			const colour: Rgb = [0, 0, 0];
			for (let sy = 0; sy < samples; sy++) {
				const { y, shapes } = scans[sy];
				for (let sx = 0; sx < samples; sx++) {
					const x = ((px + (sx + 0.5) / samples) / size) * drawing.size;
					const covered = inPlate(drawing.plate, x, y, maskable);
					if (covered) plate++;
					const glyphX = middle + (x - middle) / scale;
					let painted: Rgb | null = covered ? drawing.plate.fill : null;
					for (let index = 0; index < shapes.length; index++) {
						if (windingAt(shapes[index], glyphX) !== 0) painted = drawing.shapes[index].fill;
					}
					if (painted) {
						colour[0] += painted[0];
						colour[1] += painted[1];
						colour[2] += painted[2];
					}
				}
			}
			const at = 1 + px * 4;
			const alpha = maskable ? 1 : plate / total;
			if (alpha === 0) {
				row[at + 3] = 0;
				continue;
			}
			// every sample that counts toward the alpha is also a sample with a colour
			const divisor = maskable ? total : plate;
			for (let channel = 0; channel < 3; channel++) row[at + channel] = Math.round(colour[channel] / divisor);
			row[at + 3] = Math.round(alpha * 255);
		}
		rows.push(row);
	}

	const header = Buffer.alloc(13);
	header.writeUInt32BE(size, 0);
	header.writeUInt32BE(size, 4);
	header[8] = 8; // bit depth
	header[9] = 6; // RGBA
	return Buffer.concat([
		Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
		chunk('IHDR', header),
		chunk('IDAT', deflateSync(Buffer.concat(rows), { level: 9 })),
		chunk('IEND', Buffer.alloc(0)),
	]);
}

mkdirSync('public/icons', { recursive: true });
const wanted: [string, number, boolean][] = [
	['icon-192.png', 192, false],
	['icon-512.png', 512, false],
	['icon-512-maskable.png', 512, true],
	['apple-touch-icon.png', 180, false],
];
for (const [name, size, maskable] of wanted) {
	writeFileSync(`public/icons/${name}`, icon(size, { maskable }));
	console.log(`public/icons/${name} · ${size}px${maskable ? ' maskable' : ''} · from ${SOURCE}`);
}
