import { useState } from "react";
import { BookOpen } from "lucide-react";

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

const ICON_SIZE: Record<BookCoverSize, string> = {
  sm: "w-4 h-4",
  md: "w-6 h-6",
  lg: "w-8 h-8",
  xl: "w-10 h-10",
};

const TEXT_SIZE: Record<BookCoverSize, string> = {
  sm: "text-[6px]",
  md: "text-[9px]",
  lg: "text-[10px]",
  xl: "text-[11px]",
};

function DefaultCover({ size, className, testId }: { size: BookCoverSize; className?: string; testId?: string }) {
  const sizeClass = SIZE_CLASSES[size];

  const baseCls = className
    ? className.replace(/object-cover|object-contain/g, "").trim()
    : `${sizeClass} rounded-lg shrink-0`;

  return (
    <div className={`${baseCls} bg-[#F0F0F2] dark:bg-[#1a1a2e] border border-[#E4E4E7] dark:border-white/[0.08] flex flex-col items-center justify-center text-center gap-1.5`} data-testid={testId}>
      <BookOpen className={`${ICON_SIZE[size]} text-[#A1A1AA] dark:text-[#52525B]`} />
      <p className={`${TEXT_SIZE[size]} font-medium text-[#A1A1AA] dark:text-[#52525B] uppercase tracking-wider`}>
        No preview
      </p>
    </div>
  );
}

export function BookCover({ title, slug, size = "md", className, testId }: BookCoverProps) {
  const [failed, setFailed] = useState(false);

  const sizeClass = SIZE_CLASSES[size];
  const imgCls = className || `${sizeClass} rounded-lg object-cover shrink-0 shadow-md border border-black/[0.06] dark:border-white/[0.08]`;

  if (!slug || failed) {
    return <DefaultCover size={size} className={className} testId={testId} />;
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
      <div className="w-full h-full bg-[#F0F0F2] dark:bg-[#1a1a2e] flex items-center justify-center">
        <BookOpen className="w-5 h-5 text-[#A1A1AA] dark:text-[#52525B]" />
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
