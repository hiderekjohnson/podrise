import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { motion } from "framer-motion";
import { Tag, ExternalLink, Ticket, Zap, Clock, ArrowRight, ChevronDown, ChevronUp, Loader2, Podcast, Copy, Check } from "lucide-react";
import { Footer } from "@/components/Footer";
import logoPath from "@assets/Podcap_logo_1772731738179.png";

interface DealEntry {
  id: number;
  podcastName: string;
  podcastId: string;
  podcastSlug: string | null;
  episodeTitle: string;
  episodeDate: string;
  sponsorName: string;
  offerSummary: string;
  promoCode: string | null;
  specialLink: string | null;
  dealType: string;
  dealCategory: string | null;
  detectedAt: string;
}

function dealTypeBadge(type: string) {
  const config: Record<string, { icon: typeof Tag; label: string; className: string }> = {
    promo_code: { icon: Ticket, label: "Promo Code", className: "bg-violet-50 text-violet-600 border-violet-100" },
    free_trial: { icon: Zap, label: "Free Trial", className: "bg-emerald-50 text-emerald-600 border-emerald-100" },
    special_link: { icon: ExternalLink, label: "Special Link", className: "bg-blue-50 text-blue-600 border-blue-100" },
    discount: { icon: Tag, label: "Discount", className: "bg-amber-50 text-amber-600 border-amber-100" },
    bonus: { icon: Tag, label: "Bonus", className: "bg-pink-50 text-pink-600 border-pink-100" },
  };
  const c = config[type] || config.discount;
  const Icon = c.icon;
  return (
    <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-bold uppercase tracking-wide border ${c.className}`}>
      <Icon className="w-3 h-3" />
      {c.label}
    </span>
  );
}

function PromoCodeBadge({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <button
      onClick={handleCopy}
      className="group inline-flex items-center gap-2 px-4 py-2 bg-primary/[0.06] hover:bg-primary/[0.10] border border-primary/[0.12] rounded-xl transition-all cursor-pointer"
      title="Click to copy code"
    >
      <span className="font-mono font-bold text-sm text-primary tracking-wider">{code}</span>
      {copied ? (
        <Check className="w-3.5 h-3.5 text-emerald-500" />
      ) : (
        <Copy className="w-3.5 h-3.5 text-primary/40 group-hover:text-primary/70 transition-colors" />
      )}
    </button>
  );
}

function FAQItem({ question, answer }: { question: string; answer: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-b border-black/[0.06] last:border-0">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between py-5 text-left group"
        data-testid={`faq-toggle-${question.slice(0, 20).replace(/\s/g, "-").toLowerCase()}`}
      >
        <span className="font-display font-bold text-foreground text-[15px] pr-4">{question}</span>
        {open ? <ChevronUp className="w-4 h-4 text-muted-foreground shrink-0" /> : <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />}
      </button>
      {open && (
        <p className="text-sm text-muted-foreground leading-relaxed pb-5 pr-8">{answer}</p>
      )}
    </div>
  );
}

export default function PodcastDeals() {
  const { data: deals, isLoading } = useQuery<DealEntry[]>({
    queryKey: ["/api/podcast-deals"],
  });

  useEffect(() => {
    document.title = "Latest Podcast Deals and Promo Codes Mentioned on Top Podcasts | PodCap";

    let meta = document.querySelector('meta[name="description"]');
    if (!meta) { meta = document.createElement("meta"); meta.setAttribute("name", "description"); document.head.appendChild(meta); }
    meta.setAttribute("content", "Browse the latest podcast deals, promo codes, and sponsor offers mentioned on popular podcasts. Discover recent offers from your favorite shows and sign up to get podcast recaps with PodCap.");

    let ogTitle = document.querySelector('meta[property="og:title"]');
    if (!ogTitle) { ogTitle = document.createElement("meta"); ogTitle.setAttribute("property", "og:title"); document.head.appendChild(ogTitle); }
    ogTitle.setAttribute("content", "Latest Podcast Deals and Promo Codes | PodCap");

    let ogDesc = document.querySelector('meta[property="og:description"]');
    if (!ogDesc) { ogDesc = document.createElement("meta"); ogDesc.setAttribute("property", "og:description"); document.head.appendChild(ogDesc); }
    ogDesc.setAttribute("content", "Browse the latest podcast deals, promo codes, and sponsor offers mentioned on popular podcasts.");

    let ogUrl = document.querySelector('meta[property="og:url"]');
    if (!ogUrl) { ogUrl = document.createElement("meta"); ogUrl.setAttribute("property", "og:url"); document.head.appendChild(ogUrl); }
    ogUrl.setAttribute("content", "https://podcap.io/podcast-deals");

    const faqSchema = {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      "mainEntity": [
        { "@type": "Question", "name": "What is the Podcast Deals page?", "acceptedAnswer": { "@type": "Answer", "text": "This page lists actionable sponsor offers mentioned on podcasts we track using transcript analysis." } },
        { "@type": "Question", "name": "Are these podcast promo codes updated regularly?", "acceptedAnswer": { "@type": "Answer", "text": "Yes. PodCap updates the page based on recently transcribed podcast episodes." } },
        { "@type": "Question", "name": "Does PodCap sell these products?", "acceptedAnswer": { "@type": "Answer", "text": "No. PodCap simply organizes deals mentioned on podcasts." } },
        { "@type": "Question", "name": "Can I get summaries of these podcasts?", "acceptedAnswer": { "@type": "Answer", "text": "Yes. Visit any podcast page on PodCap and sign up to receive recap emails." } },
        { "@type": "Question", "name": "What if a podcast mentions a deal without a promo code?", "acceptedAnswer": { "@type": "Answer", "text": "Some ads use special links, free trials, or bonus offers instead of codes. We include those if there is a clear redemption method." } },
      ]
    };

    let faqScript = document.querySelector('script[data-schema="faq-deals"]');
    if (!faqScript) { faqScript = document.createElement("script"); faqScript.setAttribute("type", "application/ld+json"); faqScript.setAttribute("data-schema", "faq-deals"); document.head.appendChild(faqScript); }
    faqScript.textContent = JSON.stringify(faqSchema);

    if (deals && deals.length > 0) {
      const itemListSchema = {
        "@context": "https://schema.org",
        "@type": "ItemList",
        "name": "Latest Podcast Deals and Promo Codes",
        "itemListElement": deals.slice(0, 20).map((deal, i) => ({
          "@type": "ListItem",
          "position": i + 1,
          "name": `${deal.sponsorName} - ${deal.offerSummary}`,
          "description": `Mentioned on ${deal.podcastName} on ${deal.episodeDate}`
        }))
      };
      let ilScript = document.querySelector('script[data-schema="itemlist-deals"]');
      if (!ilScript) { ilScript = document.createElement("script"); ilScript.setAttribute("type", "application/ld+json"); ilScript.setAttribute("data-schema", "itemlist-deals"); document.head.appendChild(ilScript); }
      ilScript.textContent = JSON.stringify(itemListSchema);
    }

    return () => {
      document.querySelector('script[data-schema="faq-deals"]')?.remove();
      document.querySelector('script[data-schema="itemlist-deals"]')?.remove();
    };
  }, [deals]);

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <header className="w-full px-6 py-5 flex items-center justify-between max-w-3xl mx-auto">
        <Link href="/" className="flex items-center" data-testid="img-logo">
          <img src={logoPath} alt="PodCap" className="h-9 object-contain" />
        </Link>
        <Link
          href="/login"
          className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
          data-testid="link-login"
        >
          Log in
        </Link>
      </header>

      <main className="flex-1 flex flex-col items-center px-4 sm:px-6 pb-16">

        <motion.section
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="w-full max-w-3xl text-center pt-10 sm:pt-16 pb-10"
        >
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-primary/[0.06] text-primary text-[11px] font-bold uppercase tracking-widest mb-5">
            <Tag className="w-3 h-3" />
            Podcast Deals
          </div>
          <h1 className="text-3xl sm:text-4xl md:text-[2.75rem] font-display font-extrabold text-foreground leading-[1.1] tracking-[-0.025em] mb-4" data-testid="heading-deals">
            Deals & codes from your
            <br className="hidden sm:block" />
            {" "}favorite podcasts
          </h1>
          <p className="text-base text-muted-foreground max-w-lg mx-auto leading-relaxed">
            We scan podcast transcripts and pull out promo codes, special links, and offers so you don't have to sit through every ad break.
          </p>
        </motion.section>

        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-7 h-7 animate-spin text-primary" />
          </div>
        ) : !deals || deals.length === 0 ? (
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.2 }}
            className="w-full max-w-md text-center py-20"
          >
            <div className="w-16 h-16 rounded-2xl bg-primary/[0.06] flex items-center justify-center mx-auto mb-5">
              <Tag className="w-8 h-8 text-primary/30" />
            </div>
            <h2 className="font-display font-bold text-xl text-foreground mb-2" data-testid="text-empty-deals">No deals yet</h2>
            <p className="text-sm text-muted-foreground leading-relaxed">
              We're analyzing podcast transcripts to surface the latest sponsor deals. Check back soon!
            </p>
          </motion.div>
        ) : (
          <div className="w-full max-w-3xl space-y-12">
            <div className="space-y-3" data-testid="deals-grid">
              {deals.map((deal, i) => (
                <motion.div
                  key={deal.id}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.35, delay: Math.min(i * 0.06, 0.4) }}
                  className="bg-white border border-black/[0.06] rounded-2xl p-5 sm:p-6 hover:border-black/[0.10] hover:shadow-lg hover:shadow-black/[0.03] transition-all"
                  data-testid={`deal-card-${deal.id}`}
                >
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <h3 className="font-display font-bold text-foreground text-lg leading-snug" data-testid={`deal-sponsor-${deal.id}`}>
                      {deal.sponsorName}
                    </h3>
                    {dealTypeBadge(deal.dealType)}
                  </div>

                  <p className="text-sm text-foreground/75 leading-relaxed mb-4" data-testid={`deal-offer-${deal.id}`}>
                    {deal.offerSummary}
                  </p>

                  <div className="flex flex-wrap items-center gap-3 mb-4">
                    {deal.promoCode && (
                      <PromoCodeBadge code={deal.promoCode} />
                    )}

                    {deal.specialLink && (
                      <a
                        href={deal.specialLink.startsWith("http") ? deal.specialLink : `https://${deal.specialLink}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 text-sm text-primary hover:text-primary/80 font-medium transition-colors"
                        data-testid={`deal-link-${deal.id}`}
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                        <span>{deal.specialLink}</span>
                      </a>
                    )}
                  </div>

                  <div className="flex items-center gap-4 text-xs text-muted-foreground/60">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <Podcast className="w-3.5 h-3.5 shrink-0" />
                      {deal.podcastSlug ? (
                        <Link
                          href={`/podcasts/${deal.podcastSlug}`}
                          className="font-semibold text-primary/70 hover:text-primary hover:underline truncate transition-colors"
                          data-testid={`deal-podcast-link-${deal.id}`}
                        >
                          {deal.podcastName}
                        </Link>
                      ) : (
                        <span className="font-semibold text-foreground/50 truncate">{deal.podcastName}</span>
                      )}
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <Clock className="w-3 h-3" />
                      <span>{deal.episodeDate}</span>
                    </div>
                  </div>

                  <p className="text-[11px] text-muted-foreground/40 mt-2 leading-snug">
                    Mentioned in: {deal.episodeTitle}
                  </p>
                </motion.div>
              ))}
            </div>

            <section className="text-center" data-testid="section-seo-text">
              <p className="text-sm text-muted-foreground/70 leading-relaxed max-w-xl mx-auto">
                Deals sourced from podcasts including{" "}
                <Link href="/podcasts/myfirstmillion" className="text-primary hover:underline">My First Million</Link>,{" "}
                <Link href="/podcasts/callherdaddy" className="text-primary hover:underline">Call Her Daddy</Link>,{" "}
                <Link href="/podcasts/hubermanlab" className="text-primary hover:underline">Huberman Lab</Link>,{" "}
                and more.
              </p>
            </section>

            <section className="bg-primary/[0.03] border border-primary/[0.08] rounded-2xl p-8 sm:p-10 text-center" data-testid="section-cta">
              <h2 className="font-display font-extrabold text-xl sm:text-2xl text-foreground mb-2">
                More than just deals
              </h2>
              <p className="text-sm text-muted-foreground mb-6 max-w-md mx-auto leading-relaxed">
                Get the key takeaways from every episode — delivered to your inbox each morning.
              </p>
              <Link
                href="/podcasts"
                className="inline-flex items-center gap-2 px-6 h-12 rounded-xl bg-primary text-primary-foreground font-display font-bold text-sm shadow-lg shadow-primary/20 hover:shadow-xl hover:shadow-primary/25 hover:brightness-105 transition-all active:scale-[0.98]"
                data-testid="button-browse-podcasts"
              >
                Browse Podcasts
                <ArrowRight className="w-4 h-4" />
              </Link>
            </section>
          </div>
        )}

        <motion.section
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5, delay: 0.3 }}
          className="w-full max-w-3xl pt-16 pb-8"
          data-testid="section-faq"
        >
          <h2 className="font-display font-extrabold text-2xl text-foreground mb-6 text-center">
            Frequently Asked Questions
          </h2>
          <div className="bg-white border border-black/[0.06] rounded-2xl overflow-hidden px-6">
            <FAQItem
              question="What is the Podcast Deals page?"
              answer="This page lists actionable sponsor offers mentioned on podcasts we track using transcript analysis."
            />
            <FAQItem
              question="Are these podcast promo codes updated regularly?"
              answer="Yes. PodCap updates the page based on recently transcribed podcast episodes."
            />
            <FAQItem
              question="Does PodCap sell these products?"
              answer="No. PodCap simply organizes deals mentioned on podcasts."
            />
            <FAQItem
              question="Can I get summaries of these podcasts?"
              answer="Yes. Visit any podcast page on PodCap and sign up to receive recap emails."
            />
            <FAQItem
              question="What if a podcast mentions a deal without a promo code?"
              answer="Some ads use special links, free trials, or bonus offers instead of codes. We include those if there is a clear redemption method."
            />
          </div>
        </motion.section>

        <p className="text-[11px] text-muted-foreground/40 text-center max-w-sm mt-2">
          Check sponsor websites for current terms. Deals shown were recently mentioned in podcast episodes and may have changed or expired.
        </p>
      </main>

      <Footer />
    </div>
  );
}
