import { deflateSync } from 'zlib';

const QR_SIZE = 37;
const QR_ERROR_CORRECTION_LEVEL_BIT = 1; // L
const QR_MASK_PATTERN = 0;
const QR_DATA_CODEWORDS = 108;
const QR_EC_CODEWORDS = 26;
const QR_MAX_INPUT_BYTES = 106;
const QR_PAD_BYTES = [0xec, 0x11] as const;

const FORMAT_INFO_GENERATOR = 0b10100110111;
const FORMAT_INFO_MASK = 0b101010000010010;

const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

const GF_EXP = new Uint8Array(512);
const GF_LOG = new Uint8Array(256);
const CRC32_TABLE = buildCrc32Table();

initializeGaloisField();
const RS_GENERATOR = buildRsGenerator(QR_EC_CODEWORDS);

function initializeGaloisField(): void {
	let x = 1;
	for (let i = 0; i < 255; i++) {
		GF_EXP[i] = x;
		GF_LOG[x] = i;
		x <<= 1;
		if (x & 0x100) x ^= 0x11d;
	}
	for (let i = 255; i < 512; i++) {
		GF_EXP[i] = GF_EXP[i - 255];
	}
}

function buildRsGenerator(ecLength: number): Uint8Array {
	let poly = [1];
	for (let i = 0; i < ecLength; i++) {
		const next = new Array(poly.length + 1).fill(0);
		for (let j = 0; j < poly.length; j++) {
			next[j] ^= poly[j];
			next[j + 1] ^= gfMultiply(poly[j], GF_EXP[i]);
		}
		poly = next;
	}
	return Uint8Array.from(poly);
}

function gfMultiply(a: number, b: number): number {
	if (a === 0 || b === 0) return 0;
	return GF_EXP[GF_LOG[a] + GF_LOG[b]];
}

function buildCrc32Table(): Uint32Array {
	const table = new Uint32Array(256);
	for (let n = 0; n < 256; n++) {
		let c = n;
		for (let k = 0; k < 8; k++) {
			c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
		}
		table[n] = c >>> 0;
	}
	return table;
}

function crc32(data: Buffer): number {
	let c = 0xffffffff;
	for (let i = 0; i < data.length; i++) {
		c = CRC32_TABLE[(c ^ data[i]) & 0xff] ^ (c >>> 8);
	}
	return (c ^ 0xffffffff) >>> 0;
}

function createPngChunk(type: string, data: Buffer): Buffer {
	const length = Buffer.alloc(4);
	length.writeUInt32BE(data.length, 0);
	const typeBuffer = Buffer.from(type, 'ascii');
	const crcInput = Buffer.concat([typeBuffer, data]);
	const crc = Buffer.alloc(4);
	crc.writeUInt32BE(crc32(crcInput), 0);
	return Buffer.concat([length, typeBuffer, data, crc]);
}

function putBits(target: number[], value: number, length: number): void {
	for (let i = length - 1; i >= 0; i--) {
		target.push((value >>> i) & 1);
	}
}

function encodeDataCodewords(text: string): Uint8Array {
	const input = Buffer.from(text, 'utf8');
	if (input.length > QR_MAX_INPUT_BYTES) {
		throw new Error(
			`QR input too long (${input.length} bytes). Max supported is ${QR_MAX_INPUT_BYTES} bytes.`,
		);
	}

	const bits: number[] = [];
	putBits(bits, 0b0100, 4); // Byte mode
	putBits(bits, input.length, 8); // Version 1-9 byte count
	for (let i = 0; i < input.length; i++) {
		putBits(bits, input[i], 8);
	}

	const maxBits = QR_DATA_CODEWORDS * 8;
	if (bits.length > maxBits) {
		throw new Error('QR data overflow for version 5-L.');
	}

	const terminatorBits = Math.min(4, maxBits - bits.length);
	putBits(bits, 0, terminatorBits);

	while (bits.length % 8 !== 0) bits.push(0);

	const bytes: number[] = [];
	for (let i = 0; i < bits.length; i += 8) {
		let value = 0;
		for (let j = 0; j < 8; j++) value = (value << 1) | bits[i + j];
		bytes.push(value);
	}

	let padIndex = 0;
	while (bytes.length < QR_DATA_CODEWORDS) {
		bytes.push(QR_PAD_BYTES[padIndex % 2]);
		padIndex++;
	}

	return Uint8Array.from(bytes);
}

function encodeErrorCorrection(dataCodewords: Uint8Array): Uint8Array {
	const message = new Uint8Array(dataCodewords.length + QR_EC_CODEWORDS);
	message.set(dataCodewords, 0);

	for (let i = 0; i < dataCodewords.length; i++) {
		const factor = message[i];
		if (factor === 0) continue;
		for (let j = 1; j < RS_GENERATOR.length; j++) {
			message[i + j] ^= gfMultiply(RS_GENERATOR[j], factor);
		}
	}

	return message.slice(dataCodewords.length);
}

function bchDigit(value: number): number {
	let digit = 0;
	let current = value;
	while (current !== 0) {
		digit++;
		current >>>= 1;
	}
	return digit;
}

function getEncodedFormatBits(errorCorrectionLevelBit: number, maskPattern: number): number {
	const formatData = (errorCorrectionLevelBit << 3) | maskPattern;
	let d = formatData << 10;
	while (bchDigit(d) - bchDigit(FORMAT_INFO_GENERATOR) >= 0) {
		d ^= FORMAT_INFO_GENERATOR << (bchDigit(d) - bchDigit(FORMAT_INFO_GENERATOR));
	}
	return ((formatData << 10) | d) ^ FORMAT_INFO_MASK;
}

function buildQrModules(text: string): boolean[] {
	const dataCodewords = encodeDataCodewords(text);
	const ecCodewords = encodeErrorCorrection(dataCodewords);
	const codewords = new Uint8Array(QR_DATA_CODEWORDS + QR_EC_CODEWORDS);
	codewords.set(dataCodewords, 0);
	codewords.set(ecCodewords, QR_DATA_CODEWORDS);

	const modules: Array<boolean | null> = new Array(QR_SIZE * QR_SIZE).fill(null);
	const isFunction = new Array<boolean>(QR_SIZE * QR_SIZE).fill(false);

	const setModule = (row: number, col: number, value: boolean, functionModule: boolean): void => {
		if (row < 0 || row >= QR_SIZE || col < 0 || col >= QR_SIZE) return;
		const index = row * QR_SIZE + col;
		modules[index] = value;
		if (functionModule) isFunction[index] = true;
	};

	const drawFinder = (row: number, col: number): void => {
		for (let r = -1; r <= 7; r++) {
			for (let c = -1; c <= 7; c++) {
				const rr = row + r;
				const cc = col + c;
				if (rr < 0 || rr >= QR_SIZE || cc < 0 || cc >= QR_SIZE) continue;
				const isSeparator = r === -1 || r === 7 || c === -1 || c === 7;
				const isBorder = r === 0 || r === 6 || c === 0 || c === 6;
				const isCenter = r >= 2 && r <= 4 && c >= 2 && c <= 4;
				setModule(rr, cc, !isSeparator && (isBorder || isCenter), true);
			}
		}
	};

	const drawAlignment = (centerRow: number, centerCol: number): void => {
		for (let r = -2; r <= 2; r++) {
			for (let c = -2; c <= 2; c++) {
				const rr = centerRow + r;
				const cc = centerCol + c;
				const isBorder = Math.abs(r) === 2 || Math.abs(c) === 2;
				const isCenter = r === 0 && c === 0;
				setModule(rr, cc, isBorder || isCenter, true);
			}
		}
	};

	const setFormatBits = (): void => {
		const bits = getEncodedFormatBits(QR_ERROR_CORRECTION_LEVEL_BIT, QR_MASK_PATTERN);
		for (let i = 0; i < 15; i++) {
			const bit = ((bits >>> i) & 1) === 1;
			if (i < 6) {
				setModule(i, 8, bit, true);
			} else if (i < 8) {
				setModule(i + 1, 8, bit, true);
			} else {
				setModule(QR_SIZE - 15 + i, 8, bit, true);
			}

			if (i < 8) {
				setModule(8, QR_SIZE - i - 1, bit, true);
			} else if (i < 9) {
				setModule(8, 15 - i, bit, true);
			} else {
				setModule(8, 15 - i - 1, bit, true);
			}
		}
	};

	drawFinder(0, 0);
	drawFinder(0, QR_SIZE - 7);
	drawFinder(QR_SIZE - 7, 0);

	for (let i = 8; i < QR_SIZE - 8; i++) {
		const bit = i % 2 === 0;
		setModule(6, i, bit, true);
		setModule(i, 6, bit, true);
	}

	drawAlignment(30, 30);
	setFormatBits();
	setModule(QR_SIZE - 8, 8, true, true); // Dark module

	let bitIndex = 0;
	let row = QR_SIZE - 1;
	let rowDirection = -1;

	for (let col = QR_SIZE - 1; col > 0; col -= 2) {
		if (col === 6) col--;
		while (true) {
			for (let c = 0; c < 2; c++) {
				const currentCol = col - c;
				const moduleIndex = row * QR_SIZE + currentCol;
				if (isFunction[moduleIndex]) continue;
				const byte = codewords[Math.floor(bitIndex / 8)];
				const bit = ((byte >>> (7 - (bitIndex % 8))) & 1) === 1;
				modules[moduleIndex] = bit;
				bitIndex++;
			}

			row += rowDirection;
			if (row < 0 || row >= QR_SIZE) {
				row -= rowDirection;
				rowDirection = -rowDirection;
				break;
			}
		}
	}

	for (let r = 0; r < QR_SIZE; r++) {
		for (let c = 0; c < QR_SIZE; c++) {
			const index = r * QR_SIZE + c;
			if (isFunction[index]) continue;
			if (modules[index] === null) continue;
			if ((r + c) % 2 === 0) {
				modules[index] = !modules[index];
			}
		}
	}

	setFormatBits();

	return modules.map((module) => module === true);
}

function renderPngFromModules(
	modules: boolean[],
	moduleCount: number,
	width: number,
	margin: number,
): Buffer {
	const totalModules = moduleCount + margin * 2;
	const scale = Math.max(1, Math.floor(width / totalModules));
	const size = totalModules * scale;

	const rowStride = size * 4 + 1;
	const raw = Buffer.alloc(rowStride * size);

	for (let y = 0; y < size; y++) {
		const rowOffset = y * rowStride;
		raw[rowOffset] = 0;
		const moduleY = Math.floor(y / scale) - margin;
		for (let x = 0; x < size; x++) {
			const moduleX = Math.floor(x / scale) - margin;
			const inSymbol =
				moduleX >= 0 && moduleX < moduleCount && moduleY >= 0 && moduleY < moduleCount;
			const isDark = inSymbol ? modules[moduleY * moduleCount + moduleX] : false;
			const color = isDark ? 0 : 255;
			const pixelOffset = rowOffset + 1 + x * 4;
			raw[pixelOffset] = color;
			raw[pixelOffset + 1] = color;
			raw[pixelOffset + 2] = color;
			raw[pixelOffset + 3] = 255;
		}
	}

	const compressed = deflateSync(raw);

	const ihdr = Buffer.alloc(13);
	ihdr.writeUInt32BE(size, 0);
	ihdr.writeUInt32BE(size, 4);
	ihdr[8] = 8; // bit depth
	ihdr[9] = 6; // RGBA
	ihdr[10] = 0; // compression
	ihdr[11] = 0; // filter
	ihdr[12] = 0; // interlace

	return Buffer.concat([
		PNG_SIGNATURE,
		createPngChunk('IHDR', ihdr),
		createPngChunk('IDAT', compressed),
		createPngChunk('IEND', Buffer.alloc(0)),
	]);
}

export function generateQrPngBuffer(
	text: string,
	options?: {
		width?: number;
		margin?: number;
	},
): Buffer {
	if (!text) throw new Error('Cannot generate QR for empty input.');
	const width = Math.max(64, Math.floor(options?.width ?? 320));
	const margin = Math.max(0, Math.floor(options?.margin ?? 1));
	const modules = buildQrModules(text);
	return renderPngFromModules(modules, QR_SIZE, width, margin);
}

export function getQrPngFileName(fileNamePrefix: string): string {
	return `${fileNamePrefix}_${Date.now()}.png`;
}
