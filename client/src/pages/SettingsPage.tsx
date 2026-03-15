import { useState } from "react";
import { useLocation } from "wouter";
import { useAuth, useUpdateUser, useLogout } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { TimezoneSelect, getDetectedTimezone } from "@/components/TimezoneSelect";
import { TimePicker } from "@/components/TimePicker";
import {
  Mail, Clock, Globe, Palmtree, LogOut, Trash2,
  AlertTriangle, ChevronRight, Shield
} from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useMutation } from "@tanstack/react-query";
import { BottomNav } from "@/components/BottomNav";
import { FeedHeader } from "@/components/FeedHeader";

export default function SettingsPage() {
  const { data: user } = useAuth();
  const { toast } = useToast();
  const updateUser = useUpdateUser();
  const logout = useLogout();
  const [, navigate] = useLocation();

  const [email, setEmail] = useState("");
  const [timezone, setTimezone] = useState(getDetectedTimezone());
  const [deliveryTime, setDeliveryTime] = useState("07:00");
  const [vacationDate, setVacationDate] = useState("");
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteText, setDeleteText] = useState("");
  const [initialized, setInitialized] = useState(false);

  if (user && !initialized) {
    setEmail(user.email || "");
    setTimezone(user.deliveryTimezone || getDetectedTimezone());
    setDeliveryTime(user.deliveryTime || "07:00");
    setVacationDate(user.vacationUntil || "");
    setInitialized(true);
  }

  const deleteMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("DELETE", "/api/users/delete");
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Account deleted" });
      window.location.href = "/";
    },
  });

  const handleSave = (field: string, value: any) => {
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

  const initials = user?.email ? user.email[0].toUpperCase() : "?";

  return (
    <div className="min-h-screen bg-[#F9F9FB]" data-testid="settings-page">
      <FeedHeader />

      <div className="bg-white border-b border-[#F0F0F2]">
        <div className="max-w-[600px] mx-auto px-4 py-6 flex items-center gap-4">
          <div className="w-16 h-16 rounded-full bg-gradient-to-br from-[#6366F1] to-[#818CF8] flex items-center justify-center flex-shrink-0">
            <span className="text-white text-[22px] font-bold">{initials}</span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[18px] font-bold text-[#09090B] truncate">{user?.email || ""}</p>
            <p className="text-[13px] text-[#A1A1AA] mt-0.5">
              {user?.plan === "pro" ? "Pro member" : "Free plan"}
            </p>
          </div>
        </div>
      </div>

      <div className="max-w-[600px] mx-auto px-4 py-5 space-y-5 pb-24">
        <section>
          <h2 className="text-[12px] font-bold text-[#A1A1AA] uppercase tracking-wider mb-2 px-1">Account</h2>
          <div className="rounded-2xl bg-white border border-[#ECECEE] overflow-hidden divide-y divide-[#F4F4F5]">
            <div className="px-4 py-3.5">
              <label className="text-[12px] font-semibold text-[#A1A1AA] uppercase tracking-wide mb-1.5 block">Email</label>
              <div className="flex gap-2">
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="flex-1 text-[15px] text-[#09090B] bg-[#F9F9FB] rounded-xl px-3.5 py-2.5 border border-[#ECECEE] focus:outline-none focus:ring-2 focus:ring-[#6366F1]/20 focus:border-[#6366F1]/30"
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
          <h2 className="text-[12px] font-bold text-[#A1A1AA] uppercase tracking-wider mb-2 px-1">Email Delivery</h2>
          <div className="rounded-2xl bg-white border border-[#ECECEE] overflow-hidden divide-y divide-[#F4F4F5]">
            <div className="px-4 py-3.5">
              <div className="flex items-center gap-2 mb-2">
                <Clock className="w-4 h-4 text-[#71717A]" />
                <span className="text-[13px] font-semibold text-[#52525B]">Delivery time</span>
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
                <span className="text-[13px] font-semibold text-[#52525B]">Timezone</span>
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
                <span className="text-[13px] font-semibold text-[#52525B]">Pause emails until</span>
              </div>
              <div className="flex gap-2">
                <input
                  type="date"
                  value={vacationDate}
                  onChange={(e) => setVacationDate(e.target.value)}
                  className="flex-1 text-[15px] text-[#09090B] bg-[#F9F9FB] rounded-xl px-3.5 py-2.5 border border-[#ECECEE] focus:outline-none focus:ring-2 focus:ring-[#6366F1]/20"
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
          <div className="rounded-2xl bg-white border border-[#ECECEE] overflow-hidden divide-y divide-[#F4F4F5]">
            <button
              onClick={() => { logout.mutate(); navigate("/"); }}
              className="w-full flex items-center gap-3 px-4 py-3.5 text-[#52525B] hover:bg-[#FAFAFA] transition-colors active:bg-[#F4F4F5]"
              data-testid="settings-logout-btn"
            >
              <LogOut className="w-[18px] h-[18px]" />
              <span className="text-[15px] font-semibold">Log out</span>
              <ChevronRight className="w-4 h-4 text-[#D4D4D8] ml-auto" />
            </button>
            <button
              onClick={() => setShowDeleteConfirm(!showDeleteConfirm)}
              className="w-full flex items-center gap-3 px-4 py-3.5 text-[#EF4444] hover:bg-red-50/50 transition-colors active:bg-red-50"
              data-testid="settings-delete-btn"
            >
              <Trash2 className="w-[18px] h-[18px]" />
              <span className="text-[15px] font-semibold">Delete account</span>
              <ChevronRight className="w-4 h-4 text-[#FCA5A5] ml-auto" />
            </button>
          </div>

          {showDeleteConfirm && (
            <div className="mt-3 rounded-2xl border border-red-200 bg-red-50 p-4">
              <div className="flex items-start gap-2.5 mb-3">
                <AlertTriangle className="w-5 h-5 text-red-500 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-[14px] font-bold text-red-700">This cannot be undone</p>
                  <p className="text-[13px] text-red-600 mt-0.5">Type DELETE to confirm account deletion.</p>
                </div>
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={deleteText}
                  onChange={(e) => setDeleteText(e.target.value)}
                  placeholder="Type DELETE"
                  className="flex-1 px-3.5 py-2.5 text-[14px] border border-red-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-red-200"
                  data-testid="settings-delete-confirm-input"
                />
                <button
                  onClick={() => deleteText === "DELETE" && deleteMutation.mutate()}
                  disabled={deleteText !== "DELETE"}
                  className="px-4 py-2.5 bg-red-500 text-white text-[13px] font-bold rounded-xl disabled:opacity-30 active:scale-95 transition-all"
                  data-testid="settings-delete-confirm-btn"
                >
                  Delete
                </button>
              </div>
            </div>
          )}
        </section>
      </div>
      <BottomNav currentPath="/settings" />
    </div>
  );
}
