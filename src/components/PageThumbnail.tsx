import React, { useState, useEffect, useRef } from 'react';
import { FileText } from 'lucide-react';
import { thumbnailService } from '../services/thumbnailService';

interface PageThumbnailProps {
  documentId: string;
  pageNumber: number;
  viewScope: 'reader' | 'library';
  className?: string;
  alt?: string;
}

export const PageThumbnail: React.FC<PageThumbnailProps> = ({
  documentId,
  pageNumber,
  viewScope,
  className = '',
  alt,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [status, setStatus] = useState<'idle' | 'loading' | 'loaded' | 'neutral'>('idle');

  useEffect(() => {
    let isSubscribed = true;
    const container = containerRef.current;
    if (!container) return;

    // Use IntersectionObserver to render lazily as items scroll into view
    if (typeof IntersectionObserver === 'undefined') {
      // Fallback if IntersectionObserver not available
      thumbnailService
        .requestThumbnail(documentId, pageNumber, viewScope)
        .then((url) => {
          if (!isSubscribed) return;
          if (url) {
            setImageUrl(url);
            setStatus('loaded');
          } else {
            setStatus('neutral');
          }
        })
        .catch(() => {
          if (isSubscribed) setStatus('neutral');
        });
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (entry && entry.isIntersecting) {
          // Disconnect once intersecting to begin rendering
          observer.disconnect();

          if (!isSubscribed) return;
          setStatus('loading');

          thumbnailService
            .requestThumbnail(documentId, pageNumber, viewScope)
            .then((url) => {
              if (!isSubscribed) return;
              if (url) {
                setImageUrl(url);
                setStatus('loaded');
              } else {
                // Document without a PDF source (e.g. demo document) or render failure
                setStatus('neutral');
              }
            })
            .catch(() => {
              if (isSubscribed) {
                setStatus('neutral');
              }
            });
        }
      },
      {
        rootMargin: '120px', // Pre-fetch slightly before it scrolls into visible frame
        threshold: 0.01,
      }
    );

    observer.observe(container);

    return () => {
      isSubscribed = false;
      observer.disconnect();
    };
  }, [documentId, pageNumber, viewScope]);

  return (
    <div
      ref={containerRef}
      className={`relative w-full h-full flex items-center justify-center overflow-hidden bg-paper-light ${className}`}
    >
      {/* 1. Loaded Image State */}
      {status === 'loaded' && imageUrl ? (
        <img
          src={imageUrl}
          alt={alt || `Thumbnail for page ${pageNumber}`}
          loading="lazy"
          className="w-full h-full object-contain pointer-events-none select-none transition-opacity duration-200"
        />
      ) : status === 'loading' ? (
        /* 2. Loading Skeleton State */
        <div className="w-full h-full p-2 flex flex-col justify-between animate-pulse bg-paper-dim/60">
          <div className="space-y-1.5">
            <div className="h-1.5 w-3/4 bg-paper-border rounded" />
            <div className="h-1.5 w-full bg-paper-border rounded" />
            <div className="h-1.5 w-5/6 bg-paper-border rounded" />
          </div>
          <div className="flex justify-between items-center text-[9px] font-mono text-ink-faint">
            <span className="w-4 h-1.5 bg-paper-border rounded" />
            <span>p.{pageNumber}</span>
          </div>
        </div>
      ) : status === 'neutral' ? (
        /* 3. Neutral Placeholder for documents without a PDF source (e.g. demo documents) */
        <div
          className="w-full h-full p-2 flex flex-col items-center justify-between text-ink-faint bg-paper-dim/40 border border-paper-border/50 select-none"
          title={`Page ${pageNumber} (Demo / Structured Text Source)`}
        >
          {/* Stylized document sheet icon with text lines */}
          <div className="w-full flex-1 flex flex-col items-center justify-center py-1">
            <div className="w-8 h-10 border border-paper-border-dark rounded-[3px] bg-paper p-1 flex flex-col justify-between shadow-2xs">
              <div className="space-y-1 w-full">
                <div className="h-1 w-2/3 bg-paper-border-dark rounded-xs" />
                <div className="h-0.5 w-full bg-paper-border rounded-xs" />
                <div className="h-0.5 w-4/5 bg-paper-border rounded-xs" />
                <div className="h-0.5 w-full bg-paper-border rounded-xs" />
              </div>
              <div className="text-[7px] font-mono text-ink-faint text-right font-medium">
                {pageNumber}
              </div>
            </div>
          </div>
          <span className="text-[9px] font-mono text-ink-faint">Page {pageNumber}</span>
        </div>
      ) : (
        /* 4. Idle / Off-screen placeholder */
        <div className="w-full h-full bg-paper-dim/30 flex items-center justify-center">
          <FileText className="w-4 h-4 text-ink-faint/40" />
        </div>
      )}
    </div>
  );
};
