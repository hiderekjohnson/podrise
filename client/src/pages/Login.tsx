import { useState } from "react";
import { useLocation } from "wouter";
import { Mail, ArrowRight, Loader2 } from "lucide-react";
import { useLogin, useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import faviconPath from "@assets/image_1772642558577.png";

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
    <div className="min-h-screen flex flex-col items-center justify-center px-4 sm:px-6 lg:px-8">
      <div className="text-center mb-8">
        <div className="flex items-center justify-center gap-2.5 mb-8">
          <img
            src={faviconPath}
            alt="PodCap"
            className="w-10 h-10 object-contain"
            data-testid="img-logo"
          />
          <span className="font-display font-bold text-xl text-foreground">PodCap</span>
        </div>
        <h1 className="text-3xl md:text-4xl font-display font-bold text-foreground mb-3">
          Welcome Back
        </h1>
        <p className="text-base text-muted-foreground max-w-md mx-auto">
          Enter your email to access your PodCap dashboard.
        </p>
      </div>

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
            disabled={isPending}
            className="w-full h-12 flex items-center justify-center gap-2 rounded-xl font-display font-bold text-base bg-primary text-primary-foreground shadow-lg shadow-primary/20 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
          >
            {isPending ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <>
                Log In
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
