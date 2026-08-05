const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const size = 256;
const outputDir = path.join(__dirname, '..', 'assets');
fs.mkdirSync(outputDir, { recursive: true });

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let index = 0; index < 8; index += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const typeBuffer = Buffer.from(type, 'ascii');
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 0);
  return Buffer.concat([length, typeBuffer, data, checksum]);
}

function setPixel(buffer, x, y, r, g, b, a = 255) {
  if (x < 0 || y < 0 || x >= size || y >= size) return;
  const offset = (y * size + x) * 4;
  buffer[offset] = r;
  buffer[offset + 1] = g;
  buffer[offset + 2] = b;
  buffer[offset + 3] = a;
}

function fillRoundedRect(buffer, x, y, w, h, radius, color) {
  for (let py = y; py < y + h; py += 1) {
    for (let px = x; px < x + w; px += 1) {
      const dx = px < x + radius ? x + radius - px : px >= x + w - radius ? px - (x + w - radius - 1) : 0;
      const dy = py < y + radius ? y + radius - py : py >= y + h - radius ? py - (y + h - radius - 1) : 0;
      if (dx * dx + dy * dy <= radius * radius || dx === 0 || dy === 0) setPixel(buffer, px, py, ...color);
    }
  }
}

function fillRect(buffer, x, y, w, h, color) {
  for (let py = y; py < y + h; py += 1) for (let px = x; px < x + w; px += 1) setPixel(buffer, px, py, ...color);
}

function fillCircle(buffer, cx, cy, radius, color) {
  for (let y = cy - radius; y <= cy + radius; y += 1) {
    for (let x = cx - radius; x <= cx + radius; x += 1) if ((x - cx) ** 2 + (y - cy) ** 2 <= radius ** 2) setPixel(buffer, x, y, ...color);
  }
}

function makePng() {
  const pixels = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const shade = Math.round(18 + (x / size) * 10 + (y / size) * 16);
      setPixel(pixels, x, y, shade, shade + 7, shade + 22, 255);
    }
  }

  fillRoundedRect(pixels, 18, 18, 220, 220, 42, [25, 25, 112, 255]);
  fillRoundedRect(pixels, 31, 31, 194, 194, 32, [15, 23, 42, 255]);
  fillRoundedRect(pixels, 50, 88, 156, 70, 18, [33, 150, 243, 255]);
  fillRect(pixels, 72, 64, 74, 36, [96, 165, 250, 255]);
  fillRect(pixels, 146, 104, 42, 33, [147, 197, 253, 255]);
  fillRect(pixels, 66, 107, 101, 16, [224, 242, 254, 255]);
  fillRect(pixels, 78, 129, 88, 10, [15, 23, 42, 255]);
  fillCircle(pixels, 79, 166, 19, [2, 6, 23, 255]);
  fillCircle(pixels, 79, 166, 9, [248, 250, 252, 255]);
  fillCircle(pixels, 177, 166, 19, [2, 6, 23, 255]);
  fillCircle(pixels, 177, 166, 9, [248, 250, 252, 255]);
  fillRect(pixels, 70, 191, 116, 9, [99, 102, 241, 255]);

  const rawRows = [];
  for (let y = 0; y < size; y += 1) rawRows.push(Buffer.concat([Buffer.from([0]), pixels.subarray(y * size * 4, (y + 1) * size * 4)]));
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  return Buffer.concat([signature, chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(Buffer.concat(rawRows))), chunk('IEND', Buffer.alloc(0))]);
}

function makeIco(png) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(1, 4);
  const entry = Buffer.alloc(16);
  entry[0] = 0;
  entry[1] = 0;
  entry[2] = 0;
  entry[3] = 0;
  entry.writeUInt16LE(1, 4);
  entry.writeUInt16LE(32, 6);
  entry.writeUInt32LE(png.length, 8);
  entry.writeUInt32LE(22, 12);
  return Buffer.concat([header, entry, png]);
}

const png = makePng();
fs.writeFileSync(path.join(outputDir, 'icon.png'), png);
fs.writeFileSync(path.join(outputDir, 'icon.ico'), makeIco(png));
console.log('FleetDesk icons generated in assets/.');
