import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { Shield, Eye, EyeOff, Check, Loader2 } from "lucide-react";

export default function AdminSetup() {
  const [, navigate] = useLocation();
  const [token, setToken] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [userInfo, setUserInfo] = useState<{ email: string; name: string | null; role: string } | null>(null);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const t = params.get("token");
    if (!t) {
      setError("No invite token found. Please use the link from your invitation email.");
      setLoading(false);
      return;
    }
    setToken(t);
    fetch(`/api/admin/setup/verify?token=${t}`)
      .then(async (res) => {
        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.message || "Invalid invite link");
        }
        return res.json();
      })
      .then((data) => {
        setUserInfo(data);
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message);
        setLoading(false);
      });
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 8) return setError("Password must be at least 8 characters");
    if (password !== confirmPassword) return setError("Passwords don't match");
    setError("");
    setSubmitting(true);
    try {
      const res = await fetch("/api/admin/setup/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Setup failed");
      setDone(true);
      setTimeout(() => navigate("/admin"), 2000);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#FAFAFA] flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  if (done) {
    return (
      <div className="min-h-screen bg-[#FAFAFA] flex items-center justify-center p-4">
        <div className="w-full max-w-md bg-white rounded-2xl shadow-sm border border-black/[0.06] p-8 text-center">
          <div className="w-14 h-14 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-4">
            <Check className="w-7 h-7 text-green-600" />
          </div>
          <h1 className="text-xl font-bold text-foreground mb-2" data-testid="text-setup-success">Account Set Up</h1>
          <p className="text-sm text-muted-foreground">Redirecting you to the admin dashboard...</p>
        </div>
      </div>
    );
  }

  if (error && !userInfo) {
    return (
      <div className="min-h-screen bg-[#FAFAFA] flex items-center justify-center p-4">
        <div className="w-full max-w-md bg-white rounded-2xl shadow-sm border border-black/[0.06] p-8 text-center">
          <div className="w-14 h-14 rounded-full bg-red-100 flex items-center justify-center mx-auto mb-4">
            <Shield className="w-7 h-7 text-red-500" />
          </div>
          <h1 className="text-xl font-bold text-foreground mb-2">Invalid Invite</h1>
          <p className="text-sm text-muted-foreground" data-testid="text-setup-error">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#FAFAFA] flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-sm border border-black/[0.06] p-8">
        <div className="text-center mb-6">
          <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
            <Shield className="w-7 h-7 text-primary" />
          </div>
          <h1 className="text-xl font-bold text-foreground" data-testid="text-setup-heading">Set Up Your Admin Account</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {userInfo?.email} &middot; <span className="capitalize">{userInfo?.role}</span>
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="text-sm font-semibold text-foreground mb-1.5 block">Password</label>
            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="At least 8 characters"
                className="w-full h-11 px-4 pr-10 bg-white border border-black/[0.1] rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/30"
                data-testid="input-setup-password"
                required
                minLength={8}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                data-testid="button-toggle-password"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <div>
            <label className="text-sm font-semibold text-foreground mb-1.5 block">Confirm Password</label>
            <input
              type={showPassword ? "text" : "password"}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Re-enter your password"
              className="w-full h-11 px-4 bg-white border border-black/[0.1] rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/30"
              data-testid="input-setup-confirm-password"
              required
              minLength={8}
            />
          </div>

          {error && (
            <p className="text-sm text-red-500 font-medium" data-testid="text-setup-form-error">{error}</p>
          )}

          <button
            type="submit"
            disabled={submitting || password.length < 8 || password !== confirmPassword}
            className="w-full h-11 rounded-xl font-bold text-sm bg-primary text-white hover:brightness-105 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
            data-testid="button-setup-submit"
          >
            {submitting ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : "Activate Account"}
          </button>
        </form>
      </div>
    </div>
  );
}
