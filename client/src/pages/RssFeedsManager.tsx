import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Plus, Trash2, Copy, Check, Rss, ExternalLink, X, ChevronDown, ChevronUp } from "lucide-react";

interface RssFeed {
  id: number;
  name: string;
  slugKey: string;
  podcastSlugs: string[];
  createdAt: string;
}

const DOMAIN = "https://podcap.io";

const AVAILABLE_PODCASTS: { slug: string; name: string }[] = [
  { slug: "myfirstmillion", name: "My First Million" },
  { slug: "acquired", name: "Acquired" },
  { slug: "allin", name: "All-In Podcast" },
  { slug: "lexfridman", name: "Lex Fridman Podcast" },
  { slug: "hubermanlab", name: "Huberman Lab" },
  { slug: "timferriss", name: "Tim Ferriss Show" },
  { slug: "joerogan", name: "Joe Rogan Experience" },
  { slug: "diaryofaceo", name: "Diary of a CEO" },
  { slug: "pivot", name: "Pivot" },
  { slug: "smartless", name: "SmartLess" },
  { slug: "hardfork", name: "Hard Fork" },
  { slug: "callherdaddy", name: "Call Her Daddy" },
  { slug: "newheights", name: "New Heights" },
  { slug: "thedaily", name: "The Daily" },
  { slug: "waveform", name: "Waveform" },
  { slug: "thevergecast", name: "The Vergecast" },
  { slug: "searchengine", name: "Search Engine" },
  { slug: "a16z", name: "a16z Podcast" },
  { slug: "bg2pod", name: "BG2Pod" },
  { slug: "decoder", name: "Decoder" },
  { slug: "aidailybrief", name: "AI Daily Brief" },
  { slug: "planetmoney", name: "Planet Money" },
  { slug: "thejournal", name: "The Journal" },
  { slug: "howibuiltthis", name: "How I Built This" },
  { slug: "ramseyshow", name: "The Ramsey Show" },
  { slug: "hbrideacast", name: "HBR IdeaCast" },
  { slug: "financialaudit", name: "Financial Audit" },
  { slug: "founders", name: "Founders" },
  { slug: "businessbreakdowns", name: "Business Breakdowns" },
  { slug: "mastersofscale", name: "Masters of Scale" },
  { slug: "biggerpockets", name: "BiggerPockets" },
  { slug: "theindicator", name: "The Indicator" },
  { slug: "mastersinbusiness", name: "Masters in Business" },
  { slug: "themoneyguyshow", name: "The Money Guy Show" },
  { slug: "equity", name: "Equity" },
  { slug: "onpurpose", name: "On Purpose" },
  { slug: "melrobbins", name: "Mel Robbins Podcast" },
  { slug: "armchairexpert", name: "Armchair Expert" },
  { slug: "conanobrien", name: "Conan O'Brien" },
  { slug: "meidastouch", name: "MeidasTouch" },
  { slug: "shawnryanshow", name: "Shawn Ryan Show" },
  { slug: "thisamericanlife", name: "This American Life" },
  { slug: "freshair", name: "Fresh Air" },
  { slug: "podsaveamerica", name: "Pod Save America" },
  { slug: "hiddenbrain", name: "Hidden Brain" },
  { slug: "tedtalksdaily", name: "TED Talks Daily" },
  { slug: "officeladies", name: "Office Ladies" },
  { slug: "moderncto", name: "Modern CTO" },
  { slug: "stuffyoushouldknow", name: "Stuff You Should Know" },
  { slug: "empowerher", name: "EmpowerHer" },
  { slug: "acquiringminds", name: "Acquiring Minds" },
  { slug: "allthehacks", name: "All the Hacks" },
  { slug: "dwarkesh", name: "Dwarkesh Podcast" },
  { slug: "icedcoffeehour", name: "Iced Coffee Hour" },
  { slug: "moneywise", name: "Moneywise" },
  { slug: "navigatingwealth", name: "Navigating Wealth" },
  { slug: "profgmarkets", name: "Prof G Markets" },
  { slug: "profgpod", name: "Prof G Pod" },
  { slug: "saascfo", name: "SaaS CFO" },
  { slug: "saaspodcast", name: "SaaS Podcast" },
  { slug: "saastr", name: "SaaStr" },
  { slug: "wealthyway", name: "Wealthy Way" },
  { slug: "valuetainment", name: "Valuetainment" },
  { slug: "ultimatehuman", name: "Ultimate Human" },
  { slug: "bigdeal", name: "BigDeal" },
  { slug: "joelonsdale", name: "Joe Lonsdale" },
  { slug: "alexhormozi", name: "Alex Hormozi" },
  { slug: "driverlessdigest", name: "Driverless Digest" },
  { slug: "moonshots", name: "Moonshots" },
  { slug: "modernwisdom", name: "Modern Wisdom" },
  { slug: "thisweekinstartups", name: "This Week in Startups" },
  { slug: "garyvee", name: "GaryVee" },
  { slug: "freakonomics", name: "Freakonomics Radio" },
  { slug: "peterattia", name: "The Peter Attia Drive" },
  { slug: "knowledgeproject", name: "The Knowledge Project" },
  { slug: "investlikethebest", name: "Invest Like the Best" },
  { slug: "twentyminutevc", name: "The Twenty Minute VC" },
  { slug: "westudybillionaires", name: "We Study Billionaires" },
  { slug: "oddlots", name: "Odd Lots" },
  { slug: "ezraklein", name: "The Ezra Klein Show" },
  { slug: "capitalallocators", name: "Capital Allocators" },
  { slug: "jordanharbinger", name: "The Jordan Harbinger Show" },
  { slug: "radiolab", name: "Radiolab" },
  { slug: "darknetdiaries", name: "Darknet Diaries" },
  { slug: "bigtechnology", name: "Big Technology Podcast" },
  { slug: "conversationswithtyler", name: "Conversations with Tyler" },
  { slug: "ologies", name: "Ologies with Alie Ward" },
].sort((a, b) => a.name.localeCompare(b.name));

export default function RssFeedsManager() {
  const { toast } = useToast();
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [newSlugKey, setNewSlugKey] = useState("");
  const [selectedSlugs, setSelectedSlugs] = useState<string[]>([]);
  const [copiedUrl, setCopiedUrl] = useState<string | null>(null);
  const [expandedFeed, setExpandedFeed] = useState<number | null>(null);
  const [editingSlugs, setEditingSlugs] = useState<{ [feedId: number]: string[] }>({});
  const [podcastSearch, setPodcastSearch] = useState("");

  const { data: feeds, isLoading } = useQuery<RssFeed[]>({
    queryKey: ["/api/admin/rss-feeds"],
  });

  const createMutation = useMutation({
    mutationFn: (data: { name: string; slugKey: string; podcastSlugs: string[] }) =>
      apiRequest("POST", "/api/admin/rss-feeds", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/rss-feeds"] });
      setShowCreate(false);
      setNewName("");
      setNewSlugKey("");
      setSelectedSlugs([]);
      toast({ title: "Feed created", description: "Your custom RSS feed is live." });
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message || "Failed to create feed", variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, podcastSlugs }: { id: number; podcastSlugs: string[] }) =>
      apiRequest("PATCH", `/api/admin/rss-feeds/${id}`, { podcastSlugs }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/rss-feeds"] });
      setEditingSlugs({});
      toast({ title: "Feed updated", description: "Podcast selection saved." });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to update feed", variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/admin/rss-feeds/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/rss-feeds"] });
      toast({ title: "Feed deleted" });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to delete feed", variant: "destructive" });
    },
  });

  const copyUrl = (url: string) => {
    navigator.clipboard.writeText(url);
    setCopiedUrl(url);
    setTimeout(() => setCopiedUrl(null), 2000);
  };

  const autoSlugKey = (name: string) => {
    return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  };

  const handleNameChange = (val: string) => {
    setNewName(val);
    if (!newSlugKey || newSlugKey === autoSlugKey(newName)) {
      setNewSlugKey(autoSlugKey(val));
    }
  };

  const toggleSlug = (slug: string, list: string[], setter: (s: string[]) => void) => {
    if (list.includes(slug)) {
      setter(list.filter((s) => s !== slug));
    } else {
      setter([...list, slug]);
    }
  };

  const getPodcastName = (slug: string) => {
    return AVAILABLE_PODCASTS.find((p) => p.slug === slug)?.name || slug;
  };

  const filteredPodcasts = AVAILABLE_PODCASTS.filter((p) =>
    p.name.toLowerCase().includes(podcastSearch.toLowerCase()) ||
    p.slug.toLowerCase().includes(podcastSearch.toLowerCase())
  );

  const allFeedUrl = `${DOMAIN}/rss/all`;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="glass-panel rounded-2xl p-6">
        <div className="flex items-center gap-3 mb-1">
          <Rss className="w-5 h-5 text-primary" />
          <h3 className="font-display font-bold text-lg">All Recaps Feed</h3>
        </div>
        <p className="text-sm text-muted-foreground mb-4">
          This feed includes every recap from all podcasts. Your bot can poll this to pick up new recaps automatically.
        </p>
        <div className="flex items-center gap-2 bg-black/[0.03] rounded-xl px-4 py-3 border border-black/[0.06]">
          <code className="text-sm font-mono flex-1 truncate" data-testid="text-rss-all-url">{allFeedUrl}</code>
          <button
            data-testid="button-copy-rss-all"
            onClick={() => copyUrl(allFeedUrl)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary/10 text-primary text-xs font-bold hover:bg-primary/20 transition-colors shrink-0"
          >
            {copiedUrl === allFeedUrl ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
            {copiedUrl === allFeedUrl ? "Copied" : "Copy"}
          </button>
          <a
            href="/rss/all"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-black/[0.05] text-foreground text-xs font-bold hover:bg-black/[0.08] transition-colors shrink-0"
            data-testid="link-rss-all-preview"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            Preview
          </a>
        </div>
      </div>

      <div className="glass-panel rounded-2xl p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <Rss className="w-5 h-5 text-orange-500" />
              <h3 className="font-display font-bold text-lg">Custom Feeds</h3>
            </div>
            <p className="text-sm text-muted-foreground">
              Create custom feeds for specific podcast selections. Each feed gets its own URL you can give to your bot.
            </p>
          </div>
          {!showCreate && (
            <button
              data-testid="button-create-feed"
              onClick={() => setShowCreate(true)}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-bold shadow-lg shadow-primary/20 hover:shadow-xl hover:shadow-primary/30 transition-all active:scale-[0.99] shrink-0"
            >
              <Plus className="w-4 h-4" />
              New Feed
            </button>
          )}
        </div>

        {showCreate && (
          <div className="border border-primary/20 bg-primary/[0.02] rounded-xl p-5 mb-5" data-testid="form-create-feed">
            <div className="flex items-center justify-between mb-4">
              <h4 className="font-display font-bold text-sm">Create New Feed</h4>
              <button onClick={() => { setShowCreate(false); setSelectedSlugs([]); setNewName(""); setNewSlugKey(""); }} className="text-muted-foreground hover:text-foreground">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-4 mb-4">
              <div>
                <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Feed Name</label>
                <input
                  data-testid="input-feed-name"
                  type="text"
                  value={newName}
                  onChange={(e) => handleNameChange(e.target.value)}
                  placeholder="e.g. Business & Finance"
                  className="w-full h-10 px-3 bg-white border border-black/[0.08] rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/30 transition-all"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">URL Slug</label>
                <div className="flex items-center gap-0">
                  <span className="text-xs text-muted-foreground font-mono bg-black/[0.03] border border-r-0 border-black/[0.08] rounded-l-xl px-3 h-10 flex items-center">/rss/feed/</span>
                  <input
                    data-testid="input-feed-slug"
                    type="text"
                    value={newSlugKey}
                    onChange={(e) => setNewSlugKey(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))}
                    placeholder="business-finance"
                    className="flex-1 h-10 px-3 bg-white border border-black/[0.08] rounded-r-xl text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/30 transition-all"
                  />
                </div>
              </div>
            </div>
            <div className="mb-4">
              <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                Select Podcasts ({selectedSlugs.length} selected)
              </label>
              <input
                data-testid="input-podcast-search"
                type="text"
                value={podcastSearch}
                onChange={(e) => setPodcastSearch(e.target.value)}
                placeholder="Search podcasts..."
                className="w-full h-9 px-3 mb-2 bg-white border border-black/[0.08] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all"
              />
              <div className="max-h-48 overflow-y-auto border border-black/[0.06] rounded-xl bg-white p-2 grid grid-cols-2 gap-1">
                {filteredPodcasts.map((p) => (
                  <label
                    key={p.slug}
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-lg cursor-pointer text-sm transition-colors ${
                      selectedSlugs.includes(p.slug)
                        ? "bg-primary/10 text-primary font-semibold"
                        : "hover:bg-black/[0.03] text-foreground"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={selectedSlugs.includes(p.slug)}
                      onChange={() => toggleSlug(p.slug, selectedSlugs, setSelectedSlugs)}
                      className="accent-primary"
                      data-testid={`checkbox-podcast-${p.slug}`}
                    />
                    {p.name}
                  </label>
                ))}
              </div>
            </div>
            <button
              data-testid="button-save-feed"
              onClick={() => createMutation.mutate({ name: newName, slugKey: newSlugKey, podcastSlugs: selectedSlugs })}
              disabled={!newName.trim() || !newSlugKey.trim() || selectedSlugs.length === 0 || createMutation.isPending}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-bold shadow-lg shadow-primary/20 hover:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            >
              {createMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
              Create Feed
            </button>
          </div>
        )}

        {(!feeds || feeds.length === 0) && !showCreate && (
          <div className="text-center py-10 text-muted-foreground text-sm">
            No custom feeds yet. Create one to get started.
          </div>
        )}

        {feeds && feeds.length > 0 && (
          <div className="space-y-3">
            {feeds.map((feed) => {
              const feedUrl = `${DOMAIN}/rss/feed/${feed.slugKey}`;
              const isExpanded = expandedFeed === feed.id;
              const isEditing = editingSlugs[feed.id] !== undefined;
              const currentEditSlugs = editingSlugs[feed.id] || feed.podcastSlugs;

              return (
                <div key={feed.id} className="border border-black/[0.06] rounded-xl overflow-hidden" data-testid={`feed-card-${feed.id}`}>
                  <div className="flex items-center gap-3 px-4 py-3 bg-black/[0.01]">
                    <Rss className="w-4 h-4 text-orange-500 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="font-display font-bold text-sm" data-testid={`text-feed-name-${feed.id}`}>{feed.name}</div>
                      <div className="text-xs text-muted-foreground font-mono truncate">{feedUrl}</div>
                    </div>
                    <span className="px-2 py-0.5 bg-orange-100 text-orange-700 text-xs font-bold rounded-md shrink-0">
                      {feed.podcastSlugs.length} podcast{feed.podcastSlugs.length !== 1 ? "s" : ""}
                    </span>
                    <button
                      data-testid={`button-copy-feed-${feed.id}`}
                      onClick={() => copyUrl(feedUrl)}
                      className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-primary/10 text-primary text-xs font-bold hover:bg-primary/20 transition-colors shrink-0"
                    >
                      {copiedUrl === feedUrl ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                      {copiedUrl === feedUrl ? "Copied" : "Copy URL"}
                    </button>
                    <a
                      href={`/rss/feed/${feed.slugKey}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-black/[0.05] text-foreground text-xs font-bold hover:bg-black/[0.08] transition-colors shrink-0"
                      data-testid={`link-feed-preview-${feed.id}`}
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                    <button
                      data-testid={`button-expand-feed-${feed.id}`}
                      onClick={() => {
                        setExpandedFeed(isExpanded ? null : feed.id);
                        if (!isExpanded && !isEditing) {
                          setEditingSlugs({ ...editingSlugs, [feed.id]: [...feed.podcastSlugs] });
                        }
                      }}
                      className="text-muted-foreground hover:text-foreground transition-colors shrink-0"
                    >
                      {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    </button>
                    <button
                      data-testid={`button-delete-feed-${feed.id}`}
                      onClick={() => {
                        if (confirm(`Delete feed "${feed.name}"?`)) {
                          deleteMutation.mutate(feed.id);
                        }
                      }}
                      className="text-red-400 hover:text-red-600 transition-colors shrink-0"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>

                  {isExpanded && (
                    <div className="px-4 py-4 border-t border-black/[0.06] bg-white">
                      <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                        Podcasts in this feed ({currentEditSlugs.length} selected)
                      </label>
                      <div className="max-h-48 overflow-y-auto border border-black/[0.06] rounded-xl bg-black/[0.01] p-2 grid grid-cols-2 gap-1 mb-3">
                        {AVAILABLE_PODCASTS.map((p) => (
                          <label
                            key={p.slug}
                            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg cursor-pointer text-sm transition-colors ${
                              currentEditSlugs.includes(p.slug)
                                ? "bg-primary/10 text-primary font-semibold"
                                : "hover:bg-black/[0.03] text-foreground"
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={currentEditSlugs.includes(p.slug)}
                              onChange={() => {
                                const updated = currentEditSlugs.includes(p.slug)
                                  ? currentEditSlugs.filter((s) => s !== p.slug)
                                  : [...currentEditSlugs, p.slug];
                                setEditingSlugs({ ...editingSlugs, [feed.id]: updated });
                              }}
                              className="accent-primary"
                              data-testid={`checkbox-edit-${feed.id}-${p.slug}`}
                            />
                            {p.name}
                          </label>
                        ))}
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          data-testid={`button-save-edit-${feed.id}`}
                          onClick={() => {
                            if (currentEditSlugs.length === 0) {
                              toast({ title: "Select at least one podcast", variant: "destructive" });
                              return;
                            }
                            updateMutation.mutate({ id: feed.id, podcastSlugs: currentEditSlugs });
                          }}
                          disabled={updateMutation.isPending}
                          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-bold shadow-lg shadow-primary/20 hover:shadow-xl disabled:opacity-50 transition-all"
                        >
                          {updateMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                          Save Changes
                        </button>
                        <button
                          onClick={() => {
                            setExpandedFeed(null);
                            const { [feed.id]: _, ...rest } = editingSlugs;
                            setEditingSlugs(rest);
                          }}
                          className="px-4 py-2 rounded-xl bg-black/[0.05] text-foreground text-sm font-bold hover:bg-black/[0.08] transition-colors"
                        >
                          Cancel
                        </button>
                      </div>
                      <div className="mt-3 pt-3 border-t border-black/[0.06]">
                        <p className="text-xs text-muted-foreground mb-1">Currently included:</p>
                        <div className="flex flex-wrap gap-1.5">
                          {feed.podcastSlugs.map((slug) => (
                            <span key={slug} className="px-2 py-0.5 bg-black/[0.04] rounded-md text-xs font-medium text-foreground">
                              {getPodcastName(slug)}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="glass-panel rounded-2xl p-6">
        <h3 className="font-display font-bold text-lg mb-3">Quick Reference</h3>
        <p className="text-sm text-muted-foreground mb-4">
          All feed URLs listed below. Copy any URL and paste it into your bot's RSS reader configuration.
        </p>
        <div className="space-y-2">
          <div className="flex items-center gap-3 px-4 py-2.5 bg-black/[0.02] rounded-xl border border-black/[0.06]">
            <span className="text-xs font-bold text-primary uppercase tracking-wider w-24 shrink-0">All Recaps</span>
            <code className="text-xs font-mono flex-1 truncate text-foreground" data-testid="text-ref-rss-all">{allFeedUrl}</code>
            <button
              onClick={() => copyUrl(allFeedUrl)}
              className="text-muted-foreground hover:text-primary transition-colors shrink-0"
              data-testid="button-ref-copy-all"
            >
              {copiedUrl === allFeedUrl ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
            </button>
          </div>
          {feeds && feeds.map((feed) => {
            const feedUrl = `${DOMAIN}/rss/feed/${feed.slugKey}`;
            return (
              <div key={feed.id} className="flex items-center gap-3 px-4 py-2.5 bg-black/[0.02] rounded-xl border border-black/[0.06]">
                <span className="text-xs font-bold text-orange-600 uppercase tracking-wider w-24 shrink-0 truncate" title={feed.name}>{feed.name}</span>
                <code className="text-xs font-mono flex-1 truncate text-foreground" data-testid={`text-ref-feed-${feed.id}`}>{feedUrl}</code>
                <button
                  onClick={() => copyUrl(feedUrl)}
                  className="text-muted-foreground hover:text-primary transition-colors shrink-0"
                  data-testid={`button-ref-copy-${feed.id}`}
                >
                  {copiedUrl === feedUrl ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
                </button>
              </div>
            );
          })}
        </div>
      </div>

      <div className="glass-panel rounded-2xl p-6">
        <h3 className="font-display font-bold text-sm mb-2 text-muted-foreground uppercase tracking-wider">What's in each RSS item</h3>
        <p className="text-sm text-muted-foreground mb-3">
          Each item in the feed contains everything your bot needs to create a Twitter post:
        </p>
        <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
          <div><span className="font-semibold text-foreground">title</span> <span className="text-muted-foreground">— Podcast Name + Episode Title</span></div>
          <div><span className="font-semibold text-foreground">description</span> <span className="text-muted-foreground">— Short TL;DL summary (tweetable)</span></div>
          <div><span className="font-semibold text-foreground">content:encoded</span> <span className="text-muted-foreground">— Full recap with insights, quotes</span></div>
          <div><span className="font-semibold text-foreground">link</span> <span className="text-muted-foreground">— Direct URL to recap on PodCap</span></div>
          <div><span className="font-semibold text-foreground">dc:creator</span> <span className="text-muted-foreground">— Podcast name</span></div>
          <div><span className="font-semibold text-foreground">category</span> <span className="text-muted-foreground">— Podcast name</span></div>
          <div><span className="font-semibold text-foreground">pubDate</span> <span className="text-muted-foreground">— Episode publish date</span></div>
          <div><span className="font-semibold text-foreground">enclosure</span> <span className="text-muted-foreground">— Podcast artwork image URL</span></div>
        </div>
      </div>
    </div>
  );
}