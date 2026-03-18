import { useState } from "react";
import { useLocation } from "wouter";
import { useAuth, useUpdateUser, useLogout } from "@/hooks/use-auth";
import { useFeatureFlags } from "@/hooks/use-feature-flags";
import { useToast } from "@/hooks/use-toast";
import { TimezoneSelect, getDetectedTimezone } from "@/components/TimezoneSelect";
import { TimePicker } from "@/components/TimePicker";
import { useTheme } from "@/components/ThemeProvider";
import {
  Mail, Clock, Globe, Palmtree, LogOut,
  ChevronRight, Sun, Moon, User, MapPin, Languages, Calendar,
  Crown, Zap, CreditCard, ExternalLink
} from "lucide-react";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useQuery } from "@tanstack/react-query";
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
          toast({ title: "Error", description: "Failed to update", variant: "destructive" });
        },
      }
    );
  };

  const handleLogout = () => {
    logout.mutate(undefined, {
      onSuccess: () => {
        queryClient.clear();
        navigate("/logout");
      },
    });
  };

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
              <p className="text-[13px] md:text-[14px] text-[#A1A1AA] mt-0.5 flex items-center gap-1.5">
                {user?.plan === "pro" ? (
                  <>
                    <Crown className="w-3.5 h-3.5 text-[#6366F1]" />
                    <span className="text-[#6366F1] font-semibold">Pulse Pro</span>
                  </>
                ) : "Free plan"}
              </p>
            </div>
          </div>
        </div>

        <div className="max-w-5xl mx-auto px-4 md:px-8 py-5 space-y-5 pb-24 md:pb-8">
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
            <h2 className="text-[12px] font-bold text-[#A1A1AA] uppercase tracking-wider mb-2 px-1">Account Settings</h2>
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

          <SubscriptionSection user={user} navigate={navigate} />

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
        </div>
      </div>
    </DashboardLayout>
  );
}

interface StripePrice {
  recurring?: { interval?: string };
}

interface StripeSubscriptionItem {
  price?: StripePrice;
}

interface StripeSubscription {
  id: string;
  status: string;
  items?: { data?: StripeSubscriptionItem[] };
}

interface SubscriptionData {
  subscription: StripeSubscription | null;
  plan: string;
}

function SubscriptionSection({ user, navigate }: { user: { plan?: string; stripeCustomerId?: string | null } | undefined; navigate: (path: string) => void }) {
  const { toast } = useToast();
  const { isEnabled } = useFeatureFlags();
  const [loadingPortal, setLoadingPortal] = useState(false);

  const { data: subData } = useQuery<SubscriptionData>({
    queryKey: ["/api/stripe/subscription"],
    enabled: !!user && user.plan === "pro",
  });

  const handleManageBilling = async () => {
    setLoadingPortal(true);
    try {
      const res = await apiRequest("POST", "/api/stripe/portal");
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      }
    } catch {
      toast({ title: "Error", description: "Failed to open billing portal", variant: "destructive" });
    } finally {
      setLoadingPortal(false);
    }
  };

  const isPro = user?.plan === "pro";

  let billingCycleLabel = "";
  if (isPro && subData?.subscription) {
    const interval = subData.subscription.items?.data?.[0]?.price?.recurring?.interval;
    if (interval === "year") {
      billingCycleLabel = "Billed annually";
    } else if (interval === "month") {
      billingCycleLabel = "Billed monthly";
    }
  }

  return (
    <section>
      <h2 className="text-[12px] font-bold text-[#A1A1AA] uppercase tracking-wider mb-2 px-1">Subscription</h2>
      <div className="rounded-2xl bg-white dark:bg-[#111114] border border-[#ECECEE] dark:border-[#1C1C22] overflow-hidden divide-y divide-[#F4F4F5] dark:divide-[#1C1C22]">
        <div className="px-4 py-3.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${isPro ? "bg-[#6366F1]/10" : "bg-[#F4F4F5] dark:bg-[#27272A]"}`}>
                {isPro ? <Crown className="w-5 h-5 text-[#6366F1]" /> : <Zap className="w-5 h-5 text-[#71717A]" />}
              </div>
              <div>
                <p className="text-[14px] font-bold text-foreground" data-testid="text-plan-name">
                  {isPro ? "Pulse Pro" : "Free Plan"}
                </p>
                <p className="text-[12px] text-muted-foreground">
                  {isPro ? "Personalized daily topic briefings" : "Follow as many podcasts as you want"}
                </p>
                {isPro && billingCycleLabel && (
                  <p className="text-[11px] text-[#6366F1] font-semibold mt-0.5" data-testid="text-billing-cycle">
                    {billingCycleLabel}
                  </p>
                )}
              </div>
            </div>
            {!isPro && isEnabled("upgrade") && (
              <button
                data-testid="button-upgrade-settings"
                onClick={() => navigate("/upgrade")}
                className="px-4 py-2 bg-[#6366F1] text-white text-[13px] font-bold rounded-xl hover:bg-[#4F46E5] transition-colors flex items-center gap-1.5"
              >
                <Crown className="w-3.5 h-3.5" />
                Upgrade
              </button>
            )}
          </div>
        </div>

        {isPro && (
          <>
            {isEnabled("pulse") && (
              <div className="px-4 py-3.5">
                <button
                  data-testid="button-my-pulse-settings"
                  onClick={() => navigate("/pulse")}
                  className="w-full flex items-center gap-3 text-left hover:bg-[#FAFAFA] dark:hover:bg-[#18181B] transition-colors rounded-lg -mx-1 px-1"
                >
                  <Zap className="w-[18px] h-[18px] text-[#6366F1]" />
                  <span className="text-[14px] font-semibold text-foreground flex-1">Manage Pulse Topics</span>
                  <ChevronRight className="w-4 h-4 text-[#D4D4D8] dark:text-[#3F3F46]" />
                </button>
              </div>
            )}
            <div className="px-4 py-3.5">
              <button
                data-testid="button-manage-billing"
                onClick={handleManageBilling}
                disabled={loadingPortal}
                className="w-full flex items-center gap-3 text-left hover:bg-[#FAFAFA] dark:hover:bg-[#18181B] transition-colors rounded-lg -mx-1 px-1"
              >
                <CreditCard className="w-[18px] h-[18px] text-[#71717A]" />
                <span className="text-[14px] font-semibold text-foreground flex-1">Manage Billing</span>
                {loadingPortal ? (
                  <span className="text-[12px] text-muted-foreground">Opening...</span>
                ) : (
                  <ExternalLink className="w-4 h-4 text-[#D4D4D8] dark:text-[#3F3F46]" />
                )}
              </button>
            </div>
          </>
        )}
      </div>
    </section>
  );
}
