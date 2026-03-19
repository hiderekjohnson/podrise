import { Link } from "wouter";
import { PodRiseWordmark } from "./PodRiseHeader";

export function Footer() {
  const linkClass = "text-[14px] text-[#52525B] dark:text-[#A1A1AA] hover:text-foreground transition-colors";
  const headingClass = "text-[14px] font-bold text-foreground/80 mb-4 tracking-[0.1em] uppercase";

  return (
    <footer className="w-full border-t border-black/[0.06] dark:border-white/[0.06] bg-white/60 dark:bg-black/40 backdrop-blur-sm mt-auto" data-testid="footer">
      <div className="max-w-6xl mx-auto px-6 pt-14 pb-10">
        <div className="grid grid-cols-2 gap-x-8 gap-y-10 sm:grid-cols-3 lg:grid-cols-4 mb-12">
          <div>
            <h3 className={headingClass}>Discover</h3>
            <ul className="space-y-3">
              <li>
                <Link href="/podcasts" className={linkClass} data-testid="link-podcasts">
                  Podcasts
                </Link>
              </li>
              <li>
                <Link href="/shop" className={`inline-flex items-center gap-1.5 ${linkClass}`} data-testid="link-shop">
                  Shop
                  <span className="text-[12px] font-bold uppercase tracking-wider bg-amber-500/[0.12] text-amber-700 dark:text-amber-400 px-1.5 py-0.5 rounded-full leading-none">Beta</span>
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <h3 className={headingClass}>Company</h3>
            <ul className="space-y-3">
              <li>
                <Link href="/about" className={linkClass} data-testid="link-about">
                  About Us
                </Link>
              </li>
              <li>
                <Link href="/updates" className={linkClass} data-testid="link-updates">
                  What's New
                </Link>
              </li>
              <li>
                <Link href="/we-heart-podcasters" className={linkClass} data-testid="link-we-heart-podcasters">
                  For Podcasters
                </Link>
              </li>
              <li>
                <Link href="/advertise" className={linkClass} data-testid="link-advertise">
                  Advertise
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <h3 className={headingClass}>Support</h3>
            <ul className="space-y-3">
              <li>
                <Link href="/register" className={linkClass} data-testid="link-get-started">
                  Create Account
                </Link>
              </li>
              <li>
                <Link href="/login" className={linkClass} data-testid="link-login">
                  Log In
                </Link>
              </li>
              <li>
                <Link href="/contact" className={linkClass} data-testid="link-contact">
                  Contact Us
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <h3 className={headingClass}>Legal</h3>
            <ul className="space-y-3">
              <li>
                <Link href="/privacy" className={linkClass} data-testid="link-privacy">
                  Privacy Policy
                </Link>
              </li>
              <li>
                <Link href="/terms" className={linkClass} data-testid="link-terms">
                  Terms
                </Link>
              </li>
              <li>
                <Link href="/cookies" className={linkClass} data-testid="link-cookies">
                  Cookie Policy
                </Link>
              </li>
            </ul>
          </div>
        </div>

        <div className="flex flex-col items-center">
          <div className="w-full h-px bg-black/[0.06] dark:bg-white/[0.06] mb-6" />

          <PodRiseWordmark height={60} />
          <p className="text-[14px] text-[#52525B] dark:text-[#A1A1AA] mt-3">
            &copy; {new Date().getFullYear()} PodRise, Inc. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  );
}
