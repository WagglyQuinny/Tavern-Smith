import React, { useState, useRef, useEffect } from 'react';
import { HelpCircle } from 'lucide-react';

interface TooltipProps {
  content: string;
  title?: string;
  children?: React.ReactNode;
  position?: 'top' | 'bottom' | 'left' | 'right';
}

export const Tooltip: React.FC<TooltipProps> = ({
  content,
  title,
  children,
  position = 'top',
}) => {
  const [visible, setVisible] = useState(false);
  const timeoutRef = useRef<number | null>(null);

  const handleMouseEnter = () => {
    if (timeoutRef.current) window.clearTimeout(timeoutRef.current);
    timeoutRef.current = window.setTimeout(() => {
      setVisible(true);
    }, 120);
  };

  const handleMouseLeave = () => {
    if (timeoutRef.current) window.clearTimeout(timeoutRef.current);
    setVisible(false);
  };

  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        window.clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  const positionClasses: Record<string, string> = {
    top: 'bottom-full left-1/2 -translate-x-1/2 mb-2',
    bottom: 'top-full left-1/2 -translate-x-1/2 mt-2',
    left: 'right-full top-1/2 -translate-y-1/2 mr-2',
    right: 'left-full top-1/2 -translate-y-1/2 ml-2',
  };

  return (
    <span
      className="relative inline-flex items-center"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onFocus={handleMouseEnter}
      onBlur={handleMouseLeave}
    >
      {children ?? (
        <button
          type="button"
          tabIndex={0}
          aria-label={title || content}
          className="text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300 transition-colors focus:outline-none"
        >
          <HelpCircle className="w-3.5 h-3.5" />
        </button>
      )}
      {visible && (
        <span
          role="tooltip"
          style={{ borderColor: 'var(--theme-accent)' }}
          className={`pointer-events-none absolute z-50 w-64 rounded-md border bg-white dark:bg-slate-900 p-2.5 text-left text-xs leading-relaxed text-slate-700 dark:text-slate-200 shadow-lg transition-opacity duration-150 ${positionClasses[position]}`}
        >
          {title && (
            <span className="block font-semibold text-slate-900 dark:text-white mb-1">
              {title}
            </span>
          )}
          <span className="block font-normal text-slate-600 dark:text-slate-300">
            {content}
          </span>
        </span>
      )}
    </span>
  );
};
