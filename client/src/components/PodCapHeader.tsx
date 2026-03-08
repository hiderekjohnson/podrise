import { Link } from "wouter";
import logoPath from "@assets/Podcap_logo_1772731738179.png";

interface PodCapHeaderProps {
  rightContent?: React.ReactNode;
}

export function PodCapHeader({ rightContent }: PodCapHeaderProps) {
  return (
    <header className="sticky top-0 z-50 bg-background/80 backdrop-blur-md border-b border-black/[0.04]">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
        <Link href="/">
          <img src={logoPath} alt="PodCap" className="h-7" data-testid="link-home-logo" />
        </Link>
        {rightContent}
      </div>
    </header>
  );
}
