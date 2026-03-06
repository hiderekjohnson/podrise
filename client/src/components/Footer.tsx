import { Link } from "wouter";
import { SiX } from "react-icons/si";
import logoPath from "@assets/Podcap_logo_1772731738179.png";

export function Footer() {
  return (
    <footer className="w-full border-t border-black/[0.06] dark:border-white/[0.06] bg-white/60 dark:bg-black/40 backdrop-blur-sm mt-auto" data-testid="footer">
      <div className="max-w-6xl mx-auto px-6 py-10">
        <div className="flex flex-col items-center gap-8">
          <div className="flex items-center gap-5" data-testid="footer-social">
            <a
              href="https://x.com/podcap_io"
              target="_blank"
              rel="noopener noreferrer"
              className="text-muted-foreground hover:text-foreground transition-colors"
              data-testid="link-social-x"
              aria-label="Follow PodCap on X"
            >
              <SiX className="w-5 h-5" />
            </a>
          </div>

          <div className="flex flex-col items-center gap-3">
            <img src={logoPath} alt="PodCap" className="h-7 object-contain" />
            <p className="text-xs text-muted-foreground/60">
              &copy; {new Date().getFullYear()} PodCap, Inc. All rights reserved.
            </p>
          </div>

          <div className="flex items-center justify-center gap-4 md:gap-6 flex-wrap">
            <Link
              href="/podcasts"
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
              data-testid="link-podcasts"
            >
              Podcasts
            </Link>
            <span className="text-muted-foreground/30">|</span>
            <Link
              href="/podcast-deals"
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
              data-testid="link-podcast-deals"
            >
              Deals
            </Link>
            <span className="text-muted-foreground/30">|</span>
            <Link
              href="/about"
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
              data-testid="link-about"
            >
              About
            </Link>
            <span className="text-muted-foreground/30">|</span>
            <Link
              href="/contact"
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
              data-testid="link-contact"
            >
              Contact
            </Link>
            <span className="text-muted-foreground/30">|</span>
            <Link
              href="/support"
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
              data-testid="link-support"
            >
              Help & Support
            </Link>
            <span className="text-muted-foreground/30">|</span>
            <Link
              href="/updates"
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
              data-testid="link-updates"
            >
              What's New
            </Link>
            <span className="text-muted-foreground/30">|</span>
            <Link
              href="/privacy"
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
              data-testid="link-privacy"
            >
              Privacy Policy
            </Link>
            <span className="text-muted-foreground/30">|</span>
            <Link
              href="/terms"
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
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
