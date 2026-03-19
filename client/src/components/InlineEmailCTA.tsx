import { ArrowRight, Zap } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";

interface InlineEmailCTAProps {
  type: "industry" | "interest" | "role" | "podcast";
  slug: string;
  name: string;
  artworkUrl?: string;
  hosts?: string;
  variant?: "card" | "gradient" | "minimal";
  className?: string;
}

export function InlineEmailCTA({ type, slug, name, artworkUrl, hosts, variant = "card", className = "" }: InlineEmailCTAProps) {
  const { data: user } = useAuth();

  if (user) return null;

  const isPodcast = type === "podcast";
  const label = isPodcast ? "recap" : "briefing";

  const hostList = hosts?.split(/,\s*|&\s*|\sand\s/i).map(h => h.trim()).filter(Boolean) || [];
  const hostDisplay = hostList.length > 2
    ? `${hostList.slice(0, 2).join(", ")} & more`
    : hostList.length > 0 ? hostList.join(" & ") : "";

  if (variant === "gradient") {
    return (
      <div className={`rounded-2xl overflow-hidden ${className}`} data-testid="inline-email-cta">
        <div className="relative bg-gradient-to-r from-primary/[0.08] via-primary/[0.04] to-transparent border border-primary/[0.12] p-6 sm:p-8">
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-5">
            {artworkUrl && isPodcast && (
              <img src={artworkUrl} alt={name} className="w-16 h-16 rounded-xl shadow-lg ring-1 ring-black/[0.06] shrink-0" />
            )}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <Zap className="w-3.5 h-3.5 text-primary" />
                <span className="text-[12px] font-bold uppercase tracking-[0.15em] text-primary">
                  {isPodcast ? "Never miss an episode" : `${name} Intelligence`}
                </span>
              </div>
              <h3 className="text-lg font-display font-bold text-foreground leading-snug">
                {isPodcast
                  ? hostDisplay
                    ? `Get every ${name} recap — ${hostDisplay}'s key insights, delivered free`
                    : `Get free ${name} recaps in your inbox`
                  : `Get the daily ${name.toLowerCase()} ${label}`}
              </h3>
              {isPodcast && (
                <p className="text-[14px] text-muted-foreground mt-1">
                  A 5-minute recap every time a new episode drops.
                </p>
              )}
            </div>
          </div>
          <div className="mt-4">
            <a
              href="https://podrise.com/register"
              className="inline-flex items-center gap-1.5 px-5 py-3 bg-primary text-primary-foreground font-bold text-[14px] rounded-xl hover:bg-primary/90 transition-colors whitespace-nowrap"
              data-testid="button-inline-cta-register"
            >
              Subscribe free <ArrowRight className="w-3.5 h-3.5" />
            </a>
          </div>
        </div>
      </div>
    );
  }

  if (variant === "minimal") {
    return (
      <div className={`rounded-xl border border-black/[0.06] dark:border-white/[0.08] bg-card p-3 sm:p-4 ${className}`} data-testid="inline-email-cta-minimal">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <Zap className="w-4 h-4 text-primary shrink-0" />
            <span className="text-[14px] font-medium text-foreground whitespace-nowrap">
              {isPodcast
                ? `Get ${name} recaps free`
                : `Get the weekly ${name.toLowerCase()} ${label}`}
            </span>
          </div>
          <a
            href="https://podrise.com/register"
            className="h-9 px-4 bg-primary text-primary-foreground font-semibold text-[13px] rounded-lg hover:bg-primary/90 transition-colors whitespace-nowrap inline-flex items-center justify-center"
            data-testid="button-inline-cta-register-minimal"
          >
            Sign Up Free
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className={`rounded-2xl border border-black/[0.06] dark:border-white/[0.08] bg-white dark:bg-white/[0.03] overflow-hidden ${className}`} data-testid="inline-email-cta-card">
      <div className="p-6 sm:p-8">
        <div className="flex items-start gap-5">
          {artworkUrl && isPodcast && (
            <div className="relative shrink-0 hidden sm:block">
              <div className="absolute -inset-2 bg-primary/[0.04] rounded-xl blur-lg" />
              <img src={artworkUrl} alt={name} className="relative w-20 h-20 rounded-xl shadow-xl ring-1 ring-black/[0.06]" />
            </div>
          )}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-2">
              <Zap className="w-3.5 h-3.5 text-primary" />
              <span className="text-[12px] font-bold uppercase tracking-[0.15em] text-primary">
                {isPodcast ? "Free recaps" : "Daily briefing"}
              </span>
            </div>
            <h3 className="text-lg sm:text-xl font-display font-bold text-foreground leading-snug mb-1.5">
              {isPodcast
                ? hostDisplay
                  ? `${hostDisplay}'s best insights — in your inbox`
                  : `Get ${name} recaps delivered free`
                : `The ${name.toLowerCase()} ${label} you'll actually read`}
            </h3>
            <p className="text-[14px] text-muted-foreground leading-relaxed">
              {isPodcast
                ? `Every time ${name} drops a new episode, we'll send you the key takeaways in 5 minutes.`
                : `We synthesize insights about ${name.toLowerCase()} from top podcasts into one daily briefing.`}
            </p>
          </div>
        </div>
        <div className="mt-5">
          <a
            href="https://podrise.com/register"
            className="inline-flex items-center gap-1.5 px-6 py-3 bg-primary text-primary-foreground font-bold text-[15px] rounded-xl hover:bg-primary/90 transition-colors whitespace-nowrap"
            data-testid="button-inline-cta-register-card"
          >
            Subscribe free <ArrowRight className="w-3.5 h-3.5" />
          </a>
        </div>
        <p className="text-[12px] text-muted-foreground/40 mt-2.5">
          No spam. Unsubscribe anytime.
        </p>
      </div>
    </div>
  );
}
