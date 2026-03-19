// See BRAND.md for all typography, color, spacing, and accessibility rules.
import { useEffect } from "react";
import { Link } from "wouter";
import { motion } from "framer-motion";
import { Footer } from "@/components/Footer";
import { SiteHeader } from "@/components/SiteHeader";
import { DollarSign, BookOpen, ShoppingBag, Megaphone, CreditCard, Scale, MessageCircle } from "lucide-react";

export default function Disclosure() {
  useEffect(() => {
    const title = "How PodRise Makes Money — Affiliate Disclosure & Advertising Transparency | PodRise";
    const desc = "PodRise earns revenue through affiliate links, paid advertising, and subscriptions. Nothing in the Shop can be paid for. Here is exactly how it works.";
    document.title = title;
    const setMeta = (attr: string, key: string, content: string) => {
      let el = document.querySelector(`meta[${attr}="${key}"]`) as HTMLMetaElement | null;
      if (!el) { el = document.createElement("meta"); el.setAttribute(attr, key); document.head.appendChild(el); }
      el.content = content;
    };
    setMeta("name", "description", desc);
    setMeta("property", "og:title", title);
    setMeta("property", "og:description", desc);
    setMeta("property", "og:type", "website");
    setMeta("property", "og:url", "https://podrise.com/disclosure");
    setMeta("property", "og:image", "https://podrise.com/og/og-podcasts.png");
    setMeta("name", "twitter:card", "summary_large_image");
    setMeta("name", "twitter:title", title);
    setMeta("name", "twitter:description", desc);
    setMeta("name", "twitter:image", "https://podrise.com/og/og-podcasts.png");

    let link = document.querySelector('link[rel="canonical"]') as HTMLLinkElement | null;
    if (!link) { link = document.createElement("link"); link.rel = "canonical"; document.head.appendChild(link); }
    link.href = "https://podrise.com/disclosure";

    return () => { if (link) link.remove(); };
  }, []);

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <SiteHeader />

      <main className="flex-1 w-full">
        {/* Section 1: Opening */}
        <motion.section
          className="max-w-3xl mx-auto px-4 sm:px-6 pt-16 sm:pt-24 pb-12 text-center"
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: "easeOut" }}
          data-testid="section-opening"
        >
          <div className="inline-flex items-center gap-2.5 px-6 py-2.5 rounded-full bg-primary/[0.07] text-primary text-base sm:text-lg font-display font-bold uppercase tracking-widest mb-6">
            <DollarSign className="w-5 h-5" />
            Disclosure
          </div>
          <h1 className="text-[1.75rem] sm:text-[2rem] md:text-[2.35rem] font-display font-extrabold tracking-[-0.03em] leading-[1.15] mb-5 max-w-2xl mx-auto" data-testid="text-hero-title">
            How PodRise Makes Money
          </h1>
          <p className="text-lg sm:text-xl text-muted-foreground max-w-xl mx-auto leading-relaxed" data-testid="text-opening-paragraph">
            Most disclosure pages are buried legalese nobody reads. We would rather just tell you how the business works. It takes two minutes and you will know exactly where our revenue comes from — and where it does not come from.
          </p>
        </motion.section>

        {/* Section 2: The Shop — Nothing Here Can Be Bought */}
        <motion.section
          className="max-w-3xl mx-auto px-4 sm:px-6 pb-16"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.12 }}
          data-testid="section-shop"
        >
          <div className="flex items-center gap-3 mb-8">
            <BookOpen className="w-5 h-5 text-primary" />
            <h2 className="text-xl sm:text-2xl font-display font-bold" data-testid="text-shop-heading">The Shop — Nothing Here Can Be Bought</h2>
          </div>

          <div className="space-y-5 text-[17px] leading-[1.85] text-[#52525B] max-w-2xl">
            <p>
              Every book in the <Link href="/shop" className="text-primary font-medium hover:underline" data-testid="link-shop-inline">Shop</Link> and every product was mentioned or recommended by a real host or guest on a real podcast episode. That is the only way anything gets in.
            </p>
          </div>

          <div className="mt-6 bg-[#F7F7FC] border-l-[3px] border-l-[#6366F1] rounded-r-lg p-5 sm:p-6" data-testid="callout-shop-integrity">
            <p className="text-[17px] leading-[1.85] text-foreground font-semibold mb-3">
              No brand, publisher, author, or PR firm can pay to appear in the Shop. There is no price. We do not offer it. We would never accept it.
            </p>
            <p className="text-[16px] leading-[1.85] text-[#52525B]">
              Rankings are determined by mention frequency across episodes and shows — not by commercial relationships. When a book appears at the top of the <Link href="/shop" className="text-primary font-medium hover:underline" data-testid="link-shop-callout">Shop</Link>, it is because dozens of <Link href="/podcasts" className="text-primary font-medium hover:underline" data-testid="link-podcasts-callout">podcast</Link> guests recommended it. The recommendation belongs to your favorite podcasters, not to us.
            </p>
          </div>
        </motion.section>

        {/* Section 3: How Affiliate Revenue Works */}
        <motion.section
          className="max-w-3xl mx-auto px-4 sm:px-6 pb-16"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.2 }}
          data-testid="section-affiliate-revenue"
        >
          <div className="flex items-center gap-3 mb-8">
            <ShoppingBag className="w-5 h-5 text-primary" />
            <h2 className="text-xl sm:text-2xl font-display font-bold" data-testid="text-affiliate-heading">How Affiliate Revenue Works</h2>
          </div>

          <div className="space-y-5 text-[17px] leading-[1.85] text-[#52525B] max-w-2xl">
            <p>
              When you click a link in the <Link href="/shop" className="text-primary font-medium hover:underline" data-testid="link-shop-affiliate">Shop</Link> and make a purchase, PodRise may earn a small commission through Amazon Associates or other affiliate programs.
            </p>
            <p>
              The price you pay is identical to what you would pay going directly. We never mark anything up.
            </p>
            <p>
              Affiliate commission rates have zero influence on rankings, placement, or what appears on the site. A product with no affiliate program still appears if podcasters recommend it enough.
            </p>
            <p>
              Affiliate revenue helps keep PodRise free for everyone.
            </p>
          </div>
        </motion.section>

        {/* Section 4: Paid Advertising — Separate and Always Labeled */}
        <motion.section
          className="max-w-3xl mx-auto px-4 sm:px-6 pb-16"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.28 }}
          data-testid="section-paid-advertising"
        >
          <div className="max-w-3xl mx-auto">
            <div className="flex items-center gap-3 my-8">
              <div className="h-px flex-1 bg-gradient-to-r from-transparent to-black/[0.08]" />
              <span className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-primary/[0.08] text-primary text-[14px] font-bold uppercase tracking-[0.1em]" data-testid="pill-advertising-label">
                <Megaphone className="w-4 h-4" />
                Paid Advertising
              </span>
              <div className="h-px flex-1 bg-gradient-to-l from-transparent to-black/[0.08]" />
            </div>
          </div>

          <div className="flex items-center gap-3 mb-8">
            <Megaphone className="w-5 h-5 text-primary" />
            <h2 className="text-xl sm:text-2xl font-display font-bold" data-testid="text-advertising-heading">Paid Advertising — Separate and Always Labeled</h2>
          </div>

          <div className="space-y-5 text-[17px] leading-[1.85] text-[#52525B] max-w-2xl">
            <p>
              PodRise runs paid advertisements. Brands can pay to have their products and services promoted to our audience. You can learn more on our <Link href="/advertise" className="text-primary font-medium hover:underline" data-testid="link-advertise-inline">advertising page</Link>.
            </p>
            <p>
              These paid ads appear in the newsletter, on podcast pages, and in personalized briefings — never in the <Link href="/shop" className="text-primary font-medium hover:underline" data-testid="link-shop-advertising">Shop</Link>.
            </p>
            <p>
              Every paid ad is written by PodRise in our voice, but it is always clearly labeled as sponsored. There is no ambiguity about what is an ad and what is not.
            </p>
            <p>
              Advertisers cannot buy editorial coverage. What PodRise writes about a <Link href="/podcasts" className="text-primary font-medium hover:underline" data-testid="link-podcasts-advertising">podcast</Link>, episode, guest, or topic is never influenced by any advertiser relationship.
            </p>
            <p>
              User trust is the most important asset PodRise has. Paid advertising exists to fund the product — it is never allowed to compromise the product.
            </p>
          </div>
        </motion.section>

        {/* Section 5: Other Revenue Streams */}
        <motion.section
          className="max-w-3xl mx-auto px-4 sm:px-6 pb-16"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.35 }}
          data-testid="section-other-revenue"
        >
          <div className="flex items-center gap-3 mb-8">
            <CreditCard className="w-5 h-5 text-primary" />
            <h2 className="text-xl sm:text-2xl font-display font-bold" data-testid="text-other-revenue-heading">Other Revenue Streams</h2>
          </div>

          <ul className="space-y-4 text-[17px] leading-[1.85] text-[#52525B] max-w-2xl">
            <li className="flex items-start gap-3">
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-primary mt-3 shrink-0" />
              <span><strong className="text-foreground">Pro subscriptions</strong> (coming soon) — unlimited access and full briefings for power users</span>
            </li>
            <li className="flex items-start gap-3">
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-primary mt-3 shrink-0" />
              <span><strong className="text-foreground">Enterprise plans</strong> — custom intelligence products for teams</span>
            </li>
            <li className="flex items-start gap-3">
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-primary mt-3 shrink-0" />
              <span>None of these are affiliated with editorial decisions</span>
            </li>
          </ul>
        </motion.section>

        {/* Section 6: The Legal Part */}
        <motion.section
          className="max-w-3xl mx-auto px-4 sm:px-6 pb-16"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.4 }}
          data-testid="section-legal"
        >
          <div className="flex items-center gap-3 mb-6">
            <Scale className="w-4 h-4 text-[#A1A1AA]" />
            <h2 className="text-[16px] font-display font-bold text-[#52525B] uppercase tracking-[0.1em]" data-testid="text-legal-heading">Legal Disclosure</h2>
          </div>

          <div className="space-y-3 text-[14px] leading-[1.75] text-[#A1A1AA] max-w-2xl">
            <p>
              PodRise participates in the Amazon Services LLC Associates Program, an affiliate advertising program designed to provide a means for sites to earn advertising fees by advertising and linking to Amazon.com. PodRise may also participate in other affiliate programs.
            </p>
            <p>
              Purchases made through affiliate links may earn PodRise a commission at no extra cost to the buyer.
            </p>
            <p>
              This page constitutes disclosure in accordance with the Federal Trade Commission's guidelines on the use of endorsements and testimonials in advertising (16 CFR Part 255).
            </p>
            <p>
              Affiliate relationships do not influence editorial decisions, rankings, or site content.
            </p>
            <p className="text-[14px] text-[#A1A1AA]">
              For more information, see our <Link href="/privacy" className="text-primary hover:underline" data-testid="link-privacy-legal">Privacy Policy</Link> and <Link href="/terms" className="text-primary hover:underline" data-testid="link-terms-legal">Terms of Service</Link>.
            </p>
          </div>
        </motion.section>

        {/* Section 7: Contact */}
        <motion.section
          className="max-w-3xl mx-auto px-4 sm:px-6 pb-20"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.45 }}
          data-testid="section-contact"
        >
          <div className="flex items-center gap-3 mb-6">
            <MessageCircle className="w-5 h-5 text-primary" />
            <h2 className="text-xl sm:text-2xl font-display font-bold" data-testid="text-contact-heading">Questions? Just Ask</h2>
          </div>

          <div className="space-y-4 text-[17px] leading-[1.85] text-[#52525B] max-w-2xl">
            <p>
              If you ever want to know whether PodRise has a commercial relationship with something you see on the site, ask us directly. We will give you a straight answer.
            </p>
            <p>
              Reach us through our <Link href="/contact" className="text-primary font-medium hover:underline" data-testid="link-contact-page">contact page</Link> or <Link href="/support" className="text-primary font-medium hover:underline" data-testid="link-support-page">support page</Link>.
            </p>
          </div>
        </motion.section>
      </main>

      <Footer />
    </div>
  );
}