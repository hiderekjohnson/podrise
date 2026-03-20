import { useState, useEffect, useCallback } from "react";
import { useLocation, Link } from "wouter";
import { useAuth, useUpdateUser, useLogout } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { TimezoneSelect, getDetectedTimezone } from "@/components/TimezoneSelect";
import { TimePicker } from "@/components/TimePicker";
import { useTheme } from "@/components/ThemeProvider";
import {
  Clock, Globe, Palmtree, LogOut,
  ChevronRight, Sun, Moon, User, MapPin, Languages, Calendar, Unlink, CheckCircle2, Loader2,
  Radio, UserMinus, Compass, Music, Check, X
} from "lucide-react";
import { SiSpotify } from "react-icons/si";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { DashboardLayout } from "@/components/DashboardLayout";
import { PodRiseIcon } from "@/components/PodRiseHeader";
import { hiResArtwork } from "@/lib/utils";

export default function SettingsPage() {
  const { data: user } = useAuth();
  const { toast } = useToast();
  const updateUser = useUpdateUser();
  const logout = useLogout();
  const [, navigate] = useLocation();
  const { theme, setTheme } = useTheme();

  const [email, setEmail] = useState("");
  const [timezone, setTimezone] = useState(getDetectedTimezone());
  const [deliveryTime, setDeliveryTime] = useState("07:00");
  const [vacationDate, setVacationDate] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [birthday, setBirthday] = useState("");
  const [gender, setGender] = useState("");
  const [locationVal, setLocationVal] = useState("");
  const [language, setLanguage] = useState("");
  const [initialized, setInitialized] = useState(false);
  const [activeTab, setActiveTab] = useState<"account" | "display" | "email" | "my-podcasts">(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("tab") === "my-podcasts" || params.get("spotify_connected") === "true" || params.get("spotify_error") || params.get("spotify_tab") === "true") {
      return "my-podcasts";
    }
    return "account";
  });

  if (user && !initialized) {
    setEmail(user.email || "");
    setTimezone(user.deliveryTimezone || getDetectedTimezone());
    setDeliveryTime(user.deliveryTime || "07:00");
    setVacationDate(user.vacationUntil || "");
    setDisplayName(user.displayName || "");
    setBirthday(user.birthday || "");
    setGender(user.gender || "");
    setLocationVal(user.location || "");
    setLanguage(user.language || "");
    setInitialized(true);
  }

  const handleSave = (field: string, value: string | null) => {
    updateUser.mutate(
      { [field]: value },
      {
        onSuccess: () => {
          toast({ title: "Saved" });
          queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
        },
        onError: () => {
          toast({ title: "Error", description: "Failed to save", variant: "destructive" });
        },
      }
    );
  };

  const handleLogout = () => {
    logout.mutate(undefined, {
      onSuccess: () => navigate("/"),
    });
  };

  if (!user) {
    return (
      <DashboardLayout>
        <div className="min-h-screen flex items-center justify-center" data-testid="settings-loading">
          <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="min-h-screen bg-[#F9F9FB] dark:bg-[#09090B]" data-testid="settings-page">
        <div className="bg-white dark:bg-[#111114] border-b border-[#F0F0F2] dark:border-[#1C1C22]">
          <div className="max-w-5xl mx-auto px-4 md:px-8 py-6 flex items-center gap-4">
            <div className="w-16 h-16 rounded-full bg-gradient-to-br from-[#6366F1] to-[#818CF8] flex items-center justify-center flex-shrink-0">
              <PodRiseIcon size={40} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[18px] md:text-[20px] font-bold text-[#09090B] dark:text-white truncate">
                {user?.displayName || user?.email || ""}
              </p>
            </div>
          </div>
        </div>

        <div className="max-w-5xl mx-auto px-4 md:px-8">
          <div className="flex items-center gap-1 border-b border-[#F0F0F2] dark:border-[#1C1C22] overflow-x-auto scrollbar-hide" data-testid="settings-tabs">
            {(["account", "display", "email", "my-podcasts"] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-4 py-3 text-[14px] font-medium border-b-2 -mb-px whitespace-nowrap transition-colors flex items-center gap-1.5 ${
                  activeTab === tab
                    ? "text-[#6366F1] border-[#6366F1] font-semibold"
                    : "text-[#A1A1AA] border-transparent hover:text-[#52525B]"
                }`}
                data-testid={`settings-tab-${tab}`}
              >
                {tab === "my-podcasts" && <Radio className="w-3.5 h-3.5" />}
                {tab === "account" ? "Account" : tab === "display" ? "Display" : tab === "email" ? "Email Delivery" : "My Podcasts"}
              </button>
            ))}
          </div>
        </div>

        <div className="max-w-5xl mx-auto px-4 md:px-8 py-5 space-y-5 pb-24 md:pb-8">
          {activeTab === "account" && (
            <>
              <section>
                <h2 className="text-[12px] font-bold text-[#A1A1AA] uppercase tracking-wider mb-2 px-1">Account</h2>
                <div className="rounded-2xl bg-white dark:bg-[#111114] border border-[#ECECEE] dark:border-[#1C1C22] overflow-hidden divide-y divide-[#F4F4F5] dark:divide-[#1C1C22]">
                  <div className="px-4 py-3.5">
                    <label className="text-[12px] font-semibold text-[#A1A1AA] uppercase tracking-wide mb-1.5 block">Email</label>
                    <div className="flex gap-2">
                      <input
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="flex-1 text-[15px] md:text-[16px] text-[#09090B] dark:text-white bg-[#F9F9FB] dark:bg-[#09090B] rounded-xl px-3.5 py-2.5 border border-[#ECECEE] dark:border-[#27272A] focus:outline-none focus:ring-2 focus:ring-[#6366F1]/20 focus:border-[#6366F1]/30"
                        data-testid="settings-email-input"
                      />
                      <button
                        onClick={() => handleSave("email", email)}
                        className="px-4 py-2.5 bg-[#6366F1] text-white text-[13px] font-bold rounded-xl hover:bg-[#4F46E5] transition-colors active:scale-95"
                        data-testid="settings-email-save"
                      >
                        Save
                      </button>
                    </div>
                  </div>
                </div>
              </section>

              <section>
                <h2 className="text-[12px] font-bold text-[#A1A1AA] uppercase tracking-wider mb-2 px-1">Profile</h2>
                <div className="rounded-2xl bg-white dark:bg-[#111114] border border-[#ECECEE] dark:border-[#1C1C22] overflow-hidden divide-y divide-[#F4F4F5] dark:divide-[#1C1C22]">
                  <div className="px-4 py-3.5">
                    <div className="flex items-center gap-2 mb-2">
                      <User className="w-4 h-4 text-[#71717A]" />
                      <span className="text-[13px] font-semibold text-[#52525B] dark:text-[#A1A1AA]">Display Name</span>
                    </div>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={displayName}
                        onChange={(e) => setDisplayName(e.target.value)}
                        placeholder="Your name"
                        className="flex-1 text-[15px] md:text-[16px] text-[#09090B] dark:text-white bg-[#F9F9FB] dark:bg-[#09090B] rounded-xl px-3.5 py-2.5 border border-[#ECECEE] dark:border-[#27272A] focus:outline-none focus:ring-2 focus:ring-[#6366F1]/20 placeholder:text-[#A1A1AA]"
                        data-testid="settings-displayname-input"
                      />
                      <button
                        onClick={() => handleSave("displayName", displayName || null)}
                        className="px-4 py-2.5 bg-[#6366F1] text-white text-[13px] font-bold rounded-xl hover:bg-[#4F46E5] transition-colors active:scale-95"
                        data-testid="settings-displayname-save"
                      >
                        Save
                      </button>
                    </div>
                  </div>

                  <div className="px-4 py-3.5">
                    <div className="flex items-center gap-2 mb-2">
                      <Calendar className="w-4 h-4 text-[#71717A]" />
                      <span className="text-[13px] font-semibold text-[#52525B] dark:text-[#A1A1AA]">Birthday</span>
                    </div>
                    <div className="flex gap-2">
                      <input
                        type="date"
                        value={birthday}
                        onChange={(e) => setBirthday(e.target.value)}
                        className="flex-1 text-[15px] md:text-[16px] text-[#09090B] dark:text-white bg-[#F9F9FB] dark:bg-[#09090B] rounded-xl px-3.5 py-2.5 border border-[#ECECEE] dark:border-[#27272A] focus:outline-none focus:ring-2 focus:ring-[#6366F1]/20"
                        data-testid="settings-birthday-input"
                      />
                      <button
                        onClick={() => handleSave("birthday", birthday || null)}
                        className="px-4 py-2.5 bg-[#6366F1] text-white text-[13px] font-bold rounded-xl hover:bg-[#4F46E5] transition-colors active:scale-95"
                        data-testid="settings-birthday-save"
                      >
                        Save
                      </button>
                    </div>
                  </div>

                  <div className="px-4 py-3.5">
                    <div className="flex items-center gap-2 mb-2">
                      <User className="w-4 h-4 text-[#71717A]" />
                      <span className="text-[13px] font-semibold text-[#52525B] dark:text-[#A1A1AA]">Gender</span>
                    </div>
                    <div className="flex gap-2">
                      <select
                        value={gender}
                        onChange={(e) => {
                          setGender(e.target.value);
                          handleSave("gender", e.target.value || null);
                        }}
                        className="flex-1 text-[15px] md:text-[16px] text-[#09090B] dark:text-white bg-[#F9F9FB] dark:bg-[#09090B] rounded-xl px-3.5 py-2.5 border border-[#ECECEE] dark:border-[#27272A] focus:outline-none focus:ring-2 focus:ring-[#6366F1]/20"
                        data-testid="settings-gender-select"
                      >
                        <option value="">Prefer not to say</option>
                        <option value="male">Male</option>
                        <option value="female">Female</option>
                        <option value="non-binary">Non-binary</option>
                        <option value="other">Other</option>
                      </select>
                    </div>
                  </div>

                  <div className="px-4 py-3.5">
                    <div className="flex items-center gap-2 mb-2">
                      <MapPin className="w-4 h-4 text-[#71717A]" />
                      <span className="text-[13px] font-semibold text-[#52525B] dark:text-[#A1A1AA]">Location</span>
                    </div>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={locationVal}
                        onChange={(e) => setLocationVal(e.target.value)}
                        placeholder="City, State or Country"
                        className="flex-1 text-[15px] md:text-[16px] text-[#09090B] dark:text-white bg-[#F9F9FB] dark:bg-[#09090B] rounded-xl px-3.5 py-2.5 border border-[#ECECEE] dark:border-[#27272A] focus:outline-none focus:ring-2 focus:ring-[#6366F1]/20 placeholder:text-[#A1A1AA]"
                        data-testid="settings-location-input"
                      />
                      <button
                        onClick={() => handleSave("location", locationVal || null)}
                        className="px-4 py-2.5 bg-[#6366F1] text-white text-[13px] font-bold rounded-xl hover:bg-[#4F46E5] transition-colors active:scale-95"
                        data-testid="settings-location-save"
                      >
                        Save
                      </button>
                    </div>
                  </div>

                  <div className="px-4 py-3.5">
                    <div className="flex items-center gap-2 mb-2">
                      <Languages className="w-4 h-4 text-[#71717A]" />
                      <span className="text-[13px] font-semibold text-[#52525B] dark:text-[#A1A1AA]">Language</span>
                    </div>
                    <div className="flex gap-2">
                      <select
                        value={language}
                        onChange={(e) => {
                          setLanguage(e.target.value);
                          handleSave("language", e.target.value || null);
                        }}
                        className="flex-1 text-[15px] md:text-[16px] text-[#09090B] dark:text-white bg-[#F9F9FB] dark:bg-[#09090B] rounded-xl px-3.5 py-2.5 border border-[#ECECEE] dark:border-[#27272A] focus:outline-none focus:ring-2 focus:ring-[#6366F1]/20"
                        data-testid="settings-language-select"
                      >
                        <option value="">Select language</option>
                        <option value="en">English</option>
                        <option value="es">Spanish</option>
                        <option value="fr">French</option>
                        <option value="de">German</option>
                        <option value="pt">Portuguese</option>
                        <option value="ja">Japanese</option>
                        <option value="ko">Korean</option>
                        <option value="zh">Chinese</option>
                        <option value="hi">Hindi</option>
                        <option value="ar">Arabic</option>
                      </select>
                    </div>
                  </div>
                </div>
              </section>

              <section>
                <div className="rounded-2xl bg-white dark:bg-[#111114] border border-[#ECECEE] dark:border-[#1C1C22] overflow-hidden">
                  <button
                    onClick={handleLogout}
                    className="w-full flex items-center gap-3 px-4 py-3.5 text-[#52525B] dark:text-[#A1A1AA] hover:bg-[#FAFAFA] dark:hover:bg-[#18181B] transition-colors active:bg-[#F4F4F5]"
                    data-testid="settings-logout-btn"
                  >
                    <LogOut className="w-[18px] h-[18px]" />
                    <span className="text-[15px] md:text-[16px] font-semibold">Log out</span>
                    <ChevronRight className="w-4 h-4 text-[#D4D4D8] dark:text-[#3F3F46] ml-auto" />
                  </button>
                </div>
              </section>
            </>
          )}

          {activeTab === "display" && (
            <section>
              <h2 className="text-[12px] font-bold text-[#A1A1AA] uppercase tracking-wider mb-2 px-1">Display</h2>
              <div className="rounded-2xl bg-white dark:bg-[#111114] border border-[#ECECEE] dark:border-[#1C1C22] overflow-hidden">
                <div className="px-4 py-3.5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {theme === "dark" ? <Moon className="w-4 h-4 text-[#71717A]" /> : <Sun className="w-4 h-4 text-[#71717A]" />}
                      <span className="text-[13px] font-semibold text-[#52525B] dark:text-[#A1A1AA]">Display Mode</span>
                    </div>
                    <div className="flex items-center gap-1 bg-[#F4F4F5] dark:bg-[#1C1C22] rounded-xl p-1">
                      <button
                        onClick={() => setTheme("light")}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[13px] font-medium transition-colors ${
                          theme === "light" ? "bg-white dark:bg-[#27272A] text-[#09090B] dark:text-white shadow-sm" : "text-[#71717A]"
                        }`}
                        data-testid="settings-theme-light"
                      >
                        <Sun className="w-3.5 h-3.5" />
                        Light
                      </button>
                      <button
                        onClick={() => setTheme("dark")}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[13px] font-medium transition-colors ${
                          theme === "dark" ? "bg-white dark:bg-[#27272A] text-[#09090B] dark:text-white shadow-sm" : "text-[#71717A]"
                        }`}
                        data-testid="settings-theme-dark"
                      >
                        <Moon className="w-3.5 h-3.5" />
                        Dark
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </section>
          )}

          {activeTab === "email" && (
            <section>
              <h2 className="text-[12px] font-bold text-[#A1A1AA] uppercase tracking-wider mb-2 px-1">Email Delivery</h2>
              <div className="rounded-2xl bg-white dark:bg-[#111114] border border-[#ECECEE] dark:border-[#1C1C22] overflow-hidden divide-y divide-[#F4F4F5] dark:divide-[#1C1C22]">
                <div className="px-4 py-3.5">
                  <div className="flex items-center gap-2 mb-2">
                    <Clock className="w-4 h-4 text-[#71717A]" />
                    <span className="text-[13px] font-semibold text-[#52525B] dark:text-[#A1A1AA]">Delivery time</span>
                  </div>
                  <TimePicker
                    value={deliveryTime}
                    onChange={(t) => {
                      setDeliveryTime(t);
                      handleSave("deliveryTime", t);
                    }}
                  />
                </div>
                <div className="px-4 py-3.5">
                  <div className="flex items-center gap-2 mb-2">
                    <Globe className="w-4 h-4 text-[#71717A]" />
                    <span className="text-[13px] font-semibold text-[#52525B] dark:text-[#A1A1AA]">Timezone</span>
                  </div>
                  <TimezoneSelect
                    value={timezone}
                    onChange={(tz) => {
                      setTimezone(tz);
                      handleSave("deliveryTimezone", tz);
                    }}
                  />
                </div>
                <div className="px-4 py-3.5">
                  <div className="flex items-center gap-2 mb-2">
                    <Palmtree className="w-4 h-4 text-[#71717A]" />
                    <span className="text-[13px] font-semibold text-[#52525B] dark:text-[#A1A1AA]">Pause emails until</span>
                  </div>
                  <div className="flex gap-2">
                    <input
                      type="date"
                      value={vacationDate}
                      onChange={(e) => setVacationDate(e.target.value)}
                      className="flex-1 text-[15px] md:text-[16px] text-[#09090B] dark:text-white bg-[#F9F9FB] dark:bg-[#09090B] rounded-xl px-3.5 py-2.5 border border-[#ECECEE] dark:border-[#27272A] focus:outline-none focus:ring-2 focus:ring-[#6366F1]/20"
                      data-testid="settings-vacation-input"
                    />
                    <button
                      onClick={() => handleSave("vacationUntil", vacationDate || null)}
                      className="px-4 py-2.5 bg-[#6366F1] text-white text-[13px] font-bold rounded-xl hover:bg-[#4F46E5] transition-colors active:scale-95"
                      data-testid="settings-vacation-save"
                    >
                      {vacationDate ? "Set" : "Clear"}
                    </button>
                  </div>
                  {user?.vacationUntil && (
                    <p className="text-[12px] text-[#A1A1AA] mt-2">
                      Paused until {new Date(user.vacationUntil).toLocaleDateString()}
                    </p>
                  )}
                </div>
              </div>
            </section>
          )}

          {activeTab === "my-podcasts" && (
            <MyPodcastsSettingsTab />
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}

interface FollowedPodcast {
  slug: string;
  name: string;
  artworkUrl: string | null;
  category: string | null;
  hosts: string | null;
  hasLandingPage: boolean;
}

interface SpotifyShow {
  spotifyId: string;
  name: string;
  publisher: string;
  description: string;
  artworkUrl: string;
  totalEpisodes: number;
  spotifyUrl: string;
  alreadyFollowed: boolean;
  itunesId: string | null;
}

function ExternalPodcastName({ name, slug }: { name: string; slug: string }) {
  const [showTooltip, setShowTooltip] = useState(false);

  return (
    <div className="relative inline-block max-w-full">
      <span
        className="text-[16px] font-bold text-[#09090B] dark:text-white block truncate cursor-default"
        data-testid={`my-podcast-name-${slug}`}
        onMouseEnter={() => setShowTooltip(true)}
        onMouseLeave={() => setShowTooltip(false)}
      >
        {name}
      </span>
      {showTooltip && (
        <div className="absolute left-0 bottom-full mb-2 z-50 px-3 py-2 text-[12px] leading-snug text-white bg-[#18181B] dark:bg-[#27272A] rounded-lg shadow-lg whitespace-normal max-w-[260px] pointer-events-none" data-testid={`tooltip-external-${slug}`}>
          This podcast isn't in our library yet — we've noted your interest and are working on adding it
          <div className="absolute left-4 top-full w-0 h-0 border-l-[5px] border-l-transparent border-r-[5px] border-r-transparent border-t-[5px] border-t-[#18181B] dark:border-t-[#27272A]" />
        </div>
      )}
    </div>
  );
}

function SpotifyImportSection() {
  const { toast } = useToast();
  const [importMode, setImportMode] = useState(false);
  const [selectedShows, setSelectedShows] = useState<Set<string>>(new Set());

  const { data: statusData, isLoading: statusLoading } = useQuery<{ connected: boolean }>({
    queryKey: ["/api/spotify/status"],
  });

  const { data: showsData, isLoading: showsLoading, error: showsError } = useQuery<{ shows: SpotifyShow[] }>({
    queryKey: ["/api/spotify/shows"],
    enabled: importMode && !!statusData?.connected,
    retry: false,
  });

  const disconnectMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/api/spotify/disconnect");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/spotify/status"] });
      queryClient.invalidateQueries({ queryKey: ["/api/spotify/shows"] });
      setImportMode(false);
      toast({ title: "Disconnected", description: "Spotify account disconnected" });
    },
  });

  const bulkFollowMutation = useMutation({
    mutationFn: async (shows: Array<{ spotifyId: string; name: string; artworkUrl: string }>) => {
      const res = await apiRequest("POST", "/api/spotify/bulk-follow", { shows });
      return await res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/feed/followed-slugs"] });
      queryClient.invalidateQueries({ queryKey: ["/api/feed/followed-podcasts-details"] });
      queryClient.invalidateQueries({ queryKey: ["/api/feed"] });
      queryClient.invalidateQueries({ queryKey: ["/api/spotify/shows"] });
      setSelectedShows(new Set());
      toast({
        title: "Podcasts imported",
        description: `${data.followed} podcast${data.followed !== 1 ? "s" : ""} added to your feed`,
      });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to import podcasts", variant: "destructive" });
    },
  });

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("spotify_connected") === "true") {
      setImportMode(true);
      toast({ title: "Spotify connected", description: "Select podcasts to import" });
      window.history.replaceState({}, "", window.location.pathname + "?tab=my-podcasts");
    }
    if (params.get("spotify_error")) {
      const err = params.get("spotify_error");
      const messages: Record<string, string> = {
        denied: "Spotify access was denied",
        invalid: "Invalid authentication request",
        token_failed: "Failed to connect to Spotify",
        unknown: "Something went wrong connecting to Spotify",
      };
      toast({ title: "Spotify error", description: messages[err || ""] || messages.unknown, variant: "destructive" });
      window.history.replaceState({}, "", window.location.pathname + "?tab=my-podcasts");
    }
  }, []);

  const handleConnectSpotify = useCallback(() => {
    window.location.href = "/api/auth/spotify?return_to=" + encodeURIComponent("/settings?tab=my-podcasts");
  }, []);

  const handleStartImport = useCallback(() => {
    if (statusData?.connected) {
      setImportMode(true);
    } else {
      handleConnectSpotify();
    }
  }, [statusData, handleConnectSpotify]);

  const handleFollowSelected = useCallback(() => {
    if (!showsData?.shows) return;
    const toFollow = showsData.shows
      .filter(s => selectedShows.has(s.spotifyId) && !s.alreadyFollowed)
      .map(s => ({ spotifyId: s.spotifyId, name: s.name, artworkUrl: s.artworkUrl }));
    if (toFollow.length > 0) {
      bulkFollowMutation.mutate(toFollow);
    }
  }, [showsData, selectedShows, bulkFollowMutation]);

  const shows = showsData?.shows || [];
  const newShows = shows.filter(s => !s.alreadyFollowed);
  const alreadyFollowedShows = shows.filter(s => s.alreadyFollowed);

  const toggleShow = (spotifyId: string) => {
    setSelectedShows(prev => {
      const next = new Set(prev);
      if (next.has(spotifyId)) next.delete(spotifyId);
      else next.add(spotifyId);
      return next;
    });
  };

  const selectAll = () => {
    setSelectedShows(new Set(newShows.map(s => s.spotifyId)));
  };

  const deselectAll = () => {
    setSelectedShows(new Set());
  };

  const selectedCount = [...selectedShows].filter(id => newShows.some(s => s.spotifyId === id)).length;

  if (statusLoading) return null;

  if (!importMode) {
    return (
      <div
        className="bg-gradient-to-r from-[#1DB954]/10 to-[#1DB954]/5 dark:from-[#1DB954]/15 dark:to-[#1DB954]/5 border border-[#1DB954]/20 dark:border-[#1DB954]/30 rounded-2xl p-5 flex items-center justify-between gap-4"
        data-testid="spotify-import-section"
      >
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex-shrink-0 w-10 h-10 rounded-full bg-[#1DB954]/15 flex items-center justify-center">
            <SiSpotify className="w-5 h-5 text-[#1DB954]" />
          </div>
          <div className="min-w-0">
            <p className="text-[15px] font-semibold text-[#09090B] dark:text-white">Import from Spotify</p>
            <p className="text-[13px] text-[#71717A] dark:text-[#A1A1AA] truncate">
              {statusData?.connected ? "Import podcasts you follow on Spotify" : "Connect your Spotify to import podcasts"}
            </p>
          </div>
        </div>
        <button
          onClick={handleStartImport}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl font-bold text-[14px] bg-[#1DB954] text-white hover:bg-[#1aa34a] transition-colors whitespace-nowrap"
          data-testid="button-spotify-import"
        >
          <SiSpotify className="w-4 h-4" />
          {statusData?.connected ? "Import" : "Connect"}
        </button>
      </div>
    );
  }

  const errorMessage = showsError ? (showsError as any)?.message || "" : "";
  const isDisconnected = errorMessage.startsWith("401") || errorMessage.startsWith("403");
  const isRateLimited = errorMessage.startsWith("429");
  const isOtherError = showsError && !isDisconnected && !isRateLimited;

  return (
    <div className="bg-white dark:bg-[#111114] border border-[#E4E4E7] dark:border-[#1C1C22] rounded-2xl overflow-hidden shadow-[0_1px_4px_rgba(0,0,0,0.05)]" data-testid="spotify-import-panel">
      <div className="px-5 py-4 border-b border-[#E4E4E7] dark:border-[#1C1C22] flex items-center justify-between">
        <div className="flex items-center gap-3">
          <SiSpotify className="w-5 h-5 text-[#1DB954]" />
          <h3 className="text-[16px] font-bold text-[#09090B] dark:text-white" data-testid="text-spotify-import-title">Import from Spotify</h3>
        </div>
        <div className="flex items-center gap-2">
          {statusData?.connected && (
            <button
              onClick={() => disconnectMutation.mutate()}
              disabled={disconnectMutation.isPending}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[12px] font-medium text-[#71717A] hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 transition-all"
              data-testid="button-spotify-disconnect"
            >
              <Unlink className="w-3 h-3" />
              Disconnect
            </button>
          )}
          <button
            onClick={() => { setImportMode(false); setSelectedShows(new Set()); }}
            className="p-1.5 rounded-lg text-[#71717A] hover:text-[#09090B] dark:hover:text-white hover:bg-[#F4F4F5] dark:hover:bg-[#27272A] transition-all"
            data-testid="button-spotify-import-close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {showsLoading ? (
        <div className="flex flex-col items-center justify-center py-12 gap-3">
          <Loader2 className="w-6 h-6 animate-spin text-[#1DB954]" data-testid="spotify-shows-loading" />
          <p className="text-[13px] text-[#71717A]">Fetching your Spotify podcasts...</p>
        </div>
      ) : isDisconnected ? (
        <div className="flex flex-col items-center justify-center py-12 gap-3">
          <p className="text-[14px] text-[#71717A] dark:text-[#A1A1AA]" data-testid="text-spotify-reconnect">Your Spotify connection expired</p>
          <button
            onClick={handleConnectSpotify}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl font-bold text-[14px] bg-[#1DB954] text-white hover:bg-[#1aa34a] transition-colors"
            data-testid="button-spotify-reconnect"
          >
            <SiSpotify className="w-4 h-4" />
            Reconnect Spotify
          </button>
        </div>
      ) : isRateLimited ? (
        <div className="flex flex-col items-center justify-center py-12 gap-3">
          <p className="text-[14px] text-[#71717A] dark:text-[#A1A1AA]" data-testid="text-spotify-rate-limited">Spotify rate limit reached. Please wait a moment and try again.</p>
          <button
            onClick={() => queryClient.invalidateQueries({ queryKey: ["/api/spotify/shows"] })}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl font-bold text-[14px] bg-[#1DB954] text-white hover:bg-[#1aa34a] transition-colors"
            data-testid="button-spotify-retry"
          >
            Retry
          </button>
        </div>
      ) : isOtherError ? (
        <div className="flex flex-col items-center justify-center py-12 gap-3">
          <p className="text-[14px] text-[#71717A] dark:text-[#A1A1AA]" data-testid="text-spotify-error">Something went wrong fetching your Spotify shows. Please try again.</p>
          <button
            onClick={() => queryClient.invalidateQueries({ queryKey: ["/api/spotify/shows"] })}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl font-bold text-[14px] bg-[#1DB954] text-white hover:bg-[#1aa34a] transition-colors"
            data-testid="button-spotify-retry-error"
          >
            Retry
          </button>
        </div>
      ) : shows.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 gap-2">
          <Music className="w-8 h-8 text-[#A1A1AA]" />
          <p className="text-[14px] text-[#71717A] dark:text-[#A1A1AA]" data-testid="text-spotify-no-shows">No saved shows found on Spotify</p>
        </div>
      ) : (
        <>
          {newShows.length > 0 && (
            <div className="px-5 py-3 border-b border-[#E4E4E7] dark:border-[#1C1C22] flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-[13px] font-medium text-[#71717A]" data-testid="text-spotify-new-count">
                  {newShows.length} new podcast{newShows.length !== 1 ? "s" : ""} to import
                </span>
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={selectedCount === newShows.length ? deselectAll : selectAll}
                  className="text-[13px] font-medium text-[#6366F1] hover:text-[#4F46E5] transition-colors"
                  data-testid="button-spotify-select-all"
                >
                  {selectedCount === newShows.length ? "Deselect all" : "Select all"}
                </button>
                {selectedCount > 0 && (
                  <button
                    onClick={handleFollowSelected}
                    disabled={bulkFollowMutation.isPending}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[13px] font-bold bg-[#1DB954] text-white hover:bg-[#1aa34a] transition-colors disabled:opacity-50"
                    data-testid="button-spotify-follow-selected"
                  >
                    {bulkFollowMutation.isPending ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Check className="w-3.5 h-3.5" />
                    )}
                    Follow {selectedCount}
                  </button>
                )}
              </div>
            </div>
          )}

          <div className="max-h-[400px] overflow-y-auto" data-testid="spotify-shows-list">
            {newShows.map(show => (
              <label
                key={show.spotifyId}
                className="flex items-center gap-3 px-5 py-3 hover:bg-[#F4F4F5] dark:hover:bg-[#1C1C22] transition-colors cursor-pointer border-b border-[#F4F4F5] dark:border-[#1C1C22] last:border-b-0"
                data-testid={`spotify-show-${show.spotifyId}`}
              >
                <input
                  type="checkbox"
                  checked={selectedShows.has(show.spotifyId)}
                  onChange={() => toggleShow(show.spotifyId)}
                  className="w-4 h-4 rounded border-[#D4D4D8] dark:border-[#3F3F46] text-[#1DB954] focus:ring-[#1DB954] accent-[#1DB954]"
                  data-testid={`checkbox-spotify-show-${show.spotifyId}`}
                />
                <div className="w-[44px] h-[44px] rounded-lg overflow-hidden flex-shrink-0 border border-black/[0.08]">
                  {show.artworkUrl ? (
                    <img src={show.artworkUrl} alt={show.name} className="w-full h-full object-cover" loading="lazy" />
                  ) : (
                    <div className="w-full h-full bg-[#F4F4F5] dark:bg-[#1C1C22] flex items-center justify-center">
                      <Radio className="w-4 h-4 text-[#A1A1AA]" />
                    </div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[14px] font-semibold text-[#09090B] dark:text-white truncate">{show.name}</p>
                  {show.publisher && (
                    <p className="text-[12px] text-[#71717A] dark:text-[#A1A1AA] truncate">{show.publisher}</p>
                  )}
                </div>
              </label>
            ))}

            {alreadyFollowedShows.length > 0 && (
              <>
                <div className="px-5 py-2 bg-[#F9F9FB] dark:bg-[#0D0D0F]">
                  <span className="text-[12px] font-medium text-[#A1A1AA] uppercase tracking-wide" data-testid="text-spotify-already-followed-label">Already following</span>
                </div>
                {alreadyFollowedShows.map(show => (
                  <div
                    key={show.spotifyId}
                    className="flex items-center gap-3 px-5 py-3 opacity-60 border-b border-[#F4F4F5] dark:border-[#1C1C22] last:border-b-0"
                    data-testid={`spotify-show-followed-${show.spotifyId}`}
                  >
                    <div className="w-4 h-4 flex items-center justify-center">
                      <Check className="w-4 h-4 text-[#1DB954]" />
                    </div>
                    <div className="w-[44px] h-[44px] rounded-lg overflow-hidden flex-shrink-0 border border-black/[0.08]">
                      {show.artworkUrl ? (
                        <img src={show.artworkUrl} alt={show.name} className="w-full h-full object-cover" loading="lazy" />
                      ) : (
                        <div className="w-full h-full bg-[#F4F4F5] dark:bg-[#1C1C22] flex items-center justify-center">
                          <Radio className="w-4 h-4 text-[#A1A1AA]" />
                        </div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[14px] font-semibold text-[#09090B] dark:text-white truncate">{show.name}</p>
                      {show.publisher && (
                        <p className="text-[12px] text-[#71717A] dark:text-[#A1A1AA] truncate">{show.publisher}</p>
                      )}
                    </div>
                  </div>
                ))}
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function MyPodcastsSettingsTab() {
  const { toast } = useToast();

  const { data: podcasts = [], isLoading } = useQuery<FollowedPodcast[]>({
    queryKey: ["/api/feed/followed-podcasts-details"],
  });

  const unfollowMutation = useMutation({
    mutationFn: async (podcastSlug: string) => {
      await apiRequest("POST", "/api/feed/unfollow", { podcastSlug });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/feed/followed-slugs"] });
      queryClient.invalidateQueries({ queryKey: ["/api/feed/followed-podcasts-details"] });
      queryClient.invalidateQueries({ queryKey: ["/api/feed"] });
      toast({ title: "Unfollowed", description: "Podcast removed from your feed" });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to unfollow podcast", variant: "destructive" });
    },
  });

  return (
    <>
      <section>
        <h2 className="text-[12px] font-bold text-[#A1A1AA] uppercase tracking-wider mb-2 px-1">Import</h2>
        <SpotifyImportSection />
      </section>

      <section>
        <h2 className="text-[12px] font-bold text-[#A1A1AA] uppercase tracking-wider mb-2 px-1">Followed Podcasts</h2>
        {isLoading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="w-7 h-7 animate-spin text-[#6366F1]" data-testid="my-podcasts-loading" />
          </div>
        ) : podcasts.length === 0 ? (
          <div className="text-center py-12">
            <div className="w-16 h-16 rounded-full bg-[#F4F4F5] dark:bg-[#1C1C22] flex items-center justify-center mx-auto mb-4">
              <Radio className="w-7 h-7 text-[#A1A1AA]" />
            </div>
            <p className="text-[17px] font-bold text-[#09090B] dark:text-white mb-1" data-testid="my-podcasts-empty">No podcasts yet</p>
            <p className="text-[14px] text-[#71717A] dark:text-[#A1A1AA] leading-relaxed max-w-sm mx-auto">
              Follow podcasts from Discover or your feed. They'll appear here.
            </p>
            <Link href="/discover">
              <span className="inline-flex items-center gap-2 mt-4 px-5 py-2.5 rounded-xl font-bold text-[15px] bg-[#6366F1] text-white hover:bg-[#4F46E5] transition-colors" data-testid="link-discover-podcasts">
                Discover Podcasts
              </span>
            </Link>
          </div>
        ) : (
          <div className="space-y-3" data-testid="my-podcasts-list">
            {podcasts.map((podcast) => {
              const ArtworkContent = (
                <div className="w-[60px] h-[60px] rounded-[10px] overflow-hidden shadow-sm border border-black/[0.08]">
                  {podcast.artworkUrl ? (
                    <img src={hiResArtwork(podcast.artworkUrl)} alt={podcast.name} className="w-full h-full object-cover" loading="lazy" />
                  ) : (
                    <div className="w-full h-full bg-[#F4F4F5] dark:bg-[#1C1C22] flex items-center justify-center">
                      <Radio className="w-5 h-5 text-[#A1A1AA]" />
                    </div>
                  )}
                </div>
              );

              return (
                <div
                  key={podcast.slug}
                  className="bg-white dark:bg-[#111114] border border-[#E4E4E7] dark:border-[#1C1C22] rounded-2xl overflow-hidden shadow-[0_1px_4px_rgba(0,0,0,0.05)] flex items-center gap-4 px-4 py-3"
                  data-testid={`my-podcast-card-${podcast.slug}`}
                >
                  {podcast.hasLandingPage ? (
                    <Link href={`/podcasts/${podcast.slug}`} className="flex-shrink-0">
                      {ArtworkContent}
                    </Link>
                  ) : (
                    <div className="flex-shrink-0">
                      {ArtworkContent}
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    {podcast.hasLandingPage ? (
                      <Link href={`/podcasts/${podcast.slug}`}>
                        <span className="text-[16px] font-bold text-[#09090B] dark:text-white hover:text-[#6366F1] transition-colors block truncate" data-testid={`my-podcast-name-${podcast.slug}`}>
                          {podcast.name}
                        </span>
                      </Link>
                    ) : (
                      <ExternalPodcastName name={podcast.name} slug={podcast.slug} />
                    )}
                    {podcast.hosts && (
                      <p className="text-[13px] text-[#71717A] dark:text-[#A1A1AA] truncate mt-0.5">{podcast.hosts}</p>
                    )}
                    {podcast.category && (
                      <p className="text-[12px] text-[#A1A1AA] mt-0.5">{podcast.category}</p>
                    )}
                  </div>
                  <button
                    onClick={() => unfollowMutation.mutate(podcast.slug)}
                    disabled={unfollowMutation.isPending}
                    className="flex-shrink-0 inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-[13px] font-semibold border border-[#E4E4E7] dark:border-[#3F3F46] text-[#71717A] hover:bg-red-50 hover:text-red-600 hover:border-red-200 transition-all"
                    data-testid={`my-podcast-unfollow-${podcast.slug}`}
                  >
                    <UserMinus className="w-3.5 h-3.5" />
                    Unfollow
                  </button>
                </div>
              );
            })}

            <div className="mt-6 bg-gradient-to-r from-[#EEF2FF] to-[#F0EBFF] dark:from-[#1a1a2e] dark:to-[#1e1b2e] border border-[#E0E7FF] dark:border-[#2d2b45] rounded-2xl p-5 flex items-center justify-between gap-4" data-testid="discover-cta-section">
              <div className="flex items-center gap-3 min-w-0">
                <div className="flex-shrink-0 w-10 h-10 rounded-full bg-[#6366F1]/10 flex items-center justify-center">
                  <Compass className="w-5 h-5 text-[#6366F1]" />
                </div>
                <div className="min-w-0">
                  <p className="text-[15px] font-semibold text-[#09090B] dark:text-white">Looking for more?</p>
                  <p className="text-[13px] text-[#71717A] dark:text-[#A1A1AA] truncate">Browse trending and top-rated podcasts</p>
                </div>
              </div>
              <Link href="/discover">
                <span className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl font-bold text-[14px] bg-[#6366F1] text-white hover:bg-[#4F46E5] transition-colors whitespace-nowrap" data-testid="link-discover-more">
                  Discover Podcasts
                </span>
              </Link>
            </div>
          </div>
        )}
      </section>
    </>
  );
}
