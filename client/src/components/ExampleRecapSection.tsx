import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Calendar, Clock, Lightbulb, Quote, FileText } from "lucide-react";

interface ExampleRecap {
  id: number;
  slug: string;
  podcastName: string;
  itunesId: string;
  episodeTitle: string;
  episodeDate: string;
  episodeDuration: string | null;
  tldl: string;
  whatHappened: string;
  keyInsights: string[];
  quote: string | null;
  quoteAttribution: string | null;
  updatedAt: string;
}

export function ExampleRecapSection({ slug, podcastName }: { slug: string; podcastName: string }) {
  const { data: recap } = useQuery<ExampleRecap>({
    queryKey: ["/api/podcasts", slug, "example-recap"],
    queryFn: async () => {
      const res = await fetch(`/api/podcasts/${slug}/example-recap`);
      if (!res.ok) return null;
      return res.json();
    },
    staleTime: 1000 * 60 * 60,
    retry: false,
  });

  if (!recap) return null;

  return (
    <motion.section
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.35 }}
      className="w-full max-w-4xl pb-16"
      data-testid="section-example-recap"
    >
      <h2
        className="text-2xl sm:text-3xl font-display font-extrabold text-foreground text-center mb-3"
        data-testid="heading-example-recap"
      >
        Example {podcastName} Episode Summary
      </h2>
      <p className="text-sm text-muted-foreground text-center mb-8 max-w-2xl mx-auto">
        Here's a real example of a PodCap daily recap for {podcastName}. This is what you'll receive in your inbox.
      </p>

      <div className="glass-panel rounded-2xl p-6 sm:p-8 space-y-6" data-testid="card-example-recap">
        <div className="space-y-2">
          <h3
            className="text-lg sm:text-xl font-display font-bold text-foreground"
            data-testid="text-episode-title"
          >
            {recap.episodeTitle}
          </h3>
          <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
            {recap.episodeDate && (
              <span className="flex items-center gap-1.5" data-testid="text-episode-date">
                <Calendar className="w-3.5 h-3.5" />
                {recap.episodeDate}
              </span>
            )}
            {recap.episodeDuration && (
              <span className="flex items-center gap-1.5" data-testid="text-episode-duration">
                <Clock className="w-3.5 h-3.5" />
                {recap.episodeDuration}
              </span>
            )}
          </div>
        </div>

        <div className="space-y-1.5" data-testid="section-tldl">
          <div className="flex items-center gap-2">
            <FileText className="w-4 h-4 text-primary" />
            <span className="text-xs font-display font-bold text-primary uppercase tracking-wider">TLDL</span>
          </div>
          <p className="text-sm text-foreground leading-relaxed">{recap.tldl}</p>
        </div>

        <div className="space-y-2" data-testid="section-what-happened">
          <h4 className="text-sm font-display font-bold text-foreground">What Happened</h4>
          {recap.whatHappened.split(/\n\n+/).map((paragraph, i) => (
            <p key={i} className="text-sm text-muted-foreground leading-relaxed">{paragraph}</p>
          ))}
        </div>

        {recap.keyInsights && recap.keyInsights.length > 0 && (
          <div className="space-y-3" data-testid="section-key-insights">
            <div className="flex items-center gap-2">
              <Lightbulb className="w-4 h-4 text-amber-500" />
              <h4 className="text-sm font-display font-bold text-foreground">Key Insights</h4>
            </div>
            <ul className="space-y-2">
              {recap.keyInsights.map((insight, i) => (
                <li
                  key={i}
                  className="flex items-start gap-2.5 text-sm text-muted-foreground leading-relaxed"
                  data-testid={`text-insight-${i}`}
                >
                  <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-primary/40 shrink-0" />
                  {insight}
                </li>
              ))}
            </ul>
          </div>
        )}

        {recap.quote && recap.quoteAttribution && (
          <div
            className="border-l-2 border-primary/30 pl-4 py-1 space-y-1"
            data-testid="section-quote"
          >
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Quote className="w-3.5 h-3.5" />
              {recap.quoteAttribution}
            </div>
            <p className="text-sm text-foreground italic leading-relaxed">"{recap.quote}"</p>
          </div>
        )}
      </div>
    </motion.section>
  );
}
