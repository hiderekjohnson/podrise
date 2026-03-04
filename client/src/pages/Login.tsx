import { useState } from "react";
import { useLocation } from "wouter";
import { Mail, ArrowRight, Loader2 } from "lucide-react";
import { useLogin, useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import logoImage from "@assets/image_1772640789953.png";

export default function Login() {
  const [, navigate] = useLocation();
  const { data: user } = useAuth();
  const { toast } = useToast();
  const { mutate: login, isPending } = useLogin();
  const [email, setEmail] = useState("");

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

    login(
      { email },
      {
        onSuccess: () => {
          navigate("/dashboard");
        },
        onError: (err) => {
          toast({
            title: "Login failed",
            description: err.message.includes("404")
              ? "No account found with this email. Please sign up first."
              : err.message,
            variant: "destructive",
          });
        },
      }
    );
  };

  return (
    <div className="min-h-screen py-12 px-4 sm:px-6 lg:px-8 flex flex-col items-center justify-center">
      <div className="text-center mb-10">
        <img
          src={logoImage}
          alt="PodCap"
          className="mx-auto w-[260px] md:w-[320px] mb-4 object-contain select-none pointer-events-none"
          style={{ filter: "drop-shadow(0 0 40px rgba(56, 152, 236, 0.15))" }}
        />
        <h2 className="text-2xl md:text-3xl font-display font-bold text-foreground mb-2">
          Welcome Back
        </h2>
        <p className="text-base text-muted-foreground max-w-md mx-auto">
          Enter your email to access your podcast recap dashboard.
        </p>
      </div>

      <div className="w-full max-w-md glass-panel rounded-3xl p-8">
        <form onSubmit={handleSubmit} className="flex flex-col gap-6">
          <div className="relative group">
            <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground w-5 h-5 transition-colors group-focus-within:text-primary" />
            <input
              data-testid="input-login-email"
              type="email"
              placeholder="name@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full h-14 pl-12 pr-4 bg-white/[0.04] border border-white/[0.08] rounded-xl text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/40 transition-all font-medium"
            />
          </div>

          <button
            data-testid="button-login"
            type="submit"
            disabled={isPending}
            className="w-full h-14 flex items-center justify-center gap-2 rounded-2xl font-display font-bold text-lg bg-primary text-primary-foreground shadow-lg shadow-primary/20 disabled:opacity-50 disabled:cursor-not-allowed transition-all hover:brightness-110"
          >
            {isPending ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <>
                Log In
                <ArrowRight className="w-5 h-5" />
              </>
            )}
          </button>
        </form>

        <div className="mt-6 text-center">
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
