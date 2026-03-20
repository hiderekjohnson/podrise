import { useState, useEffect, useCallback } from "react";
import { useLocation } from "wouter";
import { useAuth, useUpdateUser, useLogout } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { TimezoneSelect, getDetectedTimezone } from "@/components/TimezoneSelect";
import { TimePicker } from "@/components/TimePicker";
import { useTheme } from "@/components/ThemeProvider";
import {
  Mail, Clock, Globe, Palmtree, LogOut,
  ChevronRight, Sun, Moon, User, MapPin, Languages, Calendar, Unlink, CheckCircle2, Loader2
} from "lucide-react";
import { SiSpotify } from "react-icons/si";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { DashboardLayout } from "@/components/DashboardLayout";
import { PodRiseIcon } from "@/components/PodRiseHeader";

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
  const [activeTab, setActiveTab] = useState<"account" | "display" | "email" | "spotify">(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("spotify_connected") === "true" || params.get("spotify_error")) {
      return "spotify";
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
            {(["account", "display", "email", "spotify"] as const).map((tab) => (
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
                {tab === "spotify" && <SiSpotify className="w-3.5 h-3.5" />}
                {tab === "account" ? "Account" : tab === "display" ? "Display" : tab === "email" ? "Email Delivery" : "Spotify"}
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

          {activeTab === "spotify" && (
            <SpotifySettingsTab />
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}

function SpotifySettingsTab() {
  const { toast } = useToast();

  const { data: statusData, isLoading: statusLoading } = useQuery<{ connected: boolean }>({
    queryKey: ["/api/spotify/status"],
  });

  const disconnectMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/api/spotify/disconnect");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/spotify/status"] });
      queryClient.invalidateQueries({ queryKey: ["/api/spotify/shows"] });
      toast({ title: "Disconnected", description: "Spotify account disconnected" });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to disconnect Spotify", variant: "destructive" });
    },
  });

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("spotify_connected") === "true") {
      toast({ title: "Spotify connected", description: "Your Spotify account is now linked" });
      window.history.replaceState({}, "", window.location.pathname);
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
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, []);

  const handleConnectSpotify = useCallback(() => {
    window.location.href = "/api/auth/spotify?return_to=/settings";
  }, []);

  if (statusLoading) {
    return (
      <section>
        <h2 className="text-[12px] font-bold text-[#A1A1AA] uppercase tracking-wider mb-2 px-1">Spotify</h2>
        <div className="rounded-2xl bg-white dark:bg-[#111114] border border-[#ECECEE] dark:border-[#1C1C22] overflow-hidden">
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-[#1DB954]" data-testid="spotify-settings-loading" />
          </div>
        </div>
      </section>
    );
  }

  const isConnected = statusData?.connected;

  return (
    <section>
      <h2 className="text-[12px] font-bold text-[#A1A1AA] uppercase tracking-wider mb-2 px-1">Spotify</h2>
      <div className="rounded-2xl bg-white dark:bg-[#111114] border border-[#ECECEE] dark:border-[#1C1C22] overflow-hidden">
        <div className="px-5 py-5">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-full bg-[#1DB954]/15 flex items-center justify-center flex-shrink-0">
              <SiSpotify className="w-5 h-5 text-[#1DB954]" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[16px] font-bold text-[#09090B] dark:text-white" data-testid="text-spotify-settings-title">Spotify Integration</p>
              <div className="flex items-center gap-1.5 mt-0.5">
                {isConnected ? (
                  <span className="inline-flex items-center gap-1 text-[12px] font-semibold text-[#1DB954]" data-testid="spotify-status-connected">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    Connected
                  </span>
                ) : (
                  <span className="text-[12px] font-semibold text-[#A1A1AA]" data-testid="spotify-status-disconnected">
                    Not connected
                  </span>
                )}
              </div>
            </div>
          </div>

          {isConnected ? (
            <div className="space-y-4">
              <div className="bg-[#1DB954]/5 dark:bg-[#1DB954]/10 border border-[#1DB954]/15 rounded-xl px-4 py-3">
                <p className="text-[14px] text-[#09090B] dark:text-white leading-relaxed" data-testid="text-spotify-connected-info">
                  Your Spotify account is connected. You can import podcasts you follow on Spotify from the My Podcasts page.
                </p>
              </div>
              <button
                onClick={() => disconnectMutation.mutate()}
                disabled={disconnectMutation.isPending}
                className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-[14px] font-semibold border border-[#E4E4E7] dark:border-[#3F3F46] text-[#71717A] hover:bg-red-50 hover:text-red-600 hover:border-red-200 dark:hover:bg-red-900/20 dark:hover:text-red-400 dark:hover:border-red-800 transition-all disabled:opacity-50"
                data-testid="button-spotify-settings-disconnect"
              >
                {disconnectMutation.isPending ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Unlink className="w-4 h-4" />
                )}
                Disconnect Spotify
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              <p className="text-[14px] text-[#52525B] dark:text-[#A1A1AA] leading-relaxed" data-testid="text-spotify-value-prop">
                Connect your Spotify account to discover podcasts you already listen to on Spotify, right here in PodRise. We'll help you find and follow your favorites.
              </p>
              <button
                onClick={handleConnectSpotify}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-[14px] font-bold bg-[#1DB954] text-white hover:bg-[#1aa34a] transition-colors active:scale-95"
                data-testid="button-spotify-settings-connect"
              >
                <SiSpotify className="w-4 h-4" />
                Connect Spotify
              </button>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
