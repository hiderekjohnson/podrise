import { useState } from "react";

type BookCoverSize = "sm" | "md" | "lg" | "xl";

interface BookCoverProps {
  title: string;
  slug?: string | null;
  googleBooksId?: string | null;
  isbn?: string | null;
  hasCover?: boolean | null;
  size?: BookCoverSize;
  className?: string;
  testId?: string;
}

const SIZE_CLASSES: Record<BookCoverSize, string> = {
  sm: "w-12 h-[72px]",
  md: "w-[88px] h-[132px]",
  lg: "w-28 h-[168px]",
  xl: "w-36 h-[216px] sm:w-44 sm:h-[264px]",
};

const TITLE_SIZE: Record<BookCoverSize, string> = {
  sm: "text-[7px] leading-[1.2] px-1",
  md: "text-[10px] leading-[1.25] px-2",
  lg: "text-[12px] leading-[1.3] px-3",
  xl: "text-[14px] leading-[1.3] px-4",
};

const LINE_SIZE: Record<BookCoverSize, string> = {
  sm: "w-3 mb-1",
  md: "w-5 mb-1.5",
  lg: "w-6 mb-2",
  xl: "w-8 mb-2.5",
};

function DefaultCover({ title, size, className, testId }: { title: string; size: BookCoverSize; className?: string; testId?: string }) {
  const sizeClass = SIZE_CLASSES[size];
  const safeTitle = typeof title === "string" && title.trim() ? title : "Untitled";
  const maxLen = size === "sm" ? 20 : size === "md" ? 40 : 60;
  const displayTitle = safeTitle.length > maxLen ? safeTitle.substring(0, maxLen - 1) + "…" : safeTitle;

  const baseCls = className
    ? className.replace(/object-cover|object-contain/g, "").trim()
    : `${sizeClass} rounded-lg shrink-0`;

  return (
    <div className={`${baseCls} bg-gradient-to-br from-[#1a1a2e] via-[#16213e] to-[#0f3460] flex flex-col items-center justify-center text-center relative overflow-hidden`} data-testid={testId}>
      <div className="absolute left-0 top-0 bottom-0 w-[6px] bg-white/[0.04] border-r border-white/[0.06]" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(99,102,241,0.08),transparent_70%)]" />
      <div className={`${LINE_SIZE[size]} h-px bg-[#e2c27d]/30 mx-auto`} />
      <p className={`${TITLE_SIZE[size]} font-serif font-bold text-[#e2c27d] relative z-10 break-words`}>
        {displayTitle}
      </p>
      <div className={`${LINE_SIZE[size]} h-px bg-[#e2c27d]/30 mx-auto mt-1`} />
    </div>
  );
}

export function BookCover({ title, slug, size = "md", className, testId }: BookCoverProps) {
  const [failed, setFailed] = useState(false);

  const sizeClass = SIZE_CLASSES[size];
  const imgCls = className || `${sizeClass} rounded-lg object-cover shrink-0 shadow-md border border-black/[0.06] dark:border-white/[0.08]`;

  if (!slug || failed) {
    return <DefaultCover title={title} size={size} className={className} testId={testId} />;
  }

  return (
    <img
      src={`/books/${slug}.jpg`}
      alt={title}
      className={imgCls}
      onError={() => setFailed(true)}
      loading="lazy"
      data-testid={testId}
    />
  );
}

export function BookCoverFill({ title, slug }: {
  title: string; slug?: string | null; googleBooksId?: string | null; isbn?: string | null; hasCover?: boolean | null;
}) {
  const [failed, setFailed] = useState(false);

  if (!slug || failed) {
    return (
      <div className="w-full h-full bg-gradient-to-br from-[#1a1a2e] via-[#16213e] to-[#0f3460] flex items-center justify-center p-2">
        <p className="text-[9px] font-serif font-bold text-[#e2c27d] text-center leading-tight line-clamp-3">
          {title}
        </p>
      </div>
    );
  }

  return (
    <img
      src={`/books/${slug}.jpg`}
      alt={title}
      className="w-full h-full object-cover"
      onError={() => setFailed(true)}
      loading="lazy"
    />
  );
}
