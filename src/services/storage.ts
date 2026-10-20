/**
 * Local-First IndexedDB Storage Layer
 * Offline accessibility, persistence across restarts, zero network requirement.
 */

import {
  DocumentEntity,
  DocumentElement,
  DocumentChunk,
  DocumentTable,
  InquiryMessage,
  InquiryConversation,
  ComparisonResult,
  MarginaliaNote,
  DocuLensBackup,
  ImportResult,
  DocumentFigure,
  FigureSummary,
} from '../types/doculens';

const DB_NAME = 'doculens_local_store_v1';
const DB_VERSION = 4;
export const CURRENT_BACKUP_SCHEMA_VERSION = 1;

class LocalDatabase {
  private dbPromise: Promise<IDBDatabase> | null = null;

  private getDB(): Promise<IDBDatabase> {
    if (this.dbPromise) return this.dbPromise;

    this.dbPromise = new Promise((resolve, reject) => {
      const idb =
        typeof window !== 'undefined' && window.indexedDB
          ? window.indexedDB
          : typeof indexedDB !== 'undefined'
          ? indexedDB
          : null;

      if (!idb) {
        reject(new Error('IndexedDB is not supported in this environment'));
        return;
      }

      const request = idb.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains('documents')) {
          db.createObjectStore('documents', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('elements')) {
          const store = db.createObjectStore('elements', { keyPath: 'id' });
          store.createIndex('documentId', 'documentId', { unique: false });
        }
        if (!db.objectStoreNames.contains('chunks')) {
          const store = db.createObjectStore('chunks', { keyPath: 'id' });
          store.createIndex('documentId', 'documentId', { unique: false });
        }
        if (!db.objectStoreNames.contains('tables')) {
          const store = db.createObjectStore('tables', { keyPath: 'id' });
          store.createIndex('documentId', 'documentId', { unique: false });
        }
        if (!db.objectStoreNames.contains('inquiries')) {
          db.createObjectStore('inquiries', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('conversations')) {
          db.createObjectStore('conversations', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('comparisons')) {
          db.createObjectStore('comparisons', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('notes')) {
          const store = db.createObjectStore('notes', { keyPath: 'id' });
          store.createIndex('documentId', 'documentId', { unique: false });
        }
        if (!db.objectStoreNames.contains('pdf_sources')) {
          db.createObjectStore('pdf_sources', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('thumbnails')) {
          const thumbStore = db.createObjectStore('thumbnails', { keyPath: 'id' });
          thumbStore.createIndex('documentId', 'documentId', { unique: false });
        }
        if (!db.objectStoreNames.contains('figures')) {
          const figStore = db.createObjectStore('figures', { keyPath: 'id' });
          figStore.createIndex('documentId', 'documentId', { unique: false });
          figStore.createIndex('pageNumber', 'pageNumber', { unique: false });
        }
      };

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });

    return this.dbPromise;
  }

  // --- Document Operations ---
  async getDocuments(): Promise<DocumentEntity[]> {
    try {
      const db = await this.getDB();
      return new Promise((resolve, reject) => {
        const tx = db.transaction('documents', 'readonly');
        const store = tx.objectStore('documents');
        const req = store.getAll();
        req.onsuccess = () => resolve(req.result || []);
        req.onerror = () => reject(req.error);
      });
    } catch {
      if (typeof localStorage !== 'undefined') {
        const saved = localStorage.getItem('doculens_documents_backup');
        return saved ? JSON.parse(saved) : [];
      }
      return [];
    }
  }

  async saveDocument(doc: DocumentEntity): Promise<void> {
    try {
      const db = await this.getDB();
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction('documents', 'readwrite');
        const store = tx.objectStore('documents');
        const req = store.put(doc);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      });
    } catch {
      if (typeof localStorage !== 'undefined') {
        const docs = await this.getDocuments();
        const updated = docs.filter((d) => d.id !== doc.id).concat(doc);
        localStorage.setItem('doculens_documents_backup', JSON.stringify(updated));
      }
    }
  }

  async getDocumentByHash(sha256: string): Promise<DocumentEntity | undefined> {
    const docs = await this.getDocuments();
    return docs.find((d) => d.sha256.toLowerCase() === sha256.toLowerCase());
  }

  async deleteDocument(id: string): Promise<void> {
    try {
      const db = await this.getDB();
      await new Promise<void>((resolve, reject) => {
        const storeNames = ['documents', 'elements', 'chunks', 'tables', 'notes'];
        if (db.objectStoreNames.contains('pdf_sources')) {
          storeNames.push('pdf_sources');
        }
        if (db.objectStoreNames.contains('thumbnails')) {
          storeNames.push('thumbnails');
        }
        if (db.objectStoreNames.contains('figures')) {
          storeNames.push('figures');
        }
        if (db.objectStoreNames.contains('inquiries')) {
          storeNames.push('inquiries');
        }
        if (db.objectStoreNames.contains('conversations')) {
          storeNames.push('conversations');
        }

        const tx = db.transaction(storeNames, 'readwrite');
        tx.objectStore('documents').delete(id);

        if (db.objectStoreNames.contains('pdf_sources')) {
          tx.objectStore('pdf_sources').delete(id);
        }

        // Remove cascading records
        const deleteByDoc = (storeName: string) => {
          if (!db.objectStoreNames.contains(storeName)) return;
          const store = tx.objectStore(storeName);
          const index = store.index('documentId');
          const cursorReq = index.openKeyCursor(IDBKeyRange.only(id));
          cursorReq.onsuccess = () => {
            const cursor = cursorReq.result;
            if (cursor) {
              store.delete(cursor.primaryKey);
              cursor.continue();
            }
          };
        };

        deleteByDoc('elements');
        deleteByDoc('chunks');
        deleteByDoc('tables');
        deleteByDoc('notes');
        deleteByDoc('thumbnails');
        deleteByDoc('figures');

        // Mark citations referencing deleted document as "source removed"
        if (db.objectStoreNames.contains('inquiries')) {
          const inqStore = tx.objectStore('inquiries');
          const cursorReq = inqStore.openCursor();
          cursorReq.onsuccess = () => {
            const cursor = cursorReq.result;
            if (cursor) {
              const msg = cursor.value as InquiryMessage;
              let modified = false;
              if (msg.evidence && msg.evidence.length > 0) {
                for (const ev of msg.evidence) {
                  if (ev.documentId === id) {
                    ev.verified = false;
                    ev.verificationDetails = 'source removed';
                    ev.rejectionReason = 'source removed';
                    modified = true;
                  }
                }
              }
              if (modified) {
                msg.verificationStatus = 'insufficient_evidence';
                cursor.update(msg);
              }
              cursor.continue();
            }
          };
        }

        if (db.objectStoreNames.contains('conversations')) {
          const convStore = tx.objectStore('conversations');
          const cursorReq = convStore.openCursor();
          cursorReq.onsuccess = () => {
            const cursor = cursorReq.result;
            if (cursor) {
              const conv = cursor.value as InquiryConversation;
              let modified = false;
              if (conv.messages) {
                for (const msg of conv.messages) {
                  if (msg.evidence && msg.evidence.length > 0) {
                    for (const ev of msg.evidence) {
                      if (ev.documentId === id) {
                        ev.verified = false;
                        ev.verificationDetails = 'source removed';
                        ev.rejectionReason = 'source removed';
                        modified = true;
                      }
                    }
                    if (modified) {
                      msg.verificationStatus = 'insufficient_evidence';
                    }
                  }
                }
              }
              if (modified) {
                cursor.update(conv);
              }
              cursor.continue();
            }
          };
        }

        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    } catch {
      if (typeof localStorage !== 'undefined') {
        const docs = (await this.getDocuments()).filter((d) => d.id !== id);
        localStorage.setItem('doculens_documents_backup', JSON.stringify(docs));

        const updateCitations = (items: any[]) => {
          return items.map((item) => {
            if (item.messages) {
              item.messages.forEach((m: any) => {
                if (m.evidence) {
                  m.evidence.forEach((ev: any) => {
                    if (ev.documentId === id) {
                      ev.verified = false;
                      ev.verificationDetails = 'source removed';
                      ev.rejectionReason = 'source removed';
                    }
                  });
                }
              });
            } else if (item.evidence) {
              item.evidence.forEach((ev: any) => {
                if (ev.documentId === id) {
                  ev.verified = false;
                  ev.verificationDetails = 'source removed';
                  ev.rejectionReason = 'source removed';
                }
              });
            }
            return item;
          });
        };

        const rawInqs = localStorage.getItem('doculens_inquiries_backup');
        if (rawInqs) {
          localStorage.setItem('doculens_inquiries_backup', JSON.stringify(updateCitations(JSON.parse(rawInqs))));
        }
        const rawConvs = localStorage.getItem('doculens_conversations_backup');
        if (rawConvs) {
          localStorage.setItem('doculens_conversations_backup', JSON.stringify(updateCitations(JSON.parse(rawConvs))));
        }
      }
    }
  }

  // --- PDF Source Operations ---
  async savePdfSource(documentId: string, source: ArrayBuffer | Blob): Promise<void> {
    if (source instanceof ArrayBuffer && source.byteLength === 0) {
      console.warn("PDF source buffer is empty/detached, skipping");
      return;
    }

    try {
      const payload = source instanceof Blob ? source : new Blob([source], { type: 'application/pdf' });
      const db = await this.getDB();
      if (!db.objectStoreNames.contains('pdf_sources')) return;
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction('pdf_sources', 'readwrite');
        tx.objectStore('pdf_sources').put({ id: documentId, buffer: payload, createdAt: Date.now() });
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
      });
    } catch (e) {
      console.warn('Failed to save PDF source to IndexedDB:', e);
    }
  }

  async getPdfSource(documentId: string): Promise<ArrayBuffer | null> {
    try {
      const db = await this.getDB();
      if (!db.objectStoreNames.contains('pdf_sources')) return null;
      return new Promise((resolve) => {
        const tx = db.transaction('pdf_sources', 'readonly');
        const req = tx.objectStore('pdf_sources').get(documentId);
        req.onsuccess = async () => {
          const res = req.result;
          if (!res) {
            resolve(null);
            return;
          }
          if (res.buffer instanceof ArrayBuffer) {
            resolve(res.buffer);
          } else if (res.buffer && typeof res.buffer.arrayBuffer === 'function') {
            try {
              const buf = await res.buffer.arrayBuffer();
              resolve(buf);
            } catch {
              resolve(null);
            }
          } else if (res instanceof ArrayBuffer) {
            resolve(res);
          } else {
            resolve(null);
          }
        };
        req.onerror = () => resolve(null);
      });
    } catch {
      return null;
    }
  }

  async hasPdfSource(documentId: string): Promise<boolean> {
    try {
      const db = await this.getDB();
      if (!db.objectStoreNames.contains('pdf_sources')) return false;
      return new Promise((resolve) => {
        const tx = db.transaction('pdf_sources', 'readonly');
        const req = tx.objectStore('pdf_sources').count(IDBKeyRange.only(documentId));
        req.onsuccess = () => resolve(req.result > 0);
        req.onerror = () => resolve(false);
      });
    } catch {
      return false;
    }
  }

  async deletePdfSource(documentId: string): Promise<void> {
    try {
      const db = await this.getDB();
      if (!db.objectStoreNames.contains('pdf_sources')) return;
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction('pdf_sources', 'readwrite');
        tx.objectStore('pdf_sources').delete(documentId);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    } catch (e) {
      console.warn('Failed to delete PDF source:', e);
    }
  }

  // --- Thumbnail Operations ---
  async saveThumbnail(documentId: string, pageNumber: number, blob: Blob): Promise<void> {
    try {
      const db = await this.getDB();
      if (!db.objectStoreNames.contains('thumbnails')) return;
      const id = `${documentId}_p${pageNumber}`;
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction('thumbnails', 'readwrite');
        tx.objectStore('thumbnails').put({
          id,
          documentId,
          pageNumber,
          blob,
          createdAt: Date.now(),
        });
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    } catch (e) {
      console.warn('Failed to save thumbnail to IndexedDB:', e);
    }
  }

  async getThumbnail(documentId: string, pageNumber: number): Promise<Blob | null> {
    try {
      const db = await this.getDB();
      if (!db.objectStoreNames.contains('thumbnails')) return null;
      const id = `${documentId}_p${pageNumber}`;
      return new Promise((resolve) => {
        const tx = db.transaction('thumbnails', 'readonly');
        const req = tx.objectStore('thumbnails').get(id);
        req.onsuccess = () => {
          const res = req.result;
          if (res && res.blob) {
            resolve(res.blob);
          } else {
            resolve(null);
          }
        };
        req.onerror = () => resolve(null);
      });
    } catch {
      return null;
    }
  }

  async deleteThumbnailsByDocument(documentId: string): Promise<void> {
    try {
      const db = await this.getDB();
      if (!db.objectStoreNames.contains('thumbnails')) return;
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction('thumbnails', 'readwrite');
        const store = tx.objectStore('thumbnails');
        const index = store.index('documentId');
        const cursorReq = index.openKeyCursor(IDBKeyRange.only(documentId));
        cursorReq.onsuccess = () => {
          const cursor = cursorReq.result;
          if (cursor) {
            store.delete(cursor.primaryKey);
            cursor.continue();
          }
        };
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    } catch (e) {
      console.warn('Failed to delete thumbnails by document:', e);
    }
  }

  // --- Figure Operations ---
  async saveFigure(figure: DocumentFigure): Promise<void> {
    try {
      const db = await this.getDB();
      if (!db.objectStoreNames.contains('figures')) return;
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction('figures', 'readwrite');
        tx.objectStore('figures').put(figure);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    } catch (e) {
      console.warn('Failed to save figure to IndexedDB:', e);
    }
  }

  async saveFigures(figures: DocumentFigure[]): Promise<void> {
    if (!figures.length) return;
    try {
      const db = await this.getDB();
      if (!db.objectStoreNames.contains('figures')) return;
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction('figures', 'readwrite');
        const store = tx.objectStore('figures');
        for (const fig of figures) {
          store.put(fig);
        }
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    } catch (e) {
      console.warn('Failed to save figures batch to IndexedDB:', e);
    }
  }

  async getFigure(id: string): Promise<DocumentFigure | undefined> {
    try {
      const db = await this.getDB();
      if (!db.objectStoreNames.contains('figures')) return undefined;
      return new Promise((resolve) => {
        const tx = db.transaction('figures', 'readonly');
        const req = tx.objectStore('figures').get(id);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => resolve(undefined);
      });
    } catch {
      return undefined;
    }
  }

  async getAllFigureSummaries(): Promise<FigureSummary[]> {
    try {
      const db = await this.getDB();
      if (!db.objectStoreNames.contains('figures')) return [];
      return new Promise((resolve, reject) => {
        const tx = db.transaction('figures', 'readonly');
        const store = tx.objectStore('figures');
        const req = store.openCursor();
        const summaries: FigureSummary[] = [];
        req.onsuccess = () => {
          const cursor = req.result;
          if (cursor) {
            const val = cursor.value as DocumentFigure;
            let thumbUrl: string | undefined = undefined;
            if (val.thumbnailBlob && typeof URL !== 'undefined' && URL.createObjectURL) {
              try {
                thumbUrl = URL.createObjectURL(val.thumbnailBlob);
              } catch {
                // ignore
              }
            }
            summaries.push({
              id: val.id,
              documentId: val.documentId,
              pageNumber: val.pageNumber,
              bbox: val.bbox,
              width: val.width,
              height: val.height,
              type: val.type,
              hash: val.hash,
              caption: val.caption,
              captionElementId: val.captionElementId,
              captionLabel: val.captionLabel,
              captionStatus: val.captionStatus,
              ocrText: val.ocrText,
              ocrConfidence: val.ocrConfidence,
              ocrLanguage: val.ocrLanguage,
              ocrAt: val.ocrAt,
              createdAt: val.createdAt,
              thumbnailUrl: thumbUrl,
            });
            cursor.continue();
          } else {
            resolve(summaries);
          }
        };
        req.onerror = () => reject(req.error);
      });
    } catch {
      return [];
    }
  }

  async getFigureSummariesByDocument(documentId: string): Promise<FigureSummary[]> {
    try {
      const db = await this.getDB();
      if (!db.objectStoreNames.contains('figures')) return [];
      return new Promise((resolve, reject) => {
        const tx = db.transaction('figures', 'readonly');
        const store = tx.objectStore('figures');
        const index = store.index('documentId');
        const req = index.openCursor(IDBKeyRange.only(documentId));
        const summaries: FigureSummary[] = [];
        req.onsuccess = () => {
          const cursor = req.result;
          if (cursor) {
            const val = cursor.value as DocumentFigure;
            let thumbUrl: string | undefined = undefined;
            if (val.thumbnailBlob && typeof URL !== 'undefined' && URL.createObjectURL) {
              try {
                thumbUrl = URL.createObjectURL(val.thumbnailBlob);
              } catch {
                // ignore
              }
            }
            summaries.push({
              id: val.id,
              documentId: val.documentId,
              pageNumber: val.pageNumber,
              bbox: val.bbox,
              width: val.width,
              height: val.height,
              type: val.type,
              hash: val.hash,
              caption: val.caption,
              captionElementId: val.captionElementId,
              captionLabel: val.captionLabel,
              captionStatus: val.captionStatus,
              ocrText: val.ocrText,
              ocrConfidence: val.ocrConfidence,
              ocrLanguage: val.ocrLanguage,
              ocrAt: val.ocrAt,
              createdAt: val.createdAt,
              thumbnailUrl: thumbUrl,
            });
            cursor.continue();
          } else {
            resolve(summaries);
          }
        };
        req.onerror = () => reject(req.error);
      });
    } catch {
      return [];
    }
  }

  async getAllFigures(): Promise<DocumentFigure[]> {
    try {
      const db = await this.getDB();
      if (!db.objectStoreNames.contains('figures')) return [];
      return new Promise((resolve) => {
        const tx = db.transaction('figures', 'readonly');
        const req = tx.objectStore('figures').getAll();
        req.onsuccess = () => resolve(req.result || []);
        req.onerror = () => resolve([]);
      });
    } catch {
      return [];
    }
  }

  async getFiguresByDocument(documentId: string): Promise<DocumentFigure[]> {
    try {
      const db = await this.getDB();
      if (!db.objectStoreNames.contains('figures')) return [];
      return new Promise((resolve) => {
        const tx = db.transaction('figures', 'readonly');
        const index = tx.objectStore('figures').index('documentId');
        const req = index.getAll(IDBKeyRange.only(documentId));
        req.onsuccess = () => resolve(req.result || []);
        req.onerror = () => resolve([]);
      });
    } catch {
      return [];
    }
  }

  async deleteFiguresByDocument(documentId: string): Promise<void> {
    try {
      const db = await this.getDB();
      if (!db.objectStoreNames.contains('figures')) return;
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction('figures', 'readwrite');
        const store = tx.objectStore('figures');
        const index = store.index('documentId');
        const cursorReq = index.openKeyCursor(IDBKeyRange.only(documentId));
        cursorReq.onsuccess = () => {
          const cursor = cursorReq.result;
          if (cursor) {
            store.delete(cursor.primaryKey);
            cursor.continue();
          }
        };
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    } catch (e) {
      console.warn('Failed to delete figures by document:', e);
    }
  }

  async deleteChunksByFigure(figureId: string): Promise<void> {
    try {
      const db = await this.getDB();
      if (!db.objectStoreNames.contains('chunks')) return;
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction('chunks', 'readwrite');
        const store = tx.objectStore('chunks');
        const req = store.openCursor();
        req.onsuccess = () => {
          const cursor = req.result;
          if (cursor) {
            const chunk = cursor.value as DocumentChunk;
            if (chunk.figureId === figureId || chunk.sourceType === 'figure' && chunk.id.includes(figureId)) {
              store.delete(cursor.primaryKey);
            }
            cursor.continue();
          } else {
            resolve();
          }
        };
        req.onerror = () => reject(req.error);
      });
    } catch (e) {
      console.warn('Failed to delete chunks by figure:', e);
    }
  }

  async deleteFigure(id: string): Promise<void> {
    try {
      const db = await this.getDB();
      if (db.objectStoreNames.contains('figures')) {
        await new Promise<void>((resolve, reject) => {
          const tx = db.transaction('figures', 'readwrite');
          tx.objectStore('figures').delete(id);
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error);
        });
      }
      // Also remove any search index chunks created from this figure's OCR
      await this.deleteChunksByFigure(id);
    } catch (e) {
      console.warn('Failed to delete figure:', e);
    }
  }

  // --- Elements Operations ---
  async saveElements(elements: DocumentElement[]): Promise<void> {
    if (!elements.length) return;
    try {
      const db = await this.getDB();
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction('elements', 'readwrite');
        const store = tx.objectStore('elements');
        for (const el of elements) {
          store.put(el);
        }
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    } catch (e) {
      console.warn('Fallback save elements', e);
    }
  }

  async getElementsByDocument(documentId: string): Promise<DocumentElement[]> {
    try {
      const db = await this.getDB();
      return new Promise((resolve, reject) => {
        const tx = db.transaction('elements', 'readonly');
        const store = tx.objectStore('elements');
        const index = store.index('documentId');
        const req = index.getAll(IDBKeyRange.only(documentId));
        req.onsuccess = () => resolve(req.result || []);
        req.onerror = () => reject(req.error);
      });
    } catch {
      return [];
    }
  }

  async getAllElements(): Promise<DocumentElement[]> {
    try {
      const db = await this.getDB();
      return new Promise((resolve, reject) => {
        const tx = db.transaction('elements', 'readonly');
        const store = tx.objectStore('elements');
        const req = store.getAll();
        req.onsuccess = () => resolve(req.result || []);
        req.onerror = () => reject(req.error);
      });
    } catch {
      return [];
    }
  }

  // --- Chunks Operations ---
  async saveChunks(chunks: DocumentChunk[]): Promise<void> {
    if (!chunks.length) return;
    try {
      const db = await this.getDB();
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction('chunks', 'readwrite');
        const store = tx.objectStore('chunks');
        for (const chunk of chunks) {
          store.put(chunk);
        }
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    } catch (e) {
      console.warn('Fallback save chunks', e);
    }
  }

  async getAllChunks(): Promise<DocumentChunk[]> {
    try {
      const db = await this.getDB();
      return new Promise((resolve, reject) => {
        const tx = db.transaction('chunks', 'readonly');
        const store = tx.objectStore('chunks');
        const req = store.getAll();
        req.onsuccess = () => resolve(req.result || []);
        req.onerror = () => reject(req.error);
      });
    } catch {
      return [];
    }
  }

  async getChunksByDocument(documentId: string): Promise<DocumentChunk[]> {
    try {
      const db = await this.getDB();
      return new Promise((resolve, reject) => {
        const tx = db.transaction('chunks', 'readonly');
        const store = tx.objectStore('chunks');
        const index = store.index('documentId');
        const req = index.getAll(IDBKeyRange.only(documentId));
        req.onsuccess = () => resolve(req.result || []);
        req.onerror = () => reject(req.error);
      });
    } catch {
      return [];
    }
  }

  // --- Tables Operations ---
  async saveTable(table: DocumentTable): Promise<void> {
    try {
      const db = await this.getDB();
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction('tables', 'readwrite');
        tx.objectStore('tables').put(table);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    } catch (e) {
      console.warn('Fallback save table', e);
    }
  }

  async saveTables(tables: DocumentTable[]): Promise<void> {
    if (!tables.length) return;
    try {
      const db = await this.getDB();
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction('tables', 'readwrite');
        const store = tx.objectStore('tables');
        for (const table of tables) {
          store.put(table);
        }
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    } catch (e) {
      console.warn('Fallback save tables', e);
    }
  }

  async getTable(id: string): Promise<DocumentTable | undefined> {
    try {
      const db = await this.getDB();
      return new Promise((resolve, reject) => {
        const tx = db.transaction('tables', 'readonly');
        const store = tx.objectStore('tables');
        const req = store.get(id);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
    } catch {
      return undefined;
    }
  }

  async getAllTables(): Promise<DocumentTable[]> {
    try {
      const db = await this.getDB();
      return new Promise((resolve, reject) => {
        const tx = db.transaction('tables', 'readonly');
        const store = tx.objectStore('tables');
        const req = store.getAll();
        req.onsuccess = () => resolve(req.result || []);
        req.onerror = () => reject(req.error);
      });
    } catch {
      return [];
    }
  }

  // --- Inquiries Operations ---
  async getInquiries(): Promise<InquiryMessage[]> {
    try {
      const db = await this.getDB();
      return new Promise((resolve, reject) => {
        const tx = db.transaction('inquiries', 'readonly');
        const store = tx.objectStore('inquiries');
        const req = store.getAll();
        req.onsuccess = () => resolve(req.result || []);
        req.onerror = () => reject(req.error);
      });
    } catch {
      if (typeof localStorage !== 'undefined') {
        const saved = localStorage.getItem('doculens_inquiries_backup');
        return saved ? JSON.parse(saved) : [];
      }
      return [];
    }
  }

  async saveInquiry(message: InquiryMessage): Promise<void> {
    try {
      const db = await this.getDB();
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction('inquiries', 'readwrite');
        tx.objectStore('inquiries').put(message);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    } catch {
      if (typeof localStorage !== 'undefined') {
        const saved = await this.getInquiries();
        localStorage.setItem(
          'doculens_inquiries_backup',
          JSON.stringify([...saved, message])
        );
      }
    }
  }

  async clearInquiries(): Promise<void> {
    try {
      const db = await this.getDB();
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction('inquiries', 'readwrite');
        tx.objectStore('inquiries').clear();
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    } catch {
      if (typeof localStorage !== 'undefined') {
        localStorage.removeItem('doculens_inquiries_backup');
      }
    }
  }

  // --- Conversations Operations ---
  async getConversations(): Promise<InquiryConversation[]> {
    try {
      const db = await this.getDB();
      if (!db.objectStoreNames.contains('conversations')) {
        if (typeof localStorage !== 'undefined') {
          const saved = localStorage.getItem('doculens_conversations_backup');
          return saved ? JSON.parse(saved) : [];
        }
        return [];
      }
      return new Promise((resolve, reject) => {
        const tx = db.transaction('conversations', 'readonly');
        const store = tx.objectStore('conversations');
        const req = store.getAll();
        req.onsuccess = () => resolve(req.result || []);
        req.onerror = () => reject(req.error);
      });
    } catch {
      if (typeof localStorage !== 'undefined') {
        const saved = localStorage.getItem('doculens_conversations_backup');
        return saved ? JSON.parse(saved) : [];
      }
      return [];
    }
  }

  async getConversation(id: string): Promise<InquiryConversation | undefined> {
    const list = await this.getConversations();
    return list.find((c) => c.id === id);
  }

  async saveConversation(conv: InquiryConversation): Promise<void> {
    try {
      const db = await this.getDB();
      if (db.objectStoreNames.contains('conversations')) {
        await new Promise<void>((resolve, reject) => {
          const tx = db.transaction('conversations', 'readwrite');
          tx.objectStore('conversations').put(conv);
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error);
        });
      }
    } catch {
      // ignore
    }
    if (typeof localStorage !== 'undefined') {
      const saved = await this.getConversations();
      const filtered = saved.filter((c) => c.id !== conv.id);
      localStorage.setItem(
        'doculens_conversations_backup',
        JSON.stringify([...filtered, conv])
      );
    }
  }

  async deleteConversation(id: string): Promise<void> {
    try {
      const db = await this.getDB();
      if (db.objectStoreNames.contains('conversations')) {
        await new Promise<void>((resolve, reject) => {
          const tx = db.transaction('conversations', 'readwrite');
          tx.objectStore('conversations').delete(id);
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error);
        });
      }
    } catch {
      // ignore
    }
    if (typeof localStorage !== 'undefined') {
      const saved = await this.getConversations();
      const filtered = saved.filter((c) => c.id !== id);
      localStorage.setItem('doculens_conversations_backup', JSON.stringify(filtered));
    }
  }

  // --- Comparisons Operations ---
  async getComparisons(): Promise<ComparisonResult[]> {
    try {
      const db = await this.getDB();
      return new Promise((resolve, reject) => {
        const tx = db.transaction('comparisons', 'readonly');
        const store = tx.objectStore('comparisons');
        const req = store.getAll();
        req.onsuccess = () => resolve(req.result || []);
        req.onerror = () => reject(req.error);
      });
    } catch {
      return [];
    }
  }

  async saveComparison(comparison: ComparisonResult): Promise<void> {
    try {
      const db = await this.getDB();
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction('comparisons', 'readwrite');
        tx.objectStore('comparisons').put(comparison);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    } catch (e) {
      console.warn('Fallback save comparison', e);
    }
  }

  // --- Marginalia Notes Operations ---
  async getNotes(documentId: string): Promise<MarginaliaNote[]> {
    try {
      const db = await this.getDB();
      return new Promise((resolve, reject) => {
        const tx = db.transaction('notes', 'readonly');
        const store = tx.objectStore('notes');
        const index = store.index('documentId');
        const req = index.getAll(IDBKeyRange.only(documentId));
        req.onsuccess = () => resolve(req.result || []);
        req.onerror = () => reject(req.error);
      });
    } catch {
      return [];
    }
  }

  async getAllNotes(): Promise<MarginaliaNote[]> {
    try {
      const db = await this.getDB();
      return new Promise((resolve, reject) => {
        const tx = db.transaction('notes', 'readonly');
        const store = tx.objectStore('notes');
        const req = store.getAll();
        req.onsuccess = () => resolve(req.result || []);
        req.onerror = () => reject(req.error);
      });
    } catch {
      return [];
    }
  }

  async saveNote(note: MarginaliaNote): Promise<void> {
    try {
      const db = await this.getDB();
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction('notes', 'readwrite');
        tx.objectStore('notes').put(note);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    } catch (e) {
      console.warn('Fallback save note', e);
    }
  }

  async deleteNote(noteId: string): Promise<void> {
    try {
      const db = await this.getDB();
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction('notes', 'readwrite');
        tx.objectStore('notes').delete(noteId);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    } catch (e) {
      console.warn('Fallback delete note', e);
    }
  }

  // --- Backup, Export & Single-Transaction Import ---
  async exportBackup(): Promise<DocuLensBackup> {
    const documents = await this.getDocuments();
    const chunks = await this.getAllChunks();
    const elements = await this.getAllElements();
    const tables = await this.getAllTables();
    const notes = await this.getAllNotes();
    const inquiries = await this.getInquiries();
    const conversations = await this.getConversations();
    const comparisons = await this.getComparisons();

    const timestamp = Date.now();
    return {
      schemaVersion: CURRENT_BACKUP_SCHEMA_VERSION,
      exportTimestamp: timestamp,
      exportedAt: new Date(timestamp).toISOString(),
      appName: 'DocuLens',
      documents,
      chunks,
      elements,
      tables,
      notes,
      inquiries,
      conversations,
      comparisons,
    };
  }

  /**
   * Imports a validated backup archive in a SINGLE atomic IndexedDB transaction.
   * Never runs partial imports: if any write fails, transaction aborts and rolls back completely.
   * Mode 'replace' clears stores first; mode 'merge' writes backup records alongside existing ones.
   */
  async atomicImport(
    backup: DocuLensBackup,
    mode: 'merge' | 'replace'
  ): Promise<ImportResult> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const storeNames = ['documents', 'elements', 'chunks', 'tables', 'notes'];
      if (db.objectStoreNames.contains('inquiries')) {
        storeNames.push('inquiries');
      }
      if (db.objectStoreNames.contains('comparisons')) {
        storeNames.push('comparisons');
      }

      let tx: IDBTransaction;
      try {
        tx = db.transaction(storeNames, 'readwrite');
      } catch (err: any) {
        reject(new Error(`Failed to initialize import transaction: ${err?.message || err}`));
        return;
      }

      let settled = false;

      tx.onabort = () => {
        if (settled) return;
        settled = true;
        const err = tx.error || new Error('Transaction was aborted');
        reject(new Error(`Import transaction aborted: ${err.message}`));
      };

      tx.onerror = () => {
        if (settled) return;
        settled = true;
        const err = tx.error || new Error('Transaction encountered an error');
        reject(new Error(`Import transaction failed: ${err.message}`));
      };

      tx.oncomplete = () => {
        if (settled) return;
        settled = true;
        resolve({
          documentsImported: backup.documents.length,
          elementsImported: backup.elements.length,
          chunksImported: backup.chunks.length,
          tablesImported: backup.tables.length,
          notesImported: backup.notes.length,
          mode,
        });
      };

      try {
        if (mode === 'replace') {
          for (const sName of storeNames) {
            tx.objectStore(sName).clear();
          }
        }

        const docStore = tx.objectStore('documents');
        for (const doc of backup.documents) {
          docStore.put(doc);
        }

        const elStore = tx.objectStore('elements');
        for (const el of backup.elements) {
          elStore.put(el);
        }

        const chunkStore = tx.objectStore('chunks');
        for (const chunk of backup.chunks) {
          chunkStore.put(chunk);
        }

        const tableStore = tx.objectStore('tables');
        for (const table of backup.tables) {
          tableStore.put(table);
        }

        const noteStore = tx.objectStore('notes');
        for (const note of backup.notes) {
          noteStore.put(note);
        }

        if (backup.inquiries && tx.objectStoreNames.contains('inquiries')) {
          const inqStore = tx.objectStore('inquiries');
          for (const inq of backup.inquiries) {
            inqStore.put(inq);
          }
        }

        if (backup.comparisons && tx.objectStoreNames.contains('comparisons')) {
          const compStore = tx.objectStore('comparisons');
          for (const comp of backup.comparisons) {
            compStore.put(comp);
          }
        }
      } catch (writeErr) {
        try {
          tx.abort();
        } catch {
          // ignore abort error if already aborting
        }
        if (!settled) {
          settled = true;
          reject(writeErr instanceof Error ? writeErr : new Error(String(writeErr)));
        }
      }
    });
  }

  /**
   * Resets all stores (primarily for testing and reset functionality)
   */
  async resetDatabase(): Promise<void> {
    try {
      const db = await this.getDB();
      await new Promise<void>((resolve, reject) => {
        const storeNames = ['documents', 'elements', 'chunks', 'tables', 'inquiries', 'comparisons', 'notes'];
        if (db.objectStoreNames.contains('pdf_sources')) storeNames.push('pdf_sources');
        if (db.objectStoreNames.contains('thumbnails')) storeNames.push('thumbnails');
        if (db.objectStoreNames.contains('figures')) storeNames.push('figures');
        const tx = db.transaction(storeNames, 'readwrite');
        for (const s of storeNames) {
          tx.objectStore(s).clear();
        }
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    } catch {
      if (typeof localStorage !== 'undefined') {
        localStorage.removeItem('doculens_documents_backup');
        localStorage.removeItem('doculens_inquiries_backup');
      }
    }
  }

  /**
   * Closes the active database connection (useful in test teardown)
   */
  async close(): Promise<void> {
    if (this.dbPromise) {
      try {
        const db = await this.dbPromise;
        db.close();
      } catch {
        // ignore
      }
      this.dbPromise = null;
    }
  }


  // --- Export & Diagnostic Storage ---
  async exportFullArchive(): Promise<string> {
    const documents = await this.getDocuments();
    const inquiries = await this.getInquiries();
    const comparisons = await this.getComparisons();
    const allChunks = await this.getAllChunks();
    const allTables = await this.getAllTables();

    const archive = {
      version: '1.0.0',
      exportedAt: new Date().toISOString(),
      documents,
      chunks: allChunks,
      tables: allTables,
      inquiries,
      comparisons,
    };
    return JSON.stringify(archive, null, 2);
  }

  async getStorageEstimate(): Promise<{ usedBytes: number; quotaBytes: number }> {
    if (navigator.storage && navigator.storage.estimate) {
      const est = await navigator.storage.estimate();
      return {
        usedBytes: est.usage || 0,
        quotaBytes: est.quota || 0,
      };
    }
    return { usedBytes: 0, quotaBytes: 0 };
  }

  /**
   * Audits storage integrity and purges orphaned records resulting from interrupted deletions.
   */
  async cleanupOrphanedRecords(): Promise<{
    orphanedElements: number;
    orphanedChunks: number;
    orphanedTables: number;
    orphanedNotes: number;
  }> {
    const docs = await this.getDocuments();
    const validDocIds = new Set(docs.map((d) => d.id));
    const result = {
      orphanedElements: 0,
      orphanedChunks: 0,
      orphanedTables: 0,
      orphanedNotes: 0,
    };

    try {
      const db = await this.getDB();
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(['elements', 'chunks', 'tables', 'notes'], 'readwrite');

        const cleanStore = (
          storeName: 'elements' | 'chunks' | 'tables' | 'notes',
          counterKey: keyof typeof result
        ) => {
          const store = tx.objectStore(storeName);
          const req = store.openCursor();
          req.onsuccess = () => {
            const cursor = req.result;
            if (cursor) {
              const record = cursor.value;
              if (record && record.documentId && !validDocIds.has(record.documentId)) {
                store.delete(cursor.primaryKey);
                result[counterKey]++;
              }
              cursor.continue();
            }
          };
        };

        cleanStore('elements', 'orphanedElements');
        cleanStore('chunks', 'orphanedChunks');
        cleanStore('tables', 'orphanedTables');
        cleanStore('notes', 'orphanedNotes');

        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    } catch (e) {
      console.warn('Storage cleanup warning:', e);
    }

    return result;
  }
}

export const storage = new LocalDatabase();
