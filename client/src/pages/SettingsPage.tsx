import { useState } from "react";
import { useLocation } from "wouter";
import { useAuth, useUpdateUser, useLogout } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { TimezoneSelect, getDetectedTimezone } from "@/components/TimezoneSelect";
import { TimePicker } from "@/components/TimePicker";
import {
  ArrowLeft, Mail, Clock, Globe, Palmtree, CalendarOff, LogOut, Trash2,
  AlertTriangle, ChevronRight, User
} from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useMutation } from "@tanstack/react-query";
import { BottomNav } from "@/components/BottomNav";

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
          toast({ title: "Settings updated" });
          queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
        },
        onError: () => {
          toast({ title: "Error", description: "Failed to update settings", variant: "destructive" });
        },
      }
    );
  };

  return (
    <div className="min-h-screen bg-white" data-testid="settings-page">
      <div className="sticky top-0 z-30 bg-white/95 backdrop-blur-sm border-b border-[#F0F0F2]">
        <div className="max-w-[600px] mx-auto flex items-center gap-3 px-4 py-3">
          <button onClick={() => navigate("/dashboard")} className="p-1" data-testid="settings-back-btn">
            <ArrowLeft className="w-5 h-5 text-[#09090B]" />
          </button>
          <h1 className="text-lg font-semibold text-[#09090B]">Settings</h1>
        </div>
      </div>

      <div className="max-w-[600px] mx-auto px-4 py-6 space-y-6 pb-24">
        <section>
          <h2 className="text-sm font-semibold text-[#A1A1AA] uppercase tracking-wider mb-3">Account</h2>
          <div className="rounded-xl border border-[#F0F0F2] divide-y divide-[#F0F0F2]">
            <div className="px-4 py-4">
              <label className="text-sm font-medium text-[#52525B] mb-1 block">Email address</label>
              <div className="flex gap-2">
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="flex-1 text-[15px] text-[#09090B] bg-[#F7F7FC] rounded-lg px-3 py-2 border border-[#F0F0F2] focus:outline-none focus:ring-2 focus:ring-[#6366F1]/20"
                  data-testid="settings-email-input"
                />
                <button
                  onClick={() => handleSave("email", email)}
                  className="px-4 py-2 bg-[#6366F1] text-white text-sm font-semibold rounded-lg hover:bg-[#4F46E5] transition-colors"
                  data-testid="settings-email-save"
                >
                  Save
                </button>
              </div>
            </div>
          </div>
        </section>

        <section>
          <h2 className="text-sm font-semibold text-[#A1A1AA] uppercase tracking-wider mb-3">Delivery</h2>
          <div className="rounded-xl border border-[#F0F0F2] divide-y divide-[#F0F0F2]">
            <div className="px-4 py-4">
              <label className="text-sm font-medium text-[#52525B] mb-2 block flex items-center gap-2">
                <Clock className="w-4 h-4" /> Delivery time
              </label>
              <div className="flex gap-2 items-center">
                <TimePicker
                  value={deliveryTime}
                  onChange={(t) => {
                    setDeliveryTime(t);
                    handleSave("deliveryTime", t);
                  }}
                />
              </div>
            </div>
            <div className="px-4 py-4">
              <label className="text-sm font-medium text-[#52525B] mb-2 block flex items-center gap-2">
                <Globe className="w-4 h-4" /> Timezone
              </label>
              <TimezoneSelect
                value={timezone}
                onChange={(tz) => {
                  setTimezone(tz);
                  handleSave("deliveryTimezone", tz);
                }}
              />
            </div>
          </div>
        </section>

        <section>
          <h2 className="text-sm font-semibold text-[#A1A1AA] uppercase tracking-wider mb-3">Vacation</h2>
          <div className="rounded-xl border border-[#F0F0F2]">
            <div className="px-4 py-4">
              <label className="text-sm font-medium text-[#52525B] mb-2 block flex items-center gap-2">
                <Palmtree className="w-4 h-4" /> Pause emails until
              </label>
              <div className="flex gap-2">
                <input
                  type="date"
                  value={vacationDate}
                  onChange={(e) => setVacationDate(e.target.value)}
                  className="flex-1 text-[15px] text-[#09090B] bg-[#F7F7FC] rounded-lg px-3 py-2 border border-[#F0F0F2] focus:outline-none focus:ring-2 focus:ring-[#6366F1]/20"
                  data-testid="settings-vacation-input"
                />
                <button
                  onClick={() => handleSave("vacationUntil", vacationDate || null)}
                  className="px-4 py-2 bg-[#6366F1] text-white text-sm font-semibold rounded-lg hover:bg-[#4F46E5] transition-colors"
                  data-testid="settings-vacation-save"
                >
                  {vacationDate ? "Set" : "Clear"}
                </button>
              </div>
              {user?.vacationUntil && (
                <p className="text-xs text-[#A1A1AA] mt-2">
                  Emails paused until {new Date(user.vacationUntil).toLocaleDateString()}
                </p>
              )}
            </div>
          </div>
        </section>

        <section>
          <div className="rounded-xl border border-[#F0F0F2] divide-y divide-[#F0F0F2]">
            <button
              onClick={() => { logout.mutate(); navigate("/"); }}
              className="w-full flex items-center gap-3 px-4 py-4 text-[#52525B] hover:bg-[#F7F7FC] transition-colors"
              data-testid="settings-logout-btn"
            >
              <LogOut className="w-4.5 h-4.5" />
              <span className="text-[15px] font-medium">Log out</span>
            </button>
            <button
              onClick={() => setShowDeleteConfirm(!showDeleteConfirm)}
              className="w-full flex items-center gap-3 px-4 py-4 text-red-500 hover:bg-red-50 transition-colors"
              data-testid="settings-delete-btn"
            >
              <Trash2 className="w-4.5 h-4.5" />
              <span className="text-[15px] font-medium">Delete account</span>
            </button>
          </div>

          {showDeleteConfirm && (
            <div className="mt-3 rounded-xl border border-red-200 bg-red-50 p-4">
              <div className="flex items-start gap-2 mb-3">
                <AlertTriangle className="w-4 h-4 text-red-500 mt-0.5 flex-shrink-0" />
                <p className="text-sm text-red-700">This is permanent. Type DELETE to confirm.</p>
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={deleteText}
                  onChange={(e) => setDeleteText(e.target.value)}
                  placeholder="Type DELETE"
                  className="flex-1 px-3 py-2 text-sm border border-red-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-200"
                  data-testid="settings-delete-confirm-input"
                />
                <button
                  onClick={() => deleteText === "DELETE" && deleteMutation.mutate()}
                  disabled={deleteText !== "DELETE"}
                  className="px-4 py-2 bg-red-500 text-white text-sm font-semibold rounded-lg disabled:opacity-40"
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
