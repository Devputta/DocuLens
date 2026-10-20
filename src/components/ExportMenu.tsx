import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown, Download } from 'lucide-react';

export interface ExportMenuItem {
  label: string;
  hint?: string;
  icon?: React.ReactNode;
  onClick: () => void;
}

export interface ExportMenuProps {
  items: ExportMenuItem[];
  label?: string;
  icon?: React.ReactNode;
  disabled?: boolean;
  disabledTooltip?: string;
  className?: string;
  buttonClassName?: string;
}

/**
 * Reusable dropdown menu for consistent exports across DocuLens views.
 * Meets keyboard accessibility (Escape, outside click), aria-haspopup="menu",
 * role="menu" and role="menuitem", 32px height, and amber focus ring.
 */
export const ExportMenu: React.FC<ExportMenuProps> = ({
  items,
  label = 'Export',
  icon,
  disabled = false,
  disabledTooltip,
  className = '',
  buttonClassName = '',
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  // Close on Escape key
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsOpen(false);
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  const handleToggle = () => {
    if (disabled) return;
    setIsOpen((prev) => !prev);
  };

  const handleItemClick = (item: ExportMenuItem) => {
    setIsOpen(false);
    item.onClick();
  };

  return (
    <div ref={containerRef} className={`relative inline-block text-left ${className}`}>
      <button
        type="button"
        onClick={handleToggle}
        disabled={disabled}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        title={disabled && disabledTooltip ? disabledTooltip : undefined}
        className={`h-8 px-3 text-[13px] font-medium inline-flex items-center gap-1.5 rounded-md border border-[#262D38] hover:border-[#E8A94A] bg-[#161B22] hover:bg-[#1D242E] text-[#E6E9EF] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E8A94A] focus-visible:ring-offset-2 focus-visible:ring-offset-[#0F1217] transition-colors duration-150 shadow-xs cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-[#161B22] disabled:hover:border-[#262D38] ${buttonClassName}`}
      >
        {icon || <Download className="w-3.5 h-3.5 text-[#E8A94A]" />}
        <span>{label}</span>
        <ChevronDown
          className={`w-3.5 h-3.5 text-[#9AA3B2] transition-transform duration-150 ${
            isOpen ? 'rotate-180 text-[#E8A94A]' : ''
          }`}
        />
      </button>

      {isOpen && (
        <div
          ref={menuRef}
          role="menu"
          aria-orientation="vertical"
          className="absolute right-0 top-full mt-1.5 w-64 rounded-md bg-[#161B22] border border-[#262D38] shadow-xl p-1 z-50 focus:outline-none"
        >
          {items.map((item, idx) => (
            <button
              key={idx}
              role="menuitem"
              type="button"
              onClick={() => handleItemClick(item)}
              className="w-full text-left px-3 py-2 rounded text-[13px] text-[#E6E9EF] hover:bg-[#1D242E] focus:bg-[#1D242E] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E8A94A] focus-visible:ring-offset-2 focus-visible:ring-offset-[#0F1217] transition-colors flex items-start gap-2.5 group cursor-pointer"
            >
              {item.icon && (
                <span className="shrink-0 mt-0.5 text-[#9AA3B2] group-hover:text-[#E8A94A] transition-colors">
                  {item.icon}
                </span>
              )}
              <div className="flex-1 min-w-0">
                <div className="font-medium text-[#E6E9EF] group-hover:text-[#E8A94A] transition-colors">
                  {item.label}
                </div>
                {item.hint && (
                  <div className="text-[11px] text-[#9AA3B2] mt-0.5 leading-tight">
                    {item.hint}
                  </div>
                )}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
