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

const PLACEHOLDER_ICON_SIZE: Record<BookCoverSize, string> = {
  sm: "w-4 h-4",
  md: "w-5 h-5",
  lg: "w-6 h-6",
  xl: "w-8 h-8",
};

function Placeholder({ size, className }: { size: BookCoverSize; className?: string }) {
  const sizeClass = SIZE_CLASSES[size];
  const cls = className
    ? className.replace(/object-cover|object-contain|shadow-\S+/g, "").trim() +
      " bg-amber-500/[0.06] flex items-center justify-center border border-amber-500/10"
    : `${sizeClass} rounded-lg bg-amber-500/[0.06] flex items-center justify-center shrink-0 border border-amber-500/10`;
  return (
    <div className={cls}>
      <BookOpen className={`${PLACEHOLDER_ICON_SIZE[size]} text-amber-500/40`} />
    </div>
  );
}

export function BookCover({ title, slug, size = "md", className, testId }: BookCoverProps) {
  const [failed, setFailed] = useState(false);

  const sizeClass = SIZE_CLASSES[size];
  const imgCls = className || `${sizeClass} rounded-lg object-cover shrink-0 shadow-md border border-black/[0.06] dark:border-white/[0.08]`;

  if (!slug || failed) {
    return <Placeholder size={size} className={className} />;
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
    return <BookOpen className="w-5 h-5 text-amber-400/50" />;
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
