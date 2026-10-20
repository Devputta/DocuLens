import { describe, it, expect, vi, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import { pdfBytes } from '../src/utils/bytes';
import { storage } from '../src/services/storage';

describe('PDF ArrayBuffer Detach Prevention & IndexedDB Persistence', () => {
  beforeEach(async () => {
    await storage.resetDatabase();
  });

  it('pdfBytes returns an independent copy so original ArrayBuffer is not detached', () => {
    const originalText = '%PDF-1.7 mock test content for pdfBytes copy';
    const originalBuffer = new TextEncoder().encode(originalText).buffer;
    const originalLength = originalBuffer.byteLength;

    expect(originalLength).toBeGreaterThan(0);

    // Call pdfBytes as passed to pdfjs.getDocument
    const bytesForWorker = pdfBytes(originalBuffer);

    // The copy has its own underlying buffer
    expect(bytesForWorker.buffer).not.toBe(originalBuffer);
    expect(bytesForWorker.byteLength).toBe(originalLength);

    // If a worker transfers/detaches bytesForWorker.buffer, originalBuffer is completely unaffected
    // (Simulate transfer using structuredClone with transfer list or slice)
    try {
      const channel = new MessageChannel();
      channel.port1.postMessage(bytesForWorker.buffer, [bytesForWorker.buffer]);
      // bytesForWorker.buffer is now transferred/detached
      expect(bytesForWorker.buffer.byteLength).toBe(0);
    } catch {
      // If structured transfer is not supported in the test runner, manually verify buffer isolation
      expect(bytesForWorker.buffer !== originalBuffer).toBe(true);
    }

    // Original buffer MUST still retain its non-zero byteLength
    expect(originalBuffer.byteLength).toBe(originalLength);
    expect(originalBuffer.byteLength).toBeGreaterThan(0);
  });

  it('savePdfSource followed by getPdfSource returns a non-empty buffer', async () => {
    const originalText = '%PDF-1.7 content for round trip storage verification';
    const originalBuffer = new TextEncoder().encode(originalText).buffer;

    expect(originalBuffer.byteLength).toBeGreaterThan(0);

    // Save to storage using original ArrayBuffer
    await storage.savePdfSource('doc-roundtrip-test', originalBuffer);

    // Original ArrayBuffer still has byteLength > 0 after savePdfSource
    expect(originalBuffer.byteLength).toBeGreaterThan(0);

    // Retrieve PDF source from IndexedDB
    const retrievedBuffer = await storage.getPdfSource('doc-roundtrip-test');
    expect(retrievedBuffer).not.toBeNull();
    expect(retrievedBuffer!.byteLength).toBe(originalBuffer.byteLength);

    const decoded = new TextDecoder().decode(retrievedBuffer!);
    expect(decoded).toBe(originalText);
  });

  it('savePdfSource safely handles and warns on empty or detached ArrayBuffer without throwing', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    // Create a 0-byte buffer (simulating detached buffer)
    const emptyBuffer = new ArrayBuffer(0);
    expect(emptyBuffer.byteLength).toBe(0);

    await storage.savePdfSource('doc-empty-test', emptyBuffer);

    expect(warnSpy).toHaveBeenCalledWith('PDF source buffer is empty/detached, skipping');
    warnSpy.mockRestore();

    const retrieved = await storage.getPdfSource('doc-empty-test');
    expect(retrieved).toBeNull();
  });

  it('savePdfSource accepts and persists Blob sources', async () => {
    const originalText = '%PDF-1.7 blob content';
    const blob = new Blob([new TextEncoder().encode(originalText)], { type: 'application/pdf' });

    await storage.savePdfSource('doc-blob-test', blob);

    const retrieved = await storage.getPdfSource('doc-blob-test');
    expect(retrieved).not.toBeNull();
    expect(retrieved!.byteLength).toBe(blob.size);

    const decoded = new TextDecoder().decode(retrieved!);
    expect(decoded).toBe(originalText);
  });
});
