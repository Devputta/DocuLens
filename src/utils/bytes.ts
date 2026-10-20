export function pdfBytes(buf: ArrayBuffer): Uint8Array {
  // Always hand pdf.js a private copy so the caller's buffer is never detached.
  return new Uint8Array(buf.slice(0));
}
