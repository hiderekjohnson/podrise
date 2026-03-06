import { Link } from "wouter";
import logoPath from "@assets/Podcap_logo_1772731738179.png";

export function Footer() {
  return (
    <footer className="w-full border-t border-black/[0.06] bg-white/60 backdrop-blur-sm mt-auto" data-testid="footer">
      <div className="max-w-6xl mx-auto px-6 py-10">
        <div className="flex flex-col md:flex-row items-center md:items-start justify-between gap-8">
          <div className="flex flex-col items-center md:items-start gap-3">
            <img src={logoPath} alt="PodCap" className="h-7 object-contain" />
            <p className="text-sm text-muted-foreground">
              Your favorite podcasts, summarized daily.
            </p>
          </div>

          <div className="flex flex-col items-center md:items-end gap-3">
            <div className="flex items-center gap-6">
              <Link
                href="/podcasts"
                className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                data-testid="link-podcasts"
              >
                Podcasts
              </Link>
              <Link
                href="/podcast-deals"
                className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                data-testid="link-podcast-deals"
              >
                Deals
              </Link>
              <Link
                href="/privacy"
                className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                data-testid="link-privacy"
              >
                Privacy Policy
              </Link>
              <Link
                href="/terms"
                className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                data-testid="link-terms"
              >
                Terms & Conditions
              </Link>
              <Link
                href="/about"
                className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                data-testid="link-about"
              >
                About
              </Link>
              <Link
                href="/contact"
                className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                data-testid="link-contact"
              >
                Contact
              </Link>
              <Link
                href="/support"
                className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                data-testid="link-support"
              >
                Help & Support
              </Link>
              <Link
                href="/updates"
                className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                data-testid="link-updates"
              >
                What's New
              </Link>
            </div>
            <p className="text-xs text-muted-foreground/60">
              &copy; {new Date().getFullYear()} PodCap. All rights reserved.
            </p>
          </div>
        </div>
      </div>
    </footer>
  );
}
