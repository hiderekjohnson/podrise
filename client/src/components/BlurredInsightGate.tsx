import { useState, type ElementType, type HTMLAttributes, type KeyboardEvent } from "react";

interface BlurredInsightGateProps extends HTMLAttributes<HTMLElement> {
  children: React.ReactNode;
  onRevealClick: () => void;
  as?: ElementType;
}

export function BlurredInsightGate({ children, onRevealClick, as: Tag = "div", className = "", ...rest }: BlurredInsightGateProps) {
  const [showTooltip, setShowTooltip] = useState(false);

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onRevealClick();
    }
  };

  return (
    <Tag
      className={`relative cursor-pointer select-none ${className}`}
      onMouseEnter={() => setShowTooltip(true)}
      onMouseLeave={() => setShowTooltip(false)}
      onFocus={() => setShowTooltip(true)}
      onBlur={() => setShowTooltip(false)}
      onClick={onRevealClick}
      onKeyDown={handleKeyDown}
      role="button"
      tabIndex={0}
      data-testid="blurred-insight-gate"
      {...rest}
    >
      <div className="blur-[6px] pointer-events-none" data-testid="blurred-insight-content">
        {children}
      </div>

      {showTooltip && (
        <div
          className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-10 bg-[#18181B] text-white text-[13px] font-medium px-3.5 py-2 rounded-lg shadow-lg whitespace-nowrap"
          data-testid="tooltip-see-info"
        >
          See what you're missing
        </div>
      )}
    </Tag>
  );
}
