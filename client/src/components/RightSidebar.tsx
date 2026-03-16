import { useQuery } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import { Search, TrendingUp, Quote, Users, ShoppingBag, ChevronRight } from "lucide-react";
import { useState } from "react";

interface TrendingTopic {
  slug: string;
  name: string;
  episodeCount: number;
  trend: string;
}

interface NotableQuote {
  speakerName: string;
  quoteText: string;
  podcastName: string;
  podcastSlug: string;
  episodeSlug: string;
}

interface TrendingPerson {
  slug: string;
  name: string;
  title: string;
  mentionCount: number;
  trend: string;
}

interface PopularShopItem {
  name: string;
  company: string | null;
  imageUrl: string;
  category: string;
  slug: string;
}

interface SidebarData {
  trendingTopics: TrendingTopic[];
  notableQuotes: NotableQuote[];
  trendingPeople: TrendingPerson[];
  popularShop: PopularShopItem[];
}

function SidebarSearch() {
  const [query, setQuery] = useState("");
  const [, navigate] = useLocation();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (query.trim()) {
      navigate(`/discover?q=${encodeURIComponent(query.trim())}`);
      setQuery("");
    }
  };

  return (
    <form onSubmit={handleSubmit} className="relative" data-testid="sidebar-search">
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#A1A1AA]" />
      <input
        type="text"
        placeholder="Search podcasts"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        className="w-full pl-9 pr-3 py-2.5 bg-[#F4F4F5] dark:bg-[#1C1C22] rounded-full text-[14px] text-[#09090B] dark:text-white placeholder-[#A1A1AA] outline-none focus:ring-2 focus:ring-[#6366F1]/30 transition-all"
        data-testid="sidebar-search-input"
      />
    </form>
  );
}

function SidebarSection({ title, icon: Icon, showMoreHref, showMoreLabel, children }: {
  title: string;
  icon: React.ElementType;
  showMoreHref?: string;
  showMoreLabel?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-[#F9FAFB] dark:bg-[#111114] rounded-2xl overflow-hidden" data-testid={`sidebar-section-${title.toLowerCase().replace(/\s+/g, "-")}`}>
      <div className="px-4 pt-3.5 pb-2">
        <div className="flex items-center gap-2">
          <Icon className="w-4 h-4 text-[#6366F1]" />
          <h3 className="text-[15px] font-bold text-[#09090B] dark:text-white">{title}</h3>
        </div>
      </div>
      <div>{children}</div>
      {showMoreHref && (
        <Link href={showMoreHref}>
          <div className="px-4 py-3 text-[13px] font-semibold text-[#6366F1] hover:bg-[#F0F0F2] dark:hover:bg-[#1C1C22] transition-colors cursor-pointer" data-testid={`sidebar-show-more-${title.toLowerCase().replace(/\s+/g, "-")}`}>
            {showMoreLabel || "Show more"}
          </div>
        </Link>
      )}
    </div>
  );
}

function TrendingTopicsModule({ topics }: { topics: TrendingTopic[] }) {
  if (topics.length === 0) return null;
  return (
    <SidebarSection title="Trending" icon={TrendingUp} showMoreHref="/discover" showMoreLabel="Show more">
      {topics.map((topic, i) => (
        <Link key={topic.slug} href={`/topics/${topic.slug}`}>
          <div className="px-4 py-2.5 hover:bg-[#F0F0F2] dark:hover:bg-[#1C1C22] transition-colors cursor-pointer" data-testid={`sidebar-topic-${topic.slug}`}>
            <p className="text-[11px] text-[#A1A1AA] font-medium">{i + 1} · Trending</p>
            <p className="text-[14px] font-bold text-[#09090B] dark:text-white leading-snug">{topic.name}</p>
            <p className="text-[12px] text-[#71717A] mt-0.5">{topic.episodeCount} recent episode{topic.episodeCount !== 1 ? "s" : ""}</p>
          </div>
        </Link>
      ))}
    </SidebarSection>
  );
}

function NotableQuotesModule({ quotes }: { quotes: NotableQuote[] }) {
  if (quotes.length === 0) return null;
  return (
    <SidebarSection title="Notable Quotes" icon={Quote} showMoreHref="/discover">
      {quotes.map((quote, i) => (
        <Link key={i} href={`/podcasts/${quote.podcastSlug}/${quote.episodeSlug}`}>
          <div className="px-4 py-3 hover:bg-[#F0F0F2] dark:hover:bg-[#1C1C22] transition-colors cursor-pointer" data-testid={`sidebar-quote-${i}`}>
            <p className="text-[13px] text-[#09090B] dark:text-[#E4E4E7] leading-relaxed italic line-clamp-3">"{quote.quoteText}"</p>
            <div className="flex items-center gap-1.5 mt-1.5">
              <p className="text-[12px] font-semibold text-[#52525B] dark:text-[#A1A1AA]">{quote.speakerName}</p>
              <span className="text-[10px] text-[#A1A1AA]">·</span>
              <p className="text-[11px] text-[#A1A1AA] truncate">{quote.podcastName}</p>
            </div>
          </div>
        </Link>
      ))}
    </SidebarSection>
  );
}

function PeopleModule({ people }: { people: TrendingPerson[] }) {
  if (people.length === 0) return null;
  return (
    <SidebarSection title="People in the News" icon={Users} showMoreHref="/people" showMoreLabel="Show more">
      {people.map((person) => (
        <Link key={person.slug} href={`/people/${person.slug}`}>
          <div className="px-4 py-2.5 hover:bg-[#F0F0F2] dark:hover:bg-[#1C1C22] transition-colors cursor-pointer flex items-center gap-3" data-testid={`sidebar-person-${person.slug}`}>
            <div className="w-9 h-9 rounded-full bg-[#E4E4E7] dark:bg-[#27272A] flex items-center justify-center flex-shrink-0">
              <span className="text-[13px] font-bold text-[#52525B] dark:text-[#A1A1AA]">{person.name.charAt(0)}</span>
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[14px] font-semibold text-[#09090B] dark:text-white truncate">{person.name}</p>
              <p className="text-[12px] text-[#71717A] dark:text-[#A1A1AA] truncate">{person.title}</p>
            </div>
            <ChevronRight className="w-3.5 h-3.5 text-[#D4D4D8] dark:text-[#3F3F46] flex-shrink-0" />
          </div>
        </Link>
      ))}
    </SidebarSection>
  );
}

function ShopModule({ items }: { items: PopularShopItem[] }) {
  if (items.length === 0) return null;
  return (
    <SidebarSection title="Popular in Shop" icon={ShoppingBag} showMoreHref="/shop" showMoreLabel="Browse shop">
      {items.map((item, i) => (
        <Link key={i} href={`/shop/${item.slug}`}>
          <div className="px-4 py-2.5 hover:bg-[#F0F0F2] dark:hover:bg-[#1C1C22] transition-colors cursor-pointer flex items-center gap-3" data-testid={`sidebar-shop-${i}`}>
            {item.imageUrl && (
              <img
                src={item.imageUrl}
                alt={item.name}
                className="w-10 h-10 rounded-lg object-cover flex-shrink-0 bg-[#E4E4E7] dark:bg-[#27272A]"
                onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
              />
            )}
            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-semibold text-[#09090B] dark:text-white truncate">{item.name}</p>
              {item.company && <p className="text-[11px] text-[#A1A1AA] truncate">{item.company}</p>}
            </div>
          </div>
        </Link>
      ))}
    </SidebarSection>
  );
}

function SidebarSkeleton() {
  return (
    <div className="space-y-4">
      <div className="h-10 bg-[#F4F4F5] dark:bg-[#1C1C22] rounded-full animate-pulse" />
      {[1, 2, 3].map(i => (
        <div key={i} className="bg-[#F9FAFB] dark:bg-[#111114] rounded-2xl p-4 space-y-3">
          <div className="h-4 bg-[#E4E4E7] dark:bg-[#27272A] rounded w-24 animate-pulse" />
          <div className="h-3 bg-[#E4E4E7] dark:bg-[#27272A] rounded w-full animate-pulse" />
          <div className="h-3 bg-[#E4E4E7] dark:bg-[#27272A] rounded w-3/4 animate-pulse" />
        </div>
      ))}
    </div>
  );
}

export function RightSidebar() {
  const { data, isLoading } = useQuery<SidebarData>({
    queryKey: ["/api/sidebar-data"],
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  return (
    <aside
      className="w-[320px] flex-shrink-0"
      data-testid="right-sidebar"
    >
      <div className="sticky top-0 pt-3 pb-6 px-4 space-y-4 max-h-screen overflow-y-auto hide-scrollbar">
        <SidebarSearch />
        {isLoading || !data ? (
          <SidebarSkeleton />
        ) : (
          <>
            <TrendingTopicsModule topics={data.trendingTopics} />
            <NotableQuotesModule quotes={data.notableQuotes} />
            <PeopleModule people={data.trendingPeople} />
            <ShopModule items={data.popularShop} />
          </>
        )}
        <div className="flex flex-wrap gap-x-2 gap-y-0.5 text-[11px] text-[#A1A1AA] dark:text-[#52525B] px-1 pt-2">
          <Link href="/terms" className="hover:underline">Terms</Link>
          <span>·</span>
          <Link href="/privacy" className="hover:underline">Privacy</Link>
          <span>·</span>
          <Link href="/about" className="hover:underline">About</Link>
          <span>·</span>
          <Link href="/help" className="hover:underline">More</Link>
        </div>
        <p className="text-[11px] text-[#A1A1AA] dark:text-[#52525B] px-1">&copy; 2026 PodCap, Inc.</p>
      </div>
    </aside>
  );
}
