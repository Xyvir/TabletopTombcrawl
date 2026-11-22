/**
 * Draws the spade icon set, the only source `public/icons/` has: the same geometry as `public/favicon.svg`,
 * rasterised with a hand-rolled PNG encoder so the icons need no image library. Change the spade in both
 * places and rerun this.
 *
 *   node scripts/run.mjs scripts/icons.ts
 *
 * It writes 192 and 512 for the manifest, a 512 with the glyph inside the maskable safe zone, and the 180
 * iOS touch icon. Coverage is supersampled 4×4, which is plenty at these sizes and keeps the edges from
 * stair-stepping.
 */
import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';

const INK = [7, 70, 27]; // #07461b
const PAPER = [244, 234, 210]; // #f4ead2

/** The spade, in a unit box: two lobes, the point, the stem. Mirrors favicon.svg's 64-unit drawing. */
function inSpade(x: number, y: number): boolean {
	const r = 0.205;
	if ((x - 0.29) ** 2 + (y - 0.46) ** 2 <= r * r) return true;
	if ((x - 0.71) ** 2 + (y - 0.46) ** 2 <= r * r) return true;
	if (y >= 0.055 && y <= 0.46) {
		const half = ((y - 0.055) / (0.46 - 0.055)) * 0.405;
		if (Math.abs(x - 0.5) <= half) return true;
	}
	if (y >= 0.6 && y <= 0.88) {
		const half = 0.045 + ((y - 0.6) / (0.88 - 0.6)) * 0.04;
		if (Math.abs(x - 0.5) <= half) return true;
	}
	return false;
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
 * `maskable` fills the whole canvas with a flat background and keeps the glyph inside the 80% safe zone;
 * the plain icon is a rounded square with the glyph filling it.
 */
function icon(size: number, { maskable }: { maskable: boolean }): Buffer {
	const scale = maskable ? 0.6 : 0.74;
	const radius = 0.22;
	const samples = 4;
	const rows: Buffer[] = [];
	for (let py = 0; py < size; py++) {
		const row = Buffer.alloc(1 + size * 4);
		row[0] = 0;
		for (let px = 0; px < size; px++) {
			let glyph = 0;
			let plate = 0;
			for (let sy = 0; sy < samples; sy++) {
				for (let sx = 0; sx < samples; sx++) {
					const u = (px + (sx + 0.5) / samples) / size;
					const v = (py + (sy + 0.5) / samples) / size;
					if (maskable) plate++;
					else {
						const dx = Math.max(0, Math.abs(u - 0.5) - (0.5 - radius));
						const dy = Math.max(0, Math.abs(v - 0.5) - (0.5 - radius));
						if (dx * dx + dy * dy <= radius * radius) plate++;
					}
					const gx = 0.5 + (u - 0.5) / scale;
					const gy = 0.5 + (v - 0.5) / scale;
					if (inSpade(gx, gy)) glyph++;
				}
			}
			const total = samples * samples;
			const plateA = plate / total;
			const glyphA = Math.min(glyph / total, plateA);
			const at = 1 + px * 4;
			for (let channel = 0; channel < 3; channel++) {
				const plateMix = PAPER[channel] * glyphA + INK[channel] * (plateA - glyphA);
				row[at + channel] = Math.round(plateMix / plateA);
			}
			row[at + 3] = Math.round(plateA * 255);
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
	console.log(`public/icons/${name} · ${size}px${maskable ? ' maskable' : ''}`);
}
