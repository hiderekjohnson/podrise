import { useEffect } from "react";
import { Link } from "wouter";
import { Heart, Search, Users, TrendingUp, Headphones, ArrowRight, Mail, Mic, Globe, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Footer } from "@/components/Footer";
import logoPath from "@assets/Podcap_logo_1772731738179.png";

const FEATURED_PODCASTS = [
  {
    slug: "myfirstmillion",
    name: "My First Million",
    description: "Business ideas, side hustles, and startup strategies",
    artworkUrl: "https://is1-ssl.mzstatic.com/image/thumb/Podcasts211/v4/fc/be/b0/fcbeb0f0-fb7a-509e-1cd0-ab60222ee7e5/mza_17824311072672278584.jpeg/600x600bb.jpg",
  },
  {
    slug: "founders",
    name: "Founders",
    description: "Lessons from the biographies of history's greatest entrepreneurs",
    artworkUrl: "https://is1-ssl.mzstatic.com/image/thumb/Podcasts211/v4/ed/71/4f/ed714f67-f095-a4ef-f38e-d8c02300666a/mza_11432355988627368701.jpg/600x600bb.jpg",
  },
  {
    slug: "allin",
    name: "All-In Podcast",
    description: "Tech industry analysis, venture capital insights, and geopolitics",
    artworkUrl: "https://is1-ssl.mzstatic.com/image/thumb/Podcasts124/v4/c7/d2/92/c7d292ea-44b3-47ff-2f5e-74fa5b23db6c/mza_7005270671777648882.png/600x600bb.jpg",
  },
  {
    slug: "acquired",
    name: "Acquired",
    description: "Deep-dive stories behind the world's greatest companies",
    artworkUrl: "https://is1-ssl.mzstatic.com/image/thumb/Podcasts211/v4/d6/e9/f9/d6e9f92c-8f46-a302-f7a2-144cefbd74bf/mza_16135045473976550452.jpg/600x600bb.jpg",
  },
  {
    slug: "hubermanlab",
    name: "Huberman Lab",
    description: "Neuroscience-based tools for health, performance, and focus",
    artworkUrl: "https://is1-ssl.mzstatic.com/image/thumb/Podcasts221/v4/aa/f1/51/aaf151f6-8661-833a-c9d3-7c4ce22f8868/mza_253061105143942369.jpg/600x600bb.jpg",
  },
  {
    slug: "howibuiltthis",
    name: "How I Built This",
    description: "The stories behind the world's best-known companies",
    artworkUrl: "https://is1-ssl.mzstatic.com/image/thumb/Podcasts126/v4/64/45/06/644506b5-c44f-f661-f74e-f63a4b2511bc/mza_14892199991035639268.jpeg/600x600bb.jpg",
  },
];

const BENEFITS = [
  {
    icon: Search,
    title: "More Discovery",
    description: "Every episode recap becomes a searchable entry point. People who would never have found your show through a podcast app can discover individual episodes through Google.",
    color: "text-blue-600 bg-blue-50",
  },
  {
    icon: Users,
    title: "More Qualified Listeners",
    description: "When someone reads a recap and decides to listen, they already know the episode is for them. That means more engaged listeners who are more likely to finish the episode.",
    color: "text-emerald-600 bg-emerald-50",
  },
  {
    icon: TrendingUp,
    title: "Better Engagement",
    description: "Qualified listeners tend to stick around longer, subscribe more often, and tell friends about your show. A recap can turn a maybe into a committed listen.",
    color: "text-amber-600 bg-amber-50",
  },
  {
    icon: Globe,
    title: "Search Visibility",
    description: "Dedicated podcast pages and episode summaries create new SEO entry points for your show. More pages indexed means more chances for new listeners to find you.",
    color: "text-purple-600 bg-purple-50",
  },
];

export default function ForPodcasters() {
  useEffect(() => {
    document.title = "For Podcasters | How PodCap Helps Grow Podcast Discovery and Listeners";
    const metaDesc = document.querySelector('meta[name="description"]');
    const desc = "PodCap helps listeners discover podcast episodes faster with short episode recaps and summaries. Learn how PodCap can improve podcast discovery, attract more qualified listeners, and help fans stay connected to your show.";
    if (metaDesc) {
      metaDesc.setAttribute("content", desc);
    } else {
      const meta = document.createElement("meta");
      meta.name = "description";
      meta.content = desc;
      document.head.appendChild(meta);
    }
  }, []);

  return (
    <>
      <nav className="sticky top-0 z-50 w-full border-b border-black/[0.04] bg-white/80 backdrop-blur-md" data-testid="nav-bar">
        <div className="max-w-6xl mx-auto flex items-center justify-between h-14 px-6">
          <Link href="/" data-testid="link-home">
            <img src={logoPath} alt="PodCap" className="h-6 object-contain" />
          </Link>
          <div className="flex items-center gap-6">
            <Link href="/podcasts" className="text-sm text-muted-foreground hover:text-foreground transition-colors" data-testid="link-nav-podcasts">
              Most Popular
            </Link>
            <Link href="/login" className="text-sm text-muted-foreground hover:text-foreground transition-colors" data-testid="link-nav-login">
              Log In
            </Link>
          </div>
        </div>
      </nav>

      <main className="min-h-screen bg-background">

        <section className="relative overflow-hidden pt-20 pb-16 sm:pt-28 sm:pb-20" data-testid="section-hero">
          <div className="absolute inset-0 bg-gradient-to-b from-red-50/40 via-background to-background" />
          <div className="relative max-w-3xl mx-auto px-6 text-center">
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-red-50 text-red-500 text-sm font-bold uppercase tracking-widest mb-8" data-testid="badge-love">
              WE <Heart className="w-4 h-4 fill-red-500" /> PODCASTERS
            </div>
            <h1 className="text-3xl sm:text-4xl md:text-[2.75rem] font-display font-extrabold tracking-[-0.03em] leading-[1.15] mb-6" data-testid="text-hero-title">
              We're here to help listeners discover your show
            </h1>
            <p className="text-lg sm:text-xl text-muted-foreground leading-relaxed max-w-2xl mx-auto mb-10" data-testid="text-hero-subtitle">
              PodCap creates short episode recaps that help people find and engage with podcasts they'll love. We believe that's good for listeners and good for creators.
            </p>
            <div className="flex items-center justify-center gap-3 flex-wrap">
              <a href="mailto:hello@podcap.io" data-testid="button-hero-contact">
                <Button size="lg" className="rounded-xl font-display font-bold text-base px-8 h-12 shadow-md hover:shadow-lg hover:-translate-y-0.5 transition-all">
                  <Mail className="w-4 h-4 mr-2" />
                  Get in Touch
                </Button>
              </a>
              <Link href="/podcasts" data-testid="button-hero-browse">
                <Button variant="outline" size="lg" className="rounded-xl font-display font-bold text-base px-8 h-12 hover:-translate-y-0.5 transition-all">
                  Browse Podcasts
                </Button>
              </Link>
            </div>
          </div>
        </section>

        <section className="py-16 sm:py-20" data-testid="section-admiration">
          <div className="max-w-3xl mx-auto px-6">
            <div className="bg-white border border-black/[0.06] rounded-2xl p-8 sm:p-10 md:p-12 shadow-sm" data-testid="card-admiration">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 rounded-xl bg-primary/[0.07] flex items-center justify-center">
                  <Mic className="w-5 h-5 text-primary" />
                </div>
                <h2 className="text-xl sm:text-2xl font-display font-bold" data-testid="text-admiration-title">We genuinely admire what you do</h2>
              </div>
              <div className="space-y-5 text-[17px] leading-[1.8] text-muted-foreground">
                <p>
                  Running a great podcast is incredibly hard. Showing up consistently, preparing, researching, interviewing, editing, publishing, and keeping an audience engaged takes real skill and discipline. We genuinely admire podcasters. If we had the talent to run a great podcast ourselves, we'd probably be doing that instead of building another web tool.
                </p>
                <p>
                  The issue is not that podcasts are bad. The issue is that there are too many great episodes and not enough time in the day. Even people who love podcasts fall behind. PodCap exists to help listeners quickly understand what an episode is about so they can decide what's worth their time.
                </p>
              </div>
            </div>
          </div>
        </section>

        <section className="py-16 sm:py-20 bg-slate-50/50" data-testid="section-how-helps">
          <div className="max-w-4xl mx-auto px-6">
            <div className="text-center mb-14">
              <h2 className="text-2xl sm:text-3xl font-display font-bold tracking-[-0.02em] mb-4" data-testid="text-benefits-title">How PodCap can help your podcast</h2>
              <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
                Episode recaps create new ways for people to discover your show and help turn casual browsers into committed listeners.
              </p>
            </div>
            <div className="grid sm:grid-cols-2 gap-5">
              {BENEFITS.map((benefit) => (
                <div
                  key={benefit.title}
                  className="bg-white border border-black/[0.06] rounded-2xl p-7 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all"
                  data-testid={`card-benefit-${benefit.title.toLowerCase().replace(/\s+/g, '-')}`}
                >
                  <div className={`w-11 h-11 rounded-xl ${benefit.color} flex items-center justify-center mb-4`}>
                    <benefit.icon className="w-5 h-5" />
                  </div>
                  <h3 className="text-lg font-display font-bold mb-2">{benefit.title}</h3>
                  <p className="text-[15px] leading-[1.7] text-muted-foreground">{benefit.description}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="py-16 sm:py-20" data-testid="section-the-logic">
          <div className="max-w-3xl mx-auto px-6">
            <h2 className="text-2xl sm:text-3xl font-display font-bold tracking-[-0.02em] mb-10 text-center" data-testid="text-logic-title">
              The logic is simple
            </h2>
            <div className="space-y-6">
              {[
                { num: "1", text: "Many potential listeners never start a long episode because they're unsure whether it's worth the time." },
                { num: "2", text: "A short recap reduces that friction. It gives people enough context to decide." },
                { num: "3", text: "When someone reads a recap and realizes an episode is for them, that's a more qualified listen." },
                { num: "4", text: "Qualified listeners are more likely to finish episodes, subscribe, and come back for more." },
                { num: "5", text: "Superfans still listen to everything. Casual fans may listen more often when they know what an episode covers before pressing play." },
              ].map((step) => (
                <div key={step.num} className="flex gap-5 items-start" data-testid={`step-${step.num}`}>
                  <div className="w-9 h-9 rounded-full bg-primary/[0.07] flex items-center justify-center flex-shrink-0 mt-0.5">
                    <span className="text-sm font-display font-bold text-primary">{step.num}</span>
                  </div>
                  <p className="text-[17px] leading-[1.7] text-muted-foreground">{step.text}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="py-16 sm:py-20 bg-slate-50/50" data-testid="section-podcast-pages">
          <div className="max-w-4xl mx-auto px-6">
            <div className="text-center mb-12">
              <h2 className="text-2xl sm:text-3xl font-display font-bold tracking-[-0.02em] mb-4" data-testid="text-pages-title">
                Custom pages for top podcasts
              </h2>
              <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
                For many major podcasts, we've created dedicated PodCap pages. These pages give a show's fans a place to sign up for recaps and create searchable hubs where people can discover episode summaries and learn about the show.
              </p>
            </div>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {FEATURED_PODCASTS.map((podcast) => (
                <Link
                  key={podcast.slug}
                  href={`/podcasts/${podcast.slug}`}
                  className="group"
                  data-testid={`card-podcast-${podcast.slug}`}
                >
                  <div className="bg-white border border-black/[0.06] rounded-2xl p-5 shadow-sm hover:shadow-md hover:-translate-y-1 transition-all h-full flex flex-col">
                    <img
                      src={podcast.artworkUrl}
                      alt={podcast.name}
                      className="w-full aspect-square rounded-xl object-cover mb-4"
                      loading="lazy"
                    />
                    <h3 className="font-display font-bold text-[15px] mb-1">{podcast.name}</h3>
                    <p className="text-[13px] text-muted-foreground leading-snug mb-4 flex-1">{podcast.description}</p>
                    <div className="flex items-center text-primary text-sm font-display font-bold group-hover:gap-2 transition-all">
                      View Podcast Page <ChevronRight className="w-4 h-4 ml-1" />
                    </div>
                  </div>
                </Link>
              ))}
            </div>
            <div className="text-center mt-8">
              <Link href="/podcasts" data-testid="link-browse-all">
                <Button variant="outline" className="rounded-xl font-display font-bold">
                  Browse All Podcasts <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
              </Link>
            </div>
          </div>
        </section>

        <section className="py-16 sm:py-20" data-testid="section-collaboration">
          <div className="max-w-3xl mx-auto px-6">
            <div className="bg-white border border-black/[0.06] rounded-2xl p-8 sm:p-10 md:p-12 shadow-sm" data-testid="card-collaboration">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center">
                  <Headphones className="w-5 h-5 text-emerald-600" />
                </div>
                <h2 className="text-xl sm:text-2xl font-display font-bold" data-testid="text-collaboration-title">We want to help podcasters</h2>
              </div>
              <div className="space-y-5 text-[17px] leading-[1.8] text-muted-foreground">
                <p>
                  If there's anything we can build to make life easier for podcasters, drive more listens, improve discoverability, or better support creators, we want to hear about it. This isn't lip service. We're a small team, and your feedback directly shapes what we build next.
                </p>
                <p>
                  Whether you want to claim your podcast's page, suggest a feature, or just tell us what would be useful, we'd love to hear from you.
                </p>
              </div>
            </div>
          </div>
        </section>

        <section className="py-16 sm:py-24" data-testid="section-cta">
          <div className="max-w-3xl mx-auto px-6">
            <div className="relative bg-gradient-to-br from-primary/[0.04] to-primary/[0.08] border border-primary/[0.08] rounded-2xl p-10 sm:p-14 text-center overflow-hidden">
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(59,130,246,0.06),transparent_60%)]" />
              <div className="relative">
                <h2 className="text-2xl sm:text-3xl font-display font-bold tracking-[-0.02em] mb-4" data-testid="text-cta-title">
                  Let's work together
                </h2>
                <p className="text-lg text-muted-foreground mb-8 max-w-xl mx-auto">
                  We're podcast fans first and builders second. If you run a podcast and want to explore how PodCap can help your show reach more listeners, reach out. We'd love to talk.
                </p>
                <div className="flex items-center justify-center gap-3 flex-wrap">
                  <a href="mailto:hello@podcap.io" data-testid="button-cta-email">
                    <Button size="lg" className="rounded-xl font-display font-bold text-base px-8 h-12 shadow-md hover:shadow-lg hover:-translate-y-0.5 transition-all">
                      <Mail className="w-4 h-4 mr-2" />
                      hello@podcap.io
                    </Button>
                  </a>
                  <a href="https://x.com/podcap_io" target="_blank" rel="noopener noreferrer" data-testid="button-cta-x">
                    <Button variant="outline" size="lg" className="rounded-xl font-display font-bold text-base px-8 h-12 hover:-translate-y-0.5 transition-all">
                      Message Us on X
                    </Button>
                  </a>
                </div>
              </div>
            </div>
          </div>
        </section>

      </main>

      <Footer />
    </>
  );
}
