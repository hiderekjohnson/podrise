import { Link } from "wouter";
import { SiX } from "react-icons/si";
import { PodCapWordmark } from "./PodCapHeader";

export function Footer() {
  return (
    <footer className="w-full border-t border-black/[0.06] dark:border-white/[0.06] bg-white/60 dark:bg-black/40 backdrop-blur-sm mt-auto" data-testid="footer">
      <div className="max-w-6xl mx-auto px-6 pt-14 pb-10">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-8 sm:gap-10 mb-12">
          <div>
            <h3 className="text-sm font-semibold text-foreground mb-5 tracking-wide uppercase">Discover</h3>
            <ul className="space-y-3">
              <li>
                <Link href="/podcasts" className="text-sm text-muted-foreground/70 hover:text-foreground transition-colors" data-testid="link-podcasts">
                  Top Podcasts
                </Link>
              </li>
              <li>
                <Link href="/people" className="text-sm text-muted-foreground/70 hover:text-foreground transition-colors" data-testid="link-people">
                  People
                </Link>
              </li>
              <li>
                <Link href="/companies" className="text-sm text-muted-foreground/70 hover:text-foreground transition-colors" data-testid="link-companies">
                  Companies
                </Link>
              </li>
              <li>
                <Link href="/topics" className="text-sm text-muted-foreground/70 hover:text-foreground transition-colors" data-testid="link-topics">
                  Topics
                </Link>
              </li>
              <li>
                <Link href="/get-started" className="text-sm text-muted-foreground/70 hover:text-foreground transition-colors" data-testid="link-get-started">
                  Build Your Recap
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <h3 className="text-sm font-semibold text-foreground mb-5 tracking-wide uppercase">Company</h3>
            <ul className="space-y-3">
              <li>
                <Link href="/about" className="text-sm text-muted-foreground/70 hover:text-foreground transition-colors" data-testid="link-about">
                  About Us
                </Link>
              </li>
              <li>
                <Link href="/updates" className="text-sm text-muted-foreground/70 hover:text-foreground transition-colors" data-testid="link-updates">
                  What's New
                </Link>
              </li>
              <li>
                <Link href="/we-heart-podcasters" className="text-sm text-muted-foreground/70 hover:text-foreground transition-colors" data-testid="link-we-heart-podcasters">
                  For Podcasters
                </Link>
              </li>
              <li>
                <Link href="/enterprise" className="text-sm text-muted-foreground/70 hover:text-foreground transition-colors" data-testid="link-enterprise">
                  Enterprise
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <h3 className="text-sm font-semibold text-foreground mb-5 tracking-wide uppercase">Support</h3>
            <ul className="space-y-3">
              <li>
                <Link href="/support" className="text-sm text-muted-foreground/70 hover:text-foreground transition-colors" data-testid="link-support">
                  Help & Support
                </Link>
              </li>
              <li>
                <Link href="/contact" className="text-sm text-muted-foreground/70 hover:text-foreground transition-colors" data-testid="link-contact">
                  Contact Us
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <h3 className="text-sm font-semibold text-foreground mb-5 tracking-wide uppercase">Legal</h3>
            <ul className="space-y-3">
              <li>
                <Link href="/privacy" className="text-sm text-muted-foreground/70 hover:text-foreground transition-colors" data-testid="link-privacy">
                  Privacy Policy
                </Link>
              </li>
              <li>
                <Link href="/terms" className="text-sm text-muted-foreground/70 hover:text-foreground transition-colors" data-testid="link-terms">
                  Terms & Conditions
                </Link>
              </li>
            </ul>
          </div>
        </div>

        <div className="flex flex-col items-center">
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

          <PodCapWordmark />
          <p className="text-xs text-muted-foreground/50 mt-2">
            &copy; {new Date().getFullYear()} PodCap, Inc. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  );
}
