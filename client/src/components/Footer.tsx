import { Link } from "wouter";
import { SiX } from "react-icons/si";
import logoPath from "@assets/Podcap_logo_1772731738179.png";

export function Footer() {
  return (
    <footer className="w-full border-t border-black/[0.06] dark:border-white/[0.06] bg-white/60 dark:bg-black/40 backdrop-blur-sm mt-auto" data-testid="footer">
      <div className="max-w-6xl mx-auto px-6 pt-12 pb-10">
        <div className="flex flex-col items-center">
          <img src={logoPath} alt="PodCap" className="h-7 object-contain mb-2" />
          <p className="text-xs text-muted-foreground/50 mb-8">
            &copy; {new Date().getFullYear()} PodCap, Inc. All rights reserved.
          </p>

          <div className="w-full flex items-center gap-6 mb-6">
            <div className="flex-1 h-px bg-black/[0.06] dark:bg-white/[0.06]" />
            <a
              href="https://x.com/podcap_io"
              target="_blank"
              rel="noopener noreferrer"
              className="text-muted-foreground/60 hover:text-foreground transition-colors"
              data-testid="link-social-x"
              aria-label="Follow PodCap on X"
            >
              <SiX className="w-[18px] h-[18px]" />
            </a>
            <div className="flex-1 h-px bg-black/[0.06] dark:bg-white/[0.06]" />
          </div>

          <div className="flex items-center justify-center gap-3 md:gap-5 flex-wrap">
            <Link
              href="/podcasts"
              className="text-[13px] text-muted-foreground/70 hover:text-foreground transition-colors"
              data-testid="link-podcasts"
            >
              Podcasts
            </Link>
            <span className="text-muted-foreground/20">|</span>
            <Link
              href="/about"
              className="text-[13px] text-muted-foreground/70 hover:text-foreground transition-colors"
              data-testid="link-about"
            >
              About Us
            </Link>
            <span className="text-muted-foreground/20">|</span>
            <Link
              href="/contact"
              className="text-[13px] text-muted-foreground/70 hover:text-foreground transition-colors"
              data-testid="link-contact"
            >
              Contact
            </Link>
            <span className="text-muted-foreground/20">|</span>
            <Link
              href="/support"
              className="text-[13px] text-muted-foreground/70 hover:text-foreground transition-colors"
              data-testid="link-support"
            >
              Help & Support
            </Link>
            <span className="text-muted-foreground/20">|</span>
            <Link
              href="/updates"
              className="text-[13px] text-muted-foreground/70 hover:text-foreground transition-colors"
              data-testid="link-updates"
            >
              What's New
            </Link>
            <span className="text-muted-foreground/20">|</span>
            <Link
              href="/privacy"
              className="text-[13px] text-muted-foreground/70 hover:text-foreground transition-colors"
              data-testid="link-privacy"
            >
              Privacy Policy
            </Link>
            <span className="text-muted-foreground/20">|</span>
            <Link
              href="/terms"
              className="text-[13px] text-muted-foreground/70 hover:text-foreground transition-colors"
              data-testid="link-terms"
            >
              Terms & Conditions
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
