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

export function ExampleRecapSection({ slug, podcastName, hideHeading }: { slug: string; podcastName: string; hideHeading?: boolean }) {
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
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.12 }}
      className="w-full max-w-4xl pb-20"
      id="recap-sample"
      data-testid="section-example-recap"
    >
      {!hideHeading && (
        <>
          <h2
            className="text-2xl sm:text-3xl font-display font-extrabold text-foreground text-center mb-3"
            data-testid="heading-example-recap"
          >
            Example {podcastName} Recap
          </h2>
          <p className="text-base text-muted-foreground text-center mb-8 max-w-xl mx-auto leading-relaxed">
            Here's what you'll receive in your inbox — a real PodCap summary.
          </p>
        </>
      )}

      <div className="bg-white border border-black/[0.06] rounded-2xl p-7 sm:p-10 lg:p-12 space-y-8" data-testid="card-example-recap">

        <div className="space-y-3">
          <h3
            className="text-xl sm:text-2xl font-display font-bold text-foreground leading-snug"
            data-testid="text-episode-title"
          >
            {recap.episodeTitle}
          </h3>
          <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
            {recap.episodeDate && (
              <span className="flex items-center gap-2" data-testid="text-episode-date">
                <Calendar className="w-4 h-4" />
                {recap.episodeDate}
              </span>
            )}
            {recap.episodeDuration && (
              <span className="flex items-center gap-2" data-testid="text-episode-duration">
                <Clock className="w-4 h-4" />
                {recap.episodeDuration}
              </span>
            )}
          </div>
        </div>

        <div className="bg-primary/[0.03] border border-primary/[0.08] rounded-xl p-6" data-testid="section-tldl">
          <div className="flex items-center gap-2.5 mb-3">
            <FileText className="w-4.5 h-4.5 text-primary" />
            <span className="text-sm font-display font-bold text-primary uppercase tracking-wider">TLDL</span>
          </div>
          <p className="text-base sm:text-[17px] text-foreground leading-relaxed">{recap.tldl}</p>
        </div>

        <div className="space-y-4" data-testid="section-what-happened">
          <h4 className="text-base font-display font-bold text-foreground">What Happened</h4>
          {recap.whatHappened.split(/\n\n+/).map((paragraph, i) => (
            <p key={i} className="text-base sm:text-[17px] text-muted-foreground leading-[1.8]">{paragraph}</p>
          ))}
        </div>

        {recap.keyInsights && recap.keyInsights.length > 0 && (
          <div className="space-y-4" data-testid="section-key-insights">
            <div className="flex items-center gap-2.5">
              <Lightbulb className="w-5 h-5 text-amber-500" />
              <h4 className="text-base font-display font-bold text-foreground">Key Insights</h4>
            </div>
            <ul className="space-y-4">
              {recap.keyInsights.map((insight, i) => (
                <li
                  key={i}
                  className="flex items-start gap-4 text-base sm:text-[17px] text-muted-foreground leading-[1.8]"
                  data-testid={`text-insight-${i}`}
                >
                  <span className="mt-[10px] w-2 h-2 rounded-full bg-primary shrink-0" />
                  {insight}
                </li>
              ))}
            </ul>
          </div>
        )}

        {recap.quote && recap.quoteAttribution && (
          <div
            className="border-l-[3px] border-primary/25 pl-6 py-2 space-y-2"
            data-testid="section-quote"
          >
            <p className="text-lg sm:text-xl text-foreground italic leading-relaxed">"{recap.quote}"</p>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Quote className="w-4 h-4" />
              {recap.quoteAttribution}
            </div>
          </div>
        )}
      </div>
    </motion.section>
  );
}
