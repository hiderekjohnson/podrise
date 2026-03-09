import { useLocation } from "wouter";
import { Headphones, Globe } from "lucide-react";
import { motion } from "framer-motion";
import { useAuth } from "@/hooks/use-auth";
import { Footer } from "@/components/Footer";
import { PODCAST_LANDINGS } from "@/data/podcastLandingData";
import logoPath from "@assets/Podcap_logo_1772731738179.png";

export default function Leaderboard() {
  const [, navigate] = useLocation();
  const { data: user } = useAuth();

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <header className="w-full px-6 py-5 flex items-center justify-between max-w-6xl mx-auto">
        <a href="/" className="flex items-center" data-testid="link-home">
          <img src={logoPath} alt="PodCap" className="h-9 object-contain" />
        </a>
        <div className="flex items-center gap-4">
          {user ? (
            <a
              href="/dashboard"
              className="text-base font-medium text-primary hover:text-primary/80 transition-colors"
              data-testid="link-dashboard"
            >
              Dashboard
            </a>
          ) : (
            <a
              href="/login"
              className="text-base font-medium text-muted-foreground hover:text-foreground transition-colors"
              data-testid="link-login"
            >
              Log in
            </a>
          )}
        </div>
      </header>

      <main className="flex-1 flex flex-col items-center px-4 sm:px-6 lg:px-8 pb-20">
        <section className="w-full max-w-4xl pt-10 sm:pt-16 pb-10">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="flex flex-col items-center text-center gap-5"
          >
            <h1
              className="text-3xl sm:text-4xl md:text-5xl font-display font-extrabold text-foreground leading-[1.1] tracking-[-0.02em]"
              data-testid="heading-leaderboard"
            >
              Browse All Podcasts
            </h1>
            <p className="text-base sm:text-lg text-muted-foreground max-w-xl leading-relaxed">
              Get free AI-powered daily recaps for {PODCAST_LANDINGS.length}+ top podcasts delivered to your inbox.
            </p>
          </motion.div>
        </section>

        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.15 }}
          className="w-full max-w-4xl"
        >
          <div className="bg-white border border-black/[0.06] rounded-2xl overflow-hidden shadow-sm">
            <div className="px-6 sm:px-8 py-5 border-b border-black/[0.06] flex items-center gap-3">
              <Globe className="w-5 h-5 text-primary" />
              <span className="text-base font-display font-bold text-foreground">All Podcasts</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-0 divide-y sm:divide-y-0 divide-black/[0.04]">
              {PODCAST_LANDINGS.map((podcast, index) => (
                <a
                  key={podcast.slug}
                  href={`/podcasts/${podcast.slug}`}
                  className="flex items-center gap-4 px-6 sm:px-7 py-5 transition-colors hover:bg-black/[0.015] group/row border-b border-black/[0.04] sm:border-r sm:last:border-r-0"
                  data-testid={`global-leader-row-${index}`}
                >
                  {podcast.artworkUrl ? (
                    <img
                      src={podcast.artworkUrl}
                      alt={podcast.name}
                      className="w-14 h-14 rounded-xl object-cover shrink-0 shadow-md shadow-black/[0.06]"
                      data-testid={`global-artwork-${index}`}
                    />
                  ) : (
                    <div className="w-14 h-14 rounded-xl bg-primary/[0.08] flex items-center justify-center shrink-0">
                      <Headphones className="w-6 h-6 text-primary/60" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-[15px] font-bold text-foreground truncate group-hover/row:text-primary transition-colors">
                      {podcast.name}
                    </p>
                    <p className="text-sm text-muted-foreground mt-0.5">
                      {podcast.category}
                    </p>
                  </div>
                </a>
              ))}
            </div>
          </div>
        </motion.div>
      </main>

      <Footer />
    </div>
  );
}
