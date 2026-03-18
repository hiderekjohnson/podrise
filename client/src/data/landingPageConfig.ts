export interface LandingPageConfig {
  slug: string;
  name: string;
  headline: string;
  subheadline: string;
  ctaText: string;
  heroAccent: string;
  heroGradientFrom: string;
  heroGradientTo: string;
  features: { icon: string; title: string; description: string }[];
  socialProof: string;
  targetAudience: string;
}

export const LANDING_PAGES: LandingPageConfig[] = [
  {
    slug: "time-saver",
    name: "Time Saver",
    headline: "Stop spending hours listening — get the key takeaways in 5 minutes",
    subheadline: "PodRise distills the best podcast episodes into quick, actionable summaries so you stay informed without the time commitment.",
    ctaText: "Start saving time — it's free",
    heroAccent: "#6366F1",
    heroGradientFrom: "#6366F1",
    heroGradientTo: "#818CF8",
    targetAudience: "Busy professionals",
    socialProof: "Join thousands of professionals who save 5+ hours every week",
    features: [
      { icon: "clock", title: "5-Minute Briefings", description: "Get the essential insights from hour-long episodes in a quick daily digest you can read over coffee." },
      { icon: "zap", title: "Key Takeaways Only", description: "No fluff, no filler. We extract the actionable insights, data points, and quotes that matter." },
      { icon: "mail", title: "Daily Email Delivery", description: "Summaries land in your inbox at the time you choose — start your day already informed." },
    ],
  },
  {
    slug: "podcast-junkie",
    name: "Podcast Junkie",
    headline: "Never miss a moment from your favorite shows",
    subheadline: "Follow hundreds of top podcasts and get every episode summarized — so you never fall behind on the conversations that matter.",
    ctaText: "Never miss an episode — join free",
    heroAccent: "#EC4899",
    heroGradientFrom: "#EC4899",
    heroGradientTo: "#F472B6",
    targetAudience: "Avid podcast listeners",
    socialProof: "Covering 500+ of the most popular podcasts across every category",
    features: [
      { icon: "headphones", title: "500+ Shows Covered", description: "From true crime to tech, business to comedy — we cover the shows you love and help you discover new ones." },
      { icon: "sparkles", title: "AI-Powered Recaps", description: "Every episode gets a comprehensive summary with key moments, quotes, and discussion points highlighted." },
      { icon: "search", title: "Discover & Explore", description: "Browse by topic, industry, or trend. Find exactly what podcast conversations are saying about any subject." },
    ],
  },
  {
    slug: "business-edge",
    name: "Business Edge",
    headline: "The intelligence your competitors are getting from podcasts",
    subheadline: "Founders and executives use PodRise to track industry trends, competitive moves, and expert opinions across hundreds of business podcasts.",
    ctaText: "Get your edge — start free",
    heroAccent: "#10B981",
    heroGradientFrom: "#10B981",
    heroGradientTo: "#34D399",
    targetAudience: "Founders & executives",
    socialProof: "Trusted by founders and executives at fast-growing companies",
    features: [
      { icon: "trending-up", title: "Trend Intelligence", description: "Track emerging trends, market shifts, and industry signals mentioned across top business podcasts." },
      { icon: "target", title: "Competitive Insights", description: "Know what thought leaders and competitors are discussing before your next strategy meeting." },
      { icon: "briefcase", title: "Actionable Takeaways", description: "Every summary focuses on insights you can act on — strategies, frameworks, and real-world tactics." },
    ],
  },
  {
    slug: "newsletter-1",
    name: "Newsletter Signup",
    headline: "Keep up with your favorite conversations — without pressing play",
    subheadline: "Get free daily AI recaps of the podcasts you love, delivered straight to your inbox.",
    ctaText: "Get your free daily recap",
    heroAccent: "#6366F1",
    heroGradientFrom: "#6366F1",
    heroGradientTo: "#8B5CF6",
    targetAudience: "Newsletter subscribers",
    socialProof: "Free forever. No credit card required.",
    features: [
      { icon: "mail", title: "Daily Email Recaps", description: "AI-powered summaries of every new episode from the shows you follow, delivered to your inbox." },
      { icon: "headphones", title: "Pick Your Podcasts", description: "Choose from hundreds of top shows — we recap every new episode so you never miss a beat." },
      { icon: "zap", title: "5-Minute Read", description: "Key takeaways, quotes, and insights distilled into a quick daily briefing you can read over coffee." },
    ],
  },
];

export function getLandingPageBySlug(slug: string): LandingPageConfig | undefined {
  return LANDING_PAGES.find(p => p.slug === slug);
}
