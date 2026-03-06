import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { motion } from "framer-motion";
import { Tag, ExternalLink, Ticket, Gift, Zap, Clock, ArrowRight, ChevronDown, ChevronUp, Loader2, Podcast } from "lucide-react";
import { Footer } from "@/components/Footer";
import logoPath from "@assets/Podcap_logo_1772731738179.png";
import { useState } from "react";

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

function dealTypeIcon(type: string) {
  switch (type) {
    case "promo_code": return <Ticket className="w-4 h-4" />;
    case "free_trial": return <Zap className="w-4 h-4" />;
    case "special_link": return <ExternalLink className="w-4 h-4" />;
    case "discount": return <Tag className="w-4 h-4" />;
    case "bonus": return <Gift className="w-4 h-4" />;
    default: return <Tag className="w-4 h-4" />;
  }
}

function dealTypeLabel(type: string) {
  switch (type) {
    case "promo_code": return "Promo Code";
    case "free_trial": return "Free Trial";
    case "special_link": return "Special Link";
    case "discount": return "Discount";
    case "bonus": return "Bonus";
    default: return type;
  }
}

function dealTypeBadgeColor(type: string) {
  switch (type) {
    case "promo_code": return "bg-violet-100 text-violet-700";
    case "free_trial": return "bg-emerald-100 text-emerald-700";
    case "special_link": return "bg-blue-100 text-blue-700";
    case "discount": return "bg-amber-100 text-amber-700";
    case "bonus": return "bg-pink-100 text-pink-700";
    default: return "bg-gray-100 text-gray-700";
  }
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
        {
          "@type": "Question",
          "name": "What is the Podcast Deals page?",
          "acceptedAnswer": { "@type": "Answer", "text": "This page lists actionable sponsor offers mentioned on podcasts we track using transcript analysis." }
        },
        {
          "@type": "Question",
          "name": "Are these podcast promo codes updated regularly?",
          "acceptedAnswer": { "@type": "Answer", "text": "Yes. PodCap updates the page based on recently transcribed podcast episodes." }
        },
        {
          "@type": "Question",
          "name": "Does PodCap sell these products?",
          "acceptedAnswer": { "@type": "Answer", "text": "No. PodCap simply organizes deals mentioned on podcasts." }
        },
        {
          "@type": "Question",
          "name": "Can I get summaries of these podcasts?",
          "acceptedAnswer": { "@type": "Answer", "text": "Yes. Visit any podcast page on PodCap and sign up to receive recap emails." }
        },
        {
          "@type": "Question",
          "name": "What if a podcast mentions a deal without a promo code?",
          "acceptedAnswer": { "@type": "Answer", "text": "Some ads use special links, free trials, or bonus offers instead of codes. We include those if there is a clear redemption method." }
        },
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

  const podcastGroups: Record<string, DealEntry[]> = {};
  (deals || []).forEach((deal) => {
    if (!podcastGroups[deal.podcastName]) podcastGroups[deal.podcastName] = [];
    podcastGroups[deal.podcastName].push(deal);
  });

  const categories = [...new Set((deals || []).map(d => d.dealCategory).filter(Boolean))];

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <header className="w-full px-6 py-5 flex items-center justify-between max-w-6xl mx-auto">
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

      <main className="flex-1 flex flex-col items-center px-4 sm:px-6 lg:px-8 pb-16">
        <motion.section
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="w-full max-w-4xl text-center pt-10 sm:pt-16 pb-8"
        >
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/[0.07] text-primary text-xs font-bold uppercase tracking-widest mb-6">
            <Tag className="w-3.5 h-3.5" />
            Podcast Deals & Promo Codes
          </div>
          <h1 className="text-3xl sm:text-4xl md:text-5xl font-display font-extrabold text-foreground leading-[1.1] tracking-[-0.02em] mb-4" data-testid="heading-deals">
            Latest Podcast Deals and Promo Codes
          </h1>
          <p className="text-base sm:text-lg text-muted-foreground max-w-2xl mx-auto leading-relaxed mb-4">
            Here are some of the most recent actionable podcast deals mentioned on podcasts we track. PodCap analyzes podcast transcripts and surfaces sponsor offers that include promo codes, special links, free trials, or other redemption methods.
          </p>
          <p className="text-sm text-muted-foreground/70 max-w-xl mx-auto">
            We only include deals with a clear way for listeners to claim the offer, not generic sponsor mentions.
            Want more than just the deals?{" "}
            <Link href="/podcasts" className="text-primary font-semibold hover:underline">
              Visit your favorite podcast pages
            </Link>{" "}
            and sign up to get daily podcast recaps.
          </p>
        </motion.section>

        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        ) : !deals || deals.length === 0 ? (
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.2 }}
            className="w-full max-w-2xl text-center py-16"
          >
            <Tag className="w-12 h-12 text-muted-foreground/20 mx-auto mb-4" />
            <h2 className="font-display font-bold text-xl text-foreground mb-2">Deals coming soon</h2>
            <p className="text-sm text-muted-foreground">
              We're analyzing podcast transcripts to surface the latest sponsor deals. Check back soon!
            </p>
          </motion.div>
        ) : (
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.15 }}
            className="w-full max-w-4xl space-y-10"
          >
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" data-testid="deals-grid">
              {deals.map((deal) => (
                <div
                  key={deal.id}
                  className="glass-panel rounded-2xl p-5 flex flex-col gap-3 hover:shadow-lg hover:shadow-black/[0.04] transition-shadow"
                  data-testid={`deal-card-${deal.id}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="font-display font-bold text-foreground text-base leading-snug" data-testid={`deal-sponsor-${deal.id}`}>
                      {deal.sponsorName}
                    </h3>
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold shrink-0 ${dealTypeBadgeColor(deal.dealType)}`}>
                      {dealTypeIcon(deal.dealType)}
                      {dealTypeLabel(deal.dealType)}
                    </span>
                  </div>

                  <p className="text-sm text-foreground/80 leading-relaxed" data-testid={`deal-offer-${deal.id}`}>
                    {deal.offerSummary}
                  </p>

                  {deal.promoCode && (
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-muted-foreground uppercase">Code:</span>
                      <span
                        className="inline-block px-3 py-1 bg-primary/[0.08] text-primary font-mono font-bold text-sm rounded-lg tracking-wide"
                        data-testid={`deal-code-${deal.id}`}
                      >
                        {deal.promoCode}
                      </span>
                    </div>
                  )}

                  {!deal.promoCode && (
                    <p className="text-xs text-muted-foreground/60">No code mentioned</p>
                  )}

                  {deal.specialLink && (
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <ExternalLink className="w-3 h-3" />
                      <span className="truncate" title={deal.specialLink}>{deal.specialLink}</span>
                    </div>
                  )}

                  <div className="mt-auto pt-3 border-t border-black/[0.04] flex items-center justify-between">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <Podcast className="w-3.5 h-3.5 text-muted-foreground/50 shrink-0" />
                      {deal.podcastSlug ? (
                        <Link
                          href={`/podcasts/${deal.podcastSlug}`}
                          className="text-xs font-semibold text-primary hover:underline truncate"
                          data-testid={`deal-podcast-link-${deal.id}`}
                        >
                          {deal.podcastName}
                        </Link>
                      ) : (
                        <span className="text-xs font-semibold text-foreground truncate">{deal.podcastName}</span>
                      )}
                    </div>
                    <div className="flex items-center gap-1 text-xs text-muted-foreground/50 shrink-0">
                      <Clock className="w-3 h-3" />
                      <span>{deal.episodeDate}</span>
                    </div>
                  </div>

                  <p className="text-[10px] text-muted-foreground/40 leading-tight">
                    Mentioned in: {deal.episodeTitle}
                  </p>
                </div>
              ))}
            </div>

            {Object.keys(podcastGroups).length > 0 && (
              <section className="pt-6" data-testid="section-by-podcast">
                <h2 className="font-display font-extrabold text-2xl text-foreground mb-6">Recent Deals by Podcast</h2>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {Object.entries(podcastGroups).map(([name, groupDeals]) => {
                    const slug = groupDeals[0]?.podcastSlug;
                    return (
                      <div key={name} className="flex items-center gap-3 p-4 bg-black/[0.02] rounded-xl border border-black/[0.04]">
                        <div className="flex-1 min-w-0">
                          {slug ? (
                            <Link href={`/podcasts/${slug}`} className="font-semibold text-sm text-primary hover:underline truncate block" data-testid={`podcast-group-${slug}`}>
                              {name}
                            </Link>
                          ) : (
                            <span className="font-semibold text-sm text-foreground truncate block">{name}</span>
                          )}
                          <span className="text-xs text-muted-foreground">{groupDeals.length} deal{groupDeals.length > 1 ? "s" : ""} found</span>
                        </div>
                        <span className="text-xs font-bold text-primary bg-primary/[0.08] px-2 py-1 rounded-lg">{groupDeals.length}</span>
                      </div>
                    );
                  })}
                </div>
              </section>
            )}

            {categories.length > 0 && (
              <section className="pt-4" data-testid="section-categories">
                <h2 className="font-display font-extrabold text-2xl text-foreground mb-4">Popular Sponsor Categories</h2>
                <div className="flex flex-wrap gap-2">
                  {categories.map((cat) => (
                    <span key={cat} className="px-3 py-1.5 bg-black/[0.03] rounded-lg text-sm font-medium text-foreground/70">
                      {cat}
                    </span>
                  ))}
                </div>
              </section>
            )}

            <section className="pt-4" data-testid="section-seo-text">
              <p className="text-sm text-muted-foreground leading-relaxed">
                Explore recent deals mentioned on podcasts like{" "}
                <Link href="/podcasts/myfirstmillion" className="text-primary hover:underline">My First Million</Link>,{" "}
                <Link href="/podcasts/callherdaddy" className="text-primary hover:underline">Call Her Daddy</Link>,{" "}
                <Link href="/podcasts/hubermanlab" className="text-primary hover:underline">Huberman Lab</Link>,{" "}
                and many more. PodCap analyzes transcripts to surface podcast promo codes, sponsor offers, and exclusive deals so you don't have to listen to every ad break.
              </p>
            </section>

            <section className="glass-panel rounded-2xl p-6 sm:p-8 text-center" data-testid="section-cta">
              <h2 className="font-display font-extrabold text-xl sm:text-2xl text-foreground mb-3">
                Get more than just deals
              </h2>
              <p className="text-sm text-muted-foreground mb-5 max-w-md mx-auto">
                Sign up for PodCap to receive daily AI-powered podcast recaps delivered to your inbox. Never miss a key insight again.
              </p>
              <Link
                href="/podcasts"
                className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-primary text-primary-foreground font-display font-bold text-sm shadow-lg shadow-primary/20 hover:shadow-xl hover:shadow-primary/30 transition-all active:scale-[0.98]"
                data-testid="button-browse-podcasts"
              >
                Choose Podcasts to Recap
                <ArrowRight className="w-4 h-4" />
              </Link>
            </section>
          </motion.div>
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
          <div className="glass-panel rounded-2xl overflow-hidden px-6">
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

        <p className="text-xs text-muted-foreground/40 text-center max-w-md mt-4">
          Check sponsor websites for current terms. Deals shown were recently mentioned in podcast episodes and may have changed or expired.
        </p>
      </main>

      <Footer />
    </div>
  );
}
