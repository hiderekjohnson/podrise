import { useState, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { Mail, ArrowRight, Loader2, CheckCircle2, AlertCircle } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { useMutation } from "@tanstack/react-query";
import logoPath from "@assets/Podcap_logo_1772731738179.png";

export default function Login() {
  const [, navigate] = useLocation();
  const { data: user } = useAuth();
  const { toast } = useToast();
  const [email, setEmail] = useState("");
  const [emailSent, setEmailSent] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const loginMutation = useMutation({
    mutationFn: (email: string) => apiRequest("POST", "/api/auth/login", { email }),
    onSuccess: () => {
      setEmailSent(true);
    },
    onError: (err: any) => {
      toast({
        title: "Login failed",
        description: err.message.includes("404")
          ? "No account found with this email. Please sign up first."
          : err.message || "Something went wrong. Please try again.",
        variant: "destructive",
      });
    },
  });

  const hasShownError = useRef(false);
  useEffect(() => {
    if (hasShownError.current) return;
    const params = new URLSearchParams(window.location.search);
    const error = params.get("error");
    if (error === "expired") {
      hasShownError.current = true;
      setErrorMessage("That login link has expired or was already used. Please request a new one.");
    } else if (error === "invalid") {
      hasShownError.current = true;
      setErrorMessage("That login link is invalid. Please try again.");
    }
  }, []);

  if (user) {
    navigate("/dashboard");
    return null;
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !/^\S+@\S+\.\S+$/.test(email)) {
      toast({
        title: "Invalid email",
        description: "Please enter a valid email address.",
        variant: "destructive",
      });
      return;
    }
    loginMutation.mutate(email);
  };

  if (emailSent) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-8">
          <div className="flex items-center justify-center mb-8">
            <img
              src={logoPath}
              alt="PodCap"
              className="h-10 object-contain"
              data-testid="img-logo"
            />
          </div>
        </div>

        <div className="w-full max-w-sm glass-panel rounded-2xl p-6 sm:p-8 text-center">
          <div className="w-16 h-16 rounded-2xl bg-green-50 flex items-center justify-center mx-auto mb-5">
            <CheckCircle2 className="w-8 h-8 text-green-600" />
          </div>
          <h1 className="text-2xl font-display font-bold text-foreground mb-2" data-testid="text-check-email">
            Check Your Email
          </h1>
          <p className="text-muted-foreground text-sm mb-1">
            We sent a login link to
          </p>
          <p className="font-semibold text-foreground text-sm mb-5" data-testid="text-sent-email">
            {email}
          </p>
          <p className="text-muted-foreground text-xs mb-6">
            The link expires in 15 minutes. Check your spam folder if you don't see it.
          </p>
          <button
            data-testid="button-back-to-login"
            onClick={() => { setEmailSent(false); loginMutation.reset(); }}
            className="text-sm text-primary font-semibold hover:underline"
          >
            Use a different email
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 sm:px-6 lg:px-8">
      <div className="text-center mb-8">
        <div className="flex items-center justify-center mb-8">
          <img
            src={logoPath}
            alt="PodCap"
            className="h-9 object-contain"
            data-testid="img-logo"
          />
        </div>
        <h1 className="text-3xl md:text-4xl font-display font-bold text-foreground mb-3">
          Welcome Back
        </h1>
        <p className="text-base text-muted-foreground max-w-md mx-auto">
          Enter your email and we'll send you a login link.
        </p>
      </div>

      {errorMessage && (
        <div className="w-full max-w-sm mb-4 flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4" data-testid="alert-login-error">
          <AlertCircle className="w-5 h-5 text-red-500 mt-0.5 flex-shrink-0" />
          <p className="text-sm text-red-700">{errorMessage}</p>
        </div>
      )}

      <div className="w-full max-w-sm glass-panel rounded-2xl p-6 sm:p-8">
        <form onSubmit={handleSubmit} className="flex flex-col gap-5">
          <div className="relative group">
            <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground w-5 h-5 transition-colors group-focus-within:text-primary" />
            <input
              data-testid="input-login-email"
              type="email"
              placeholder="name@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full h-12 pl-12 pr-4 bg-black/[0.03] border border-black/[0.06] rounded-xl text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/30 transition-all font-medium"
            />
          </div>

          <button
            data-testid="button-login"
            type="submit"
            disabled={loginMutation.isPending}
            className="w-full h-12 flex items-center justify-center gap-2 rounded-xl font-display font-bold text-base bg-primary text-primary-foreground shadow-lg shadow-primary/20 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
          >
            {loginMutation.isPending ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <>
                Send Login Link
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </form>

        <div className="mt-5 text-center">
          <p className="text-sm text-muted-foreground">
            Don't have an account?{" "}
            <button
              data-testid="link-signup"
              onClick={() => navigate("/")}
              className="text-primary font-semibold hover:underline"
            >
              Sign up
            </button>
          </p>
        </div>
      </div>
    </div>
  );
}
