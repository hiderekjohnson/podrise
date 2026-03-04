import { useState } from "react";
import { useLocation } from "wouter";
import { Loader2 } from "lucide-react";
import { motion } from "framer-motion";
import { useRegister, useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { PodcastSearch } from "@/components/PodcastSearch";
import logoImage from "@assets/image_1772640789953.png";

interface SelectedPodcast {
  id: string;
  name: string;
  artworkUrl: string;
}

const READING_LENGTHS = [5, 10, 15, 20];

export default function Home() {
  const [, navigate] = useLocation();
  const { data: user } = useAuth();
  const { toast } = useToast();
  const { mutate: register, isPending } = useRegister();

  const [selectedPodcasts, setSelectedPodcasts] = useState<SelectedPodcast[]>([]);
  const [readingLength, setReadingLength] = useState<number>(10);
  const [email, setEmail] = useState("");

  if (user) {
    navigate("/dashboard");
    return null;
  }

  const handleAdd = (podcast: SelectedPodcast) => {
    setSelectedPodcasts((prev) => [...prev, podcast]);
  };

  const handleRemove = (id: string) => {
    setSelectedPodcasts((prev) => prev.filter((p) => p.id !== id));
  };

  const handleSubmit = () => {
    if (selectedPodcasts.length === 0) {
      toast({
        title: "Almost there!",
        description: "Please select at least one podcast.",
        variant: "destructive",
      });
      return;
    }

    if (!email || !/^\S+@\S+\.\S+$/.test(email)) {
      toast({
        title: "Invalid email",
        description: "Please enter a valid email address.",
        variant: "destructive",
      });
      return;
    }

    register(
      {
        podcasts: selectedPodcasts.map((p) => JSON.stringify(p)),
        readingLength,
        email,
      },
      {
        onSuccess: () => {
          toast({
            title: "Success!",
            description: "Your digest has been created. Redirecting to your dashboard...",
          });
          navigate("/dashboard");
        },
        onError: (err) => {
          toast({
            title: "Something went wrong",
            description: err.message.includes("400")
              ? "An account with this email already exists. Try logging in."
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
          className="mx-auto h-20 md:h-28 mb-6 object-contain"
        />
        <p className="text-lg text-muted-foreground max-w-lg mx-auto">
          All your favorite podcasts, recapped in one daily email.
        </p>
      </div>

      <div className="w-full max-w-3xl glass-panel rounded-3xl p-6 sm:p-10 flex flex-col gap-12 relative">
        <section className="flex flex-col gap-6">
          <div className="space-y-1">
            <h2 className="text-xl sm:text-2xl font-display font-bold text-foreground flex items-center gap-3">
              <span className="flex items-center justify-center w-8 h-8 rounded-full bg-primary/10 text-primary text-sm">1</span>
              Which podcasts do you want?
            </h2>
            <p className="text-muted-foreground text-sm sm:text-base ml-11">
              Search and add your favorites to get started.
            </p>
          </div>

          <div className="ml-0 sm:ml-11">
            <PodcastSearch
              selectedPodcasts={selectedPodcasts}
              onAdd={handleAdd}
              onRemove={handleRemove}
            />
          </div>
        </section>

        <section className="flex flex-col gap-6">
          <div className="space-y-1">
            <h2 className="text-xl sm:text-2xl font-display font-bold text-foreground flex items-center gap-3">
              <span className="flex items-center justify-center w-8 h-8 rounded-full bg-primary/10 text-primary text-sm">2</span>
              Set your reading length
            </h2>
            <p className="text-muted-foreground text-sm sm:text-base ml-11">
              How much time do you have to read every day?
            </p>
          </div>

          <div className="ml-0 sm:ml-11">
            <div className="flex bg-black/[0.04] p-1.5 rounded-2xl w-full max-w-md">
              {READING_LENGTHS.map((length) => {
                const isActive = readingLength === length;
                return (
                  <button
                    key={length}
                    data-testid={`button-reading-${length}`}
                    onClick={() => setReadingLength(length)}
                    className={`
                      relative flex-1 py-3 text-sm sm:text-base font-semibold rounded-xl transition-all duration-300
                      ${isActive ? "text-primary" : "text-muted-foreground"}
                    `}
                  >
                    {isActive && (
                      <motion.div
                        layoutId="activeTab"
                        className="absolute inset-0 bg-white shadow-sm rounded-xl border border-black/[0.04]"
                        transition={{ type: "spring", stiffness: 400, damping: 30 }}
                      />
                    )}
                    <span className="relative z-10">{length} min</span>
                  </button>
                );
              })}
            </div>
          </div>
        </section>

        <section className="flex flex-col gap-6">
          <div className="space-y-1">
            <h2 className="text-xl sm:text-2xl font-display font-bold text-foreground flex items-center gap-3">
              <span className="flex items-center justify-center w-8 h-8 rounded-full bg-primary/10 text-primary text-sm">3</span>
              Where should we send it?
            </h2>
          </div>

          <div className="ml-0 sm:ml-11 space-y-6">
            <input
              data-testid="input-email"
              type="email"
              placeholder="name@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full h-14 px-4 bg-black/[0.03] border border-black/[0.05] rounded-xl text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/30 transition-all font-medium text-lg"
            />

            <div className="space-y-4 pt-4">
              <button
                data-testid="button-finish"
                onClick={handleSubmit}
                disabled={isPending}
                className="w-full h-16 flex items-center justify-center gap-2 rounded-2xl font-display font-bold text-lg bg-primary text-primary-foreground shadow-xl shadow-primary/25 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
              >
                {isPending ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    Creating your digest...
                  </>
                ) : (
                  "CREATE MY PODCAST RECAP"
                )}
              </button>

              <p className="text-center text-sm text-muted-foreground">
                We'll send you your first daily brief right now, based on the last week.{" "}
                <br className="hidden sm:block" />
                Future briefs will only cover the previous day.
              </p>

              <p className="text-center text-sm text-muted-foreground">
                Already have an account?{" "}
                <button
                  data-testid="link-login"
                  onClick={() => navigate("/login")}
                  className="text-primary font-semibold"
                >
                  Log in
                </button>
              </p>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
