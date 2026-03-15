import { Link } from "wouter";
import { PodCapWordmark } from "./PodCapHeader";
import { INDUSTRIES, INTERESTS, ROLES } from "@/data/topicData";

export function Footer() {
  const topIndustries = INDUSTRIES.slice(0, 5);
  const topInterests = INTERESTS.slice(0, 5);
  const topRoles = ROLES.slice(0, 5);

  const linkClass = "text-[14px] text-[#52525B] dark:text-[#A1A1AA] hover:text-foreground transition-colors";
  const headingClass = "text-[14px] font-bold text-foreground/80 mb-4 tracking-[0.1em] uppercase";

  return (
    <footer className="w-full border-t border-black/[0.06] dark:border-white/[0.06] bg-white/60 dark:bg-black/40 backdrop-blur-sm mt-auto" data-testid="footer">
      <div className="max-w-6xl mx-auto px-6 pt-14 pb-10">
        <div className="grid grid-cols-2 gap-x-8 gap-y-10 sm:grid-cols-3 lg:grid-cols-6 mb-12">
          <div>
            <h3 className={headingClass}>Discover</h3>
            <ul className="space-y-3">
              <li>
                <Link href="/podcasts" className={linkClass} data-testid="link-podcasts">
                  Podcasts
                </Link>
              </li>
              <li>
                <Link href="/people" className={linkClass} data-testid="link-people">
                  People
                </Link>
              </li>
              <li>
                <Link href="/companies" className={linkClass} data-testid="link-companies">
                  Companies
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
            <Link href="/industries" className={`${headingClass} block hover:text-foreground transition-colors`} data-testid="link-industries">Industries</Link>
            <ul className="space-y-3">
              {topIndustries.map((topic) => (
                <li key={topic.slug}>
                  <Link href={`/industries/${topic.slug}`} className={linkClass} data-testid={`link-industry-${topic.slug}`}>
                    {topic.name}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <Link href="/interests" className={`${headingClass} block hover:text-foreground transition-colors`} data-testid="link-interests">Topics</Link>
            <ul className="space-y-3">
              {topInterests.map((topic) => (
                <li key={topic.slug}>
                  <Link href={`/interests/${topic.slug}`} className={linkClass} data-testid={`link-interest-${topic.slug}`}>
                    {topic.name}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <Link href="/roles" className={`${headingClass} block hover:text-foreground transition-colors`} data-testid="link-roles">Roles</Link>
            <ul className="space-y-3">
              {topRoles.map((topic) => (
                <li key={topic.slug}>
                  <Link href={`/roles/${topic.slug}`} className={linkClass} data-testid={`link-role-${topic.slug}`}>
                    {topic.name}
                  </Link>
                </li>
              ))}
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
                <Link href="/enterprise" className={linkClass} data-testid="link-enterprise">
                  Enterprise
                </Link>
              </li>
              <li>
                <Link href="/advertise" className={linkClass} data-testid="link-advertise">
                  Advertise
                </Link>
              </li>
              <li>
                <Link href="/disclosure" className={linkClass} data-testid="link-disclosure">
                  How We Make Money
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
                <Link href="/support" className={linkClass} data-testid="link-support">
                  Help & Support
                </Link>
              </li>
              <li>
                <Link href="/contact" className={linkClass} data-testid="link-contact">
                  Contact Us
                </Link>
              </li>
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
            </ul>
          </div>
        </div>

        <div className="flex flex-col items-center">
          <div className="w-full h-px bg-black/[0.06] dark:bg-white/[0.06] mb-6" />

          <PodCapWordmark />
          <p className="text-[14px] text-[#52525B] dark:text-[#A1A1AA] mt-3">
            &copy; {new Date().getFullYear()} PodCap, Inc. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  );
}
