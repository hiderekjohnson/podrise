import { useEffect } from "react";
import { Link } from "wouter";
import { Heart, Search, Users, TrendingUp, Headphones, ArrowRight, Mail, Mic, Globe, ChevronRight, BarChart3, UserCheck, Clock, Zap } from "lucide-react";
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
    icon: UserCheck,
    title: "Keep Your Superfans Close",
    description: "Even your biggest fans fall behind. Life gets busy, episodes stack up, and suddenly they haven't listened in weeks. A daily recap keeps them connected to your show, even on days they can't press play.",
    color: "text-blue-600 bg-blue-50",
  },
  {
    icon: TrendingUp,
    title: "Boost Listens and Completion",
    description: "When fans know what an episode is about before listening, they pick the episodes that are right for them. The right fans listening to the right episodes means higher completion rates and better engagement scores.",
    color: "text-emerald-600 bg-emerald-50",
  },
  {
    icon: BarChart3,
    title: "Better Algorithm Performance",
    description: "Podcast algorithms reward engagement. When your listeners are finishing episodes and coming back consistently, it signals quality. PodCap helps get your best fans to your best episodes, and that shows up in the numbers.",
    color: "text-amber-600 bg-amber-50",
  },
  {
    icon: Clock,
    title: "Prevent the Backlog Drop-Off",
    description: "Once someone falls a few weeks behind, they rarely come back. A daily recap prevents that from happening. Even if they can't listen today, they stay up to date and connected to your show.",
    color: "text-purple-600 bg-purple-50",
  },
];

export default function ForPodcasters() {
  useEffect(() => {
    document.title = "For Podcasters | How PodCap Helps Grow Podcast Discovery and Listeners";
    const metaDesc = document.querySelector('meta[name="description"]');
    const desc = "PodCap helps your superfans stay up to date with daily episode recaps. When fans know what each episode covers, they listen to the right ones, boosting engagement, completion rates, and algorithm performance.";
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
              Your best fans are falling behind. We help them keep up.
            </h1>
            <p className="text-lg sm:text-xl text-muted-foreground leading-relaxed max-w-2xl mx-auto" data-testid="text-hero-subtitle">
              Even your most dedicated listeners miss episodes. PodCap sends them a daily recap so they always know what's happening on your show, and they come back to listen to the episodes that matter most to them.
            </p>
          </div>
        </section>

        <section className="py-16 sm:py-20" data-testid="section-time-gap">
          <div className="max-w-3xl mx-auto px-6">
            <h2 className="text-2xl sm:text-3xl font-display font-bold tracking-[-0.02em] mb-3 text-center" data-testid="text-time-gap-title">
              Why listeners fall behind
            </h2>
            <p className="text-lg text-muted-foreground text-center max-w-2xl mx-auto mb-10">
              Even dedicated podcast fans simply do not have enough time to listen to every episode they subscribe to.
            </p>

            <div className="grid sm:grid-cols-3 gap-5 mb-12">
              <div className="bg-white border border-black/[0.06] rounded-2xl p-6 text-center" data-testid="stat-subscriptions">
                <p className="text-3xl sm:text-4xl font-display font-extrabold tracking-tight mb-2">6–8</p>
                <p className="text-sm font-display font-semibold mb-1">podcasts subscribed</p>
                <p className="text-[11px] text-muted-foreground/50 leading-snug">Edison Research – The Infinite Dial / Podcast Consumer reports</p>
              </div>
              <div className="bg-white border border-black/[0.06] rounded-2xl p-6 text-center" data-testid="stat-listening-time">
                <p className="text-3xl sm:text-4xl font-display font-extrabold tracking-tight mb-2">8 hrs</p>
                <p className="text-sm font-display font-semibold mb-1">weekly listening time</p>
                <p className="text-[11px] text-muted-foreground/50 leading-snug">Edison Research – Podcast Consumer</p>
              </div>
              <div className="bg-white border border-black/[0.06] rounded-2xl p-6 text-center" data-testid="stat-episode-length">
                <p className="text-3xl sm:text-4xl font-display font-extrabold tracking-tight mb-2">60–120</p>
                <p className="text-sm font-display font-semibold mb-1">minutes per episode</p>
                <p className="text-[11px] text-muted-foreground/50 leading-snug">Industry average across top podcasts</p>
              </div>
            </div>

            <div className="max-w-xl mx-auto">
              <h3 className="text-xl font-display font-bold mb-4">The math doesn't work</h3>
              <div className="text-[17px] leading-[1.8] text-muted-foreground space-y-4">
                <p>
                  If a listener follows 6–8 podcasts and each episode is 60–120 minutes long, that's 6–16 hours of listening every week.
                </p>
                <p>
                  But the average listener only has about 8 hours available.
                </p>
                <p>
                  Episodes pile up.<br />
                  Listeners fall behind.<br />
                  And once someone feels too far behind, they often stop listening entirely.
                </p>
                <p className="font-display font-bold text-foreground">
                  PodCap solves the backlog problem by keeping listeners up to date with short daily recaps, so they stay connected and jump into the episodes that matter most.
                </p>
              </div>
            </div>
          </div>
        </section>

        <section className="py-16 sm:py-20 bg-slate-50/50" data-testid="section-problem">
          <div className="max-w-3xl mx-auto px-6">
            <div className="bg-white border border-black/[0.06] rounded-2xl p-8 sm:p-10 md:p-12 shadow-sm" data-testid="card-problem">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 rounded-xl bg-primary/[0.07] flex items-center justify-center">
                  <Clock className="w-5 h-5 text-primary" />
                </div>
                <h2 className="text-xl sm:text-2xl font-display font-bold" data-testid="text-problem-title">The problem isn't your content. It's time.</h2>
              </div>
              <div className="space-y-5 text-[17px] leading-[1.8] text-muted-foreground">
                <p>
                  Running a great podcast is incredibly hard. Showing up consistently, preparing, researching, interviewing, editing, publishing, and keeping an audience engaged takes real skill and discipline. We genuinely admire podcasters. If we had the talent to run a great podcast ourselves, we'd probably be doing that instead of building another web tool.
                </p>
                <p>
                  Here's the thing: even your superfans struggle to keep up. They love your show, but they follow five or ten other podcasts too. Episodes pile up. They get behind. And once someone falls off for a few weeks, it's hard to come back. Not because they stopped caring, but because there's just too much to catch up on.
                </p>
                <p>
                  That's where PodCap comes in. We send your fans a short daily recap of what each new episode covers. They stay in the loop even on busy days. And when they see an episode that really speaks to them, they go listen. Not out of obligation, but because they know it's worth their time.
                </p>
              </div>
            </div>
          </div>
        </section>

        <section className="py-16 sm:py-20 bg-slate-50/50" data-testid="section-how-helps">
          <div className="max-w-4xl mx-auto px-6">
            <div className="text-center mb-14">
              <h2 className="text-2xl sm:text-3xl font-display font-bold tracking-[-0.02em] mb-4" data-testid="text-benefits-title">How this helps your podcast</h2>
              <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
                When your fans stay connected and listen to the right episodes, everybody wins.
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

        <section className="py-16 sm:py-20" data-testid="section-secondary-benefits">
          <div className="max-w-3xl mx-auto px-6">
            <h2 className="text-2xl sm:text-3xl font-display font-bold tracking-[-0.02em] mb-4 text-center" data-testid="text-secondary-title">
              And that's not all
            </h2>
            <p className="text-lg text-muted-foreground text-center max-w-2xl mx-auto mb-10">
              Beyond keeping fans engaged, PodCap handles things you probably don't have time for.
            </p>
            <div className="space-y-5">
              <div className="bg-white border border-black/[0.06] rounded-2xl p-7 shadow-sm flex gap-5 items-start" data-testid="card-secondary-search">
                <div className="w-11 h-11 rounded-xl bg-blue-50 flex items-center justify-center flex-shrink-0">
                  <Search className="w-5 h-5 text-blue-600" />
                </div>
                <div>
                  <h3 className="text-lg font-display font-bold mb-1">Your fans are already searching for recaps</h3>
                  <p className="text-[15px] leading-[1.7] text-muted-foreground">
                    A lot of your superfans are already Googling things like "podcast name recap" or "episode summary." They want a quick way to catch up. PodCap makes sure they land on a high-quality recap page for your show instead of some random AI-generated blog post.
                  </p>
                </div>
              </div>
              <div className="bg-white border border-black/[0.06] rounded-2xl p-7 shadow-sm flex gap-5 items-start" data-testid="card-secondary-summaries">
                <div className="w-11 h-11 rounded-xl bg-emerald-50 flex items-center justify-center flex-shrink-0">
                  <Mic className="w-5 h-5 text-emerald-600" />
                </div>
                <div>
                  <h3 className="text-lg font-display font-bold mb-1">Episode summaries, done for you</h3>
                  <p className="text-[15px] leading-[1.7] text-muted-foreground">
                    Writing up summaries for every episode takes time you don't have. PodCap creates detailed, accurate recaps of every episode automatically. You don't need to lift a finger. Just point your audience to your PodCap page and let us handle the rest.
                  </p>
                </div>
              </div>
              <div className="bg-white border border-black/[0.06] rounded-2xl p-7 shadow-sm flex gap-5 items-start" data-testid="card-secondary-seo">
                <div className="w-11 h-11 rounded-xl bg-purple-50 flex items-center justify-center flex-shrink-0">
                  <Globe className="w-5 h-5 text-purple-600" />
                </div>
                <div>
                  <h3 className="text-lg font-display font-bold mb-1">Free discoverability you're not getting today</h3>
                  <p className="text-[15px] leading-[1.7] text-muted-foreground">
                    Every episode recap is a new indexed page on Google. That's a new entry point for someone who's never heard of your show but is searching for a topic you've covered. It's organic discovery that works 24/7, and you don't have to do a thing.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="py-16 sm:py-20 bg-slate-50/50" data-testid="section-the-logic">
          <div className="max-w-3xl mx-auto px-6">
            <h2 className="text-2xl sm:text-3xl font-display font-bold tracking-[-0.02em] mb-4 text-center" data-testid="text-logic-title">
              The right fans, listening to the right episodes
            </h2>
            <p className="text-lg text-muted-foreground text-center max-w-2xl mx-auto mb-10">
              Here's how recaps change the dynamic between your show and your audience.
            </p>
            <div className="space-y-6">
              {[
                { num: "1", text: "Your fans subscribe to your podcast on PodCap and get a short daily recap in their inbox every morning." },
                { num: "2", text: "On busy days, the recap keeps them connected. They know what you talked about, even if they can't listen right away." },
                { num: "3", text: "When an episode really resonates, they go listen. They already know it's for them, so they're more likely to finish it." },
                { num: "4", text: "Higher completion rates and consistent engagement send strong signals to podcast algorithms. Your show gets rewarded." },
                { num: "5", text: "Instead of losing fans to the backlog, you keep them in your orbit. They stay subscribed, stay engaged, and stay loyal." },
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

        <section className="py-16 sm:py-20 bg-slate-50/50" data-testid="section-engagement">
          <div className="max-w-3xl mx-auto px-6">
            <div className="bg-white border border-black/[0.06] rounded-2xl p-8 sm:p-10 md:p-12 shadow-sm" data-testid="card-engagement">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 rounded-xl bg-amber-50 flex items-center justify-center">
                  <Zap className="w-5 h-5 text-amber-600" />
                </div>
                <h2 className="text-xl sm:text-2xl font-display font-bold" data-testid="text-engagement-title">Why engagement scores matter</h2>
              </div>
              <div className="space-y-5 text-[17px] leading-[1.8] text-muted-foreground">
                <p>
                  Podcast platforms use engagement signals to decide which shows to recommend. Completion rate, listen frequency, and subscriber retention all factor in. When listeners skip through episodes or abandon them halfway, it hurts your show's visibility.
                </p>
                <p>
                  PodCap helps by making sure your fans listen to the episodes that are actually right for them. Instead of pressing play on something they're not sure about and bailing 10 minutes in, they read a quick recap first and only listen when they know it's a good fit. That means more completed episodes, better engagement metrics, and a stronger signal to the algorithm that your podcast is worth recommending.
                </p>
              </div>
            </div>
          </div>
        </section>

        <section className="py-16 sm:py-20" data-testid="section-podcast-pages">
          <div className="max-w-4xl mx-auto px-6">
            <div className="text-center mb-12">
              <h2 className="text-2xl sm:text-3xl font-display font-bold tracking-[-0.02em] mb-4" data-testid="text-pages-title">
                Custom pages for top podcasts
              </h2>
              <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
                For many major podcasts, we've created dedicated PodCap pages. These pages give a show's fans a place to sign up for recaps and create searchable hubs where people can discover episode summaries and learn about your show.
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

        <section className="py-16 sm:py-20 bg-slate-50/50" data-testid="section-collaboration">
          <div className="max-w-3xl mx-auto px-6">
            <div className="bg-white border border-black/[0.06] rounded-2xl p-8 sm:p-10 md:p-12 shadow-sm" data-testid="card-collaboration">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center">
                  <Headphones className="w-5 h-5 text-emerald-600" />
                </div>
                <h2 className="text-xl sm:text-2xl font-display font-bold" data-testid="text-collaboration-title">We want to build this with you</h2>
              </div>
              <div className="space-y-5 text-[17px] leading-[1.8] text-muted-foreground">
                <p>
                  If there's anything we can build to help you keep your fans engaged, drive more listens, improve your discoverability, or better support you as a creator, we want to hear about it. This isn't lip service. We're a small team, and your feedback directly shapes what we build next.
                </p>
                <p>
                  Whether you want to claim your podcast's page, suggest a feature, or just tell us what would make PodCap more useful for your show, reach out. We'd love to work with you.
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
                  Let's keep your fans listening
                </h2>
                <p className="text-lg text-muted-foreground mb-8 max-w-xl mx-auto">
                  We're podcast fans first and builders second. If you run a podcast and want to explore how PodCap can help your audience stay engaged, reach out. We'd love to talk.
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
