import { useState, useEffect, useCallback, useRef } from "react";
import { X, ChevronRight } from "lucide-react";

interface TourStep {
  targetSelector: string;
  title: string;
  description: string;
  position?: "top" | "bottom" | "left" | "right";
}

const TOUR_STEPS: TourStep[] = [
  {
    targetSelector: '[data-tour="following-tab"]',
    title: "Your Following Feed",
    description: "This tab shows new episodes from podcasts you follow, in chronological order. You'll never miss an episode from your favorites.",
    position: "bottom",
  },
  {
    targetSelector: '[data-tour="foryou-tab"]',
    title: "Personalized For You",
    description: "This tab surfaces episodes we think you'll love based on your interests — including podcasts you don't follow yet. Great for discovering new content.",
    position: "bottom",
  },
];

const TOUR_STORAGE_KEY = "podcap_tour_completed";

interface TooltipPosition {
  top: number;
  left: number;
  arrowPosition: "top" | "bottom" | "left" | "right";
}

function getTooltipPosition(rect: DOMRect, position: string, tooltipWidth: number, tooltipHeight: number): TooltipPosition {
  const gap = 12;
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;

  let top = 0;
  let left = 0;
  let arrowPosition: "top" | "bottom" | "left" | "right" = "top";

  switch (position) {
    case "bottom":
      top = rect.bottom + gap;
      left = rect.left + rect.width / 2 - tooltipWidth / 2;
      arrowPosition = "top";
      break;
    case "top":
      top = rect.top - tooltipHeight - gap;
      left = rect.left + rect.width / 2 - tooltipWidth / 2;
      arrowPosition = "bottom";
      break;
    case "right":
      top = rect.top + rect.height / 2 - tooltipHeight / 2;
      left = rect.right + gap;
      arrowPosition = "left";
      break;
    case "left":
      top = rect.top + rect.height / 2 - tooltipHeight / 2;
      left = rect.left - tooltipWidth - gap;
      arrowPosition = "right";
      break;
    default:
      top = rect.bottom + gap;
      left = rect.left + rect.width / 2 - tooltipWidth / 2;
      arrowPosition = "top";
  }

  if (left < 8) left = 8;
  if (left + tooltipWidth > viewportWidth - 8) left = viewportWidth - tooltipWidth - 8;
  if (top < 8) {
    top = rect.bottom + gap;
    arrowPosition = "top";
  }
  if (top + tooltipHeight > viewportHeight - 8) {
    top = rect.top - tooltipHeight - gap;
    arrowPosition = "bottom";
  }

  return { top, left, arrowPosition };
}

export function FeatureTour({ enabled }: { enabled: boolean }) {
  const [currentStep, setCurrentStep] = useState(0);
  const [visible, setVisible] = useState(false);
  const [tooltipPos, setTooltipPos] = useState<TooltipPosition | null>(null);
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const TOOLTIP_WIDTH = 320;
  const TOOLTIP_HEIGHT_EST = 160;

  useEffect(() => {
    if (!enabled) return;
    const completed = localStorage.getItem(TOUR_STORAGE_KEY);
    if (completed === "true") return;

    let attempt = 0;
    const maxAttempts = 10;
    const checkTarget = () => {
      attempt++;
      const firstTarget = document.querySelector(TOUR_STEPS[0].targetSelector);
      if (firstTarget) {
        setVisible(true);
      } else if (attempt < maxAttempts) {
        timerId = setTimeout(checkTarget, 400);
      }
    };
    let timerId = setTimeout(checkTarget, 800);
    return () => clearTimeout(timerId);
  }, [enabled]);

  const updatePosition = useCallback(() => {
    if (!visible || currentStep >= TOUR_STEPS.length) return;

    const step = TOUR_STEPS[currentStep];
    const el = document.querySelector(step.targetSelector);
    if (!el) {
      setTargetRect(null);
      setTooltipPos(null);
      return;
    }

    const rect = el.getBoundingClientRect();
    setTargetRect(rect);

    const tooltipHeight = tooltipRef.current?.offsetHeight || TOOLTIP_HEIGHT_EST;
    const pos = getTooltipPosition(rect, step.position || "bottom", TOOLTIP_WIDTH, tooltipHeight);
    setTooltipPos(pos);
  }, [visible, currentStep]);

  useEffect(() => {
    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [updatePosition]);

  const handleNext = useCallback(() => {
    if (currentStep < TOUR_STEPS.length - 1) {
      setCurrentStep(prev => prev + 1);
    } else {
      handleClose();
    }
  }, [currentStep]);

  const handleClose = useCallback(() => {
    setVisible(false);
    localStorage.setItem(TOUR_STORAGE_KEY, "true");
  }, []);

  if (!visible || currentStep >= TOUR_STEPS.length) return null;

  const step = TOUR_STEPS[currentStep];
  const isLastStep = currentStep === TOUR_STEPS.length - 1;

  return (
    <>
      <div
        className="fixed inset-0 z-[9998]"
        style={{ background: "rgba(0,0,0,0.4)" }}
        onClick={handleClose}
        data-testid="tour-overlay"
      />

      {targetRect && (
        <div
          className="fixed z-[9999] rounded-lg"
          style={{
            top: targetRect.top - 4,
            left: targetRect.left - 4,
            width: targetRect.width + 8,
            height: targetRect.height + 8,
            boxShadow: "0 0 0 9999px rgba(0,0,0,0.4)",
            background: "transparent",
            pointerEvents: "none",
          }}
          data-testid="tour-highlight"
        />
      )}

      {tooltipPos && (
        <div
          ref={tooltipRef}
          className="fixed z-[10000] bg-white dark:bg-zinc-900 rounded-xl shadow-2xl shadow-black/20 border border-black/[0.08] dark:border-white/[0.1] p-5"
          style={{
            top: tooltipPos.top,
            left: tooltipPos.left,
            width: TOOLTIP_WIDTH,
            maxWidth: "calc(100vw - 16px)",
          }}
          data-testid="tour-tooltip"
        >
          <div
            className="absolute w-3 h-3 bg-white dark:bg-zinc-900 border-black/[0.08] dark:border-white/[0.1] rotate-45"
            style={{
              ...(tooltipPos.arrowPosition === "top" && { top: -6, left: "50%", marginLeft: -6, borderTop: "1px solid", borderLeft: "1px solid" }),
              ...(tooltipPos.arrowPosition === "bottom" && { bottom: -6, left: "50%", marginLeft: -6, borderBottom: "1px solid", borderRight: "1px solid" }),
              ...(tooltipPos.arrowPosition === "left" && { left: -6, top: "50%", marginTop: -6, borderBottom: "1px solid", borderLeft: "1px solid" }),
              ...(tooltipPos.arrowPosition === "right" && { right: -6, top: "50%", marginTop: -6, borderTop: "1px solid", borderRight: "1px solid" }),
            }}
          />

          <div className="flex items-start justify-between gap-2 mb-2">
            <h3 className="text-[15px] font-bold text-foreground" data-testid="tour-step-title">
              {step.title}
            </h3>
            <button
              onClick={handleClose}
              className="p-1 rounded-md text-[#A1A1AA] hover:text-foreground hover:bg-black/[0.04] transition-colors flex-shrink-0"
              data-testid="tour-close"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <p className="text-[14px] text-[#52525B] dark:text-[#A1A1AA] leading-relaxed mb-4" data-testid="tour-step-description">
            {step.description}
          </p>

          <div className="flex items-center justify-between">
            <span className="text-[12px] text-[#A1A1AA] font-medium">
              {currentStep + 1} of {TOUR_STEPS.length}
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={handleClose}
                className="px-3 py-1.5 text-[13px] font-semibold text-[#A1A1AA] hover:text-[#52525B] transition-colors rounded-lg"
                data-testid="tour-skip"
              >
                Skip
              </button>
              <button
                onClick={handleNext}
                className="px-4 py-1.5 text-[13px] font-bold bg-[#6366F1] text-white rounded-lg hover:bg-[#4F46E5] transition-colors flex items-center gap-1"
                data-testid="tour-next"
              >
                {isLastStep ? "Got it" : "Next"}
                {!isLastStep && <ChevronRight className="w-3.5 h-3.5" />}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
