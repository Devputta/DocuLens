/**
 * DocuLens Minimal Store-Only ZIP Archive Engine
 * 
 * Complies with PKWare ZIP specification (APPNOTE.TXT) using uncompressed store mode (Method 0).
 * 100% offline, zero network, zero external libraries.
 * Handles folder structures, UTF-8 filenames, and 32-bit CRC validation.
 */

export interface ZipFileInput {
  path: string;
  data: Uint8Array | string;
}

// Standard IEEE 802.3 CRC32 lookup table
const CRC_TABLE = new Uint32Array(256);
for (let i = 0; i < 256; i++) {
  let c = i;
  for (let k = 0; k < 8; k++) {
    c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  CRC_TABLE[i] = c >>> 0;
}

export function computeCRC32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    crc = CRC_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

/**
 * Creates an uncompressed ZIP archive (Blob) from an array of files and relative paths.
 */
export function createStoreZipBlob(files: ZipFileInput[]): Blob {
  const encoder = new TextEncoder();
  const fileEntries: Array<{
    pathBytes: Uint8Array;
    dataBytes: Uint8Array;
    crc32: number;
    offset: number;
    size: number;
  }> = [];

  const parts: any[] = [];
  let currentOffset = 0;

  // DOS timestamp for current time
  const now = new Date();
  const dosTime =
    ((now.getHours() & 0x1f) << 11) |
    ((now.getMinutes() & 0x3f) << 5) |
    ((Math.floor(now.getSeconds() / 2) & 0x1f));
  const dosDate =
    (((now.getFullYear() - 1980) & 0x7f) << 9) |
    (((now.getMonth() + 1) & 0x0f) << 5) |
    (now.getDate() & 0x1f);

  // 1. Write Local Headers and File Data
  for (const file of files) {
    const cleanPath = file.path.replace(/^\/+/, '').replace(/\\/g, '/');
    const pathBytes = encoder.encode(cleanPath);
    const dataBytes =
      typeof file.data === 'string' ? encoder.encode(file.data) : file.data;
    const crc32 = computeCRC32(dataBytes);
    const size = dataBytes.byteLength;

    const localHeader = new Uint8Array(30 + pathBytes.length);
    const view = new DataView(localHeader.buffer);

    view.setUint32(0, 0x04034b50, true); // Local header signature
    view.setUint16(4, 20, true); // Version needed to extract (2.0)
    view.setUint16(6, 0x0800, true); // Bit flag: UTF-8 filename
    view.setUint16(8, 0, true); // Compression method: 0 (Store)
    view.setUint16(10, dosTime, true);
    view.setUint16(12, dosDate, true);
    view.setUint32(14, crc32, true);
    view.setUint32(18, size, true); // Compressed size
    view.setUint32(22, size, true); // Uncompressed size
    view.setUint16(26, pathBytes.length, true);
    view.setUint16(28, 0, true); // Extra field length

    localHeader.set(pathBytes, 30);

    fileEntries.push({
      pathBytes,
      dataBytes,
      crc32,
      offset: currentOffset,
      size,
    });

    parts.push(localHeader);
    parts.push(dataBytes);

    currentOffset += localHeader.length + size;
  }

  // 2. Write Central Directory
  const centralDirStart = currentOffset;
  let centralDirSize = 0;

  for (const entry of fileEntries) {
    const cdHeader = new Uint8Array(46 + entry.pathBytes.length);
    const view = new DataView(cdHeader.buffer);

    view.setUint32(0, 0x02014b50, true); // Central directory signature
    view.setUint16(4, 0x0314, true); // Version made by (UNIX 2.0)
    view.setUint16(6, 20, true); // Version needed to extract (2.0)
    view.setUint16(8, 0x0800, true); // UTF-8 filename flag
    view.setUint16(10, 0, true); // Compression method (Store)
    view.setUint16(12, dosTime, true);
    view.setUint16(14, dosDate, true);
    view.setUint32(16, entry.crc32, true);
    view.setUint32(20, entry.size, true); // Compressed size
    view.setUint32(24, entry.size, true); // Uncompressed size
    view.setUint16(28, entry.pathBytes.length, true);
    view.setUint16(30, 0, true); // Extra field length
    view.setUint16(32, 0, true); // Comment length
    view.setUint16(34, 0, true); // Disk number start
    view.setUint16(36, 0, true); // Internal file attributes
    view.setUint32(38, 0o100644 << 16, true); // External file attributes (regular file)
    view.setUint32(42, entry.offset, true); // Relative offset of local header

    cdHeader.set(entry.pathBytes, 46);

    parts.push(cdHeader);
    centralDirSize += cdHeader.length;
  }

  // 3. Write End of Central Directory Record
  const eocd = new Uint8Array(22);
  const eocdView = new DataView(eocd.buffer);

  eocdView.setUint32(0, 0x06054b50, true); // EOCD signature
  eocdView.setUint16(4, 0, true); // Disk number
  eocdView.setUint16(6, 0, true); // Start disk
  eocdView.setUint16(8, fileEntries.length, true); // Number of records on this disk
  eocdView.setUint16(10, fileEntries.length, true); // Total number of records
  eocdView.setUint32(12, centralDirSize, true); // Size of central directory
  eocdView.setUint32(16, centralDirStart, true); // Offset of start of central directory
  eocdView.setUint16(20, 0, true); // Comment length

  parts.push(eocd);

  return new Blob(parts, { type: 'application/zip' });
}

/**
 * Utility to parse and inspect ZIP file entries for verification and tests.
 */
export function parseZipStructure(
  buffer: ArrayBuffer | Uint8Array
): { filenames: string[]; fileCount: number; valid: boolean } {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

  // Check magic signature at beginning
  if (bytes.length < 22 || view.getUint32(0, true) !== 0x04034b50) {
    return { filenames: [], fileCount: 0, valid: false };
  }

  // Find End of Central Directory signature from the end
  let eocdOffset = -1;
  for (let i = bytes.length - 22; i >= 0; i--) {
    if (view.getUint32(i, true) === 0x06054b50) {
      eocdOffset = i;
      break;
    }
  }

  if (eocdOffset === -1) {
    return { filenames: [], fileCount: 0, valid: false };
  }

  const fileCount = view.getUint16(eocdOffset + 10, true);
  const centralDirOffset = view.getUint32(eocdOffset + 16, true);

  const filenames: string[] = [];
  const decoder = new TextDecoder('utf-8');
  let ptr = centralDirOffset;

  for (let i = 0; i < fileCount; i++) {
    if (ptr + 46 > bytes.length) break;
    if (view.getUint32(ptr, true) !== 0x02014b50) break;

    const nameLen = view.getUint16(ptr + 28, true);
    const extraLen = view.getUint16(ptr + 30, true);
    const commentLen = view.getUint16(ptr + 32, true);

    const nameBytes = bytes.slice(ptr + 46, ptr + 46 + nameLen);
    filenames.push(decoder.decode(nameBytes));

    ptr += 46 + nameLen + extraLen + commentLen;
  }

  return {
    filenames,
    fileCount: filenames.length,
    valid: true,
  };
}
