import React from 'react';

/**
 * Renders text with:
 *  - Line breaks on \n
 *  - Numbers & percentages highlighted in red
 *  - "未达标" / "异常" keywords highlighted in red
 */
export default function AnomalyText({ text }: { text: string }) {
  if (!text) return null;

  // Normalize separators: ; and ；→ newline, then split
  const normalized = text.replace(/；/g, '\n').replace(/;/g, '\n');
  const lines = normalized.split('\n').map(l => l.trim()).filter(Boolean);

  return (
    <div className="space-y-0.5">
      {lines.map((line, i) => (
        <div key={i} className="text-sm leading-relaxed">
          {highlightLine(line)}
        </div>
      ))}
    </div>
  );
}

function highlightLine(line: string): React.ReactNode[] {
  // Split on number patterns and anomaly keywords
  const parts = line.split(/(\d+\.?\d*%?|未达标|异常|需关注)/g);

  return parts.map((part, i) => {
    if (/^\d+\.?\d*%?$/.test(part)) {
      return (
        <span key={i} className="text-red-500 font-medium">
          {part}
        </span>
      );
    }
    if (part === '未达标' || part === '异常' || part === '需关注') {
      return (
        <span key={i} className="text-red-500 font-medium">
          {part}
        </span>
      );
    }
    return <span key={i}>{part}</span>;
  });
}
