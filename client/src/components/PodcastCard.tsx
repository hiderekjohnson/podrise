import { Check } from "lucide-react";
import { motion } from "framer-motion";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface Podcast {
  id: string;
  name: string;
  color: string;
  initials: string;
}

interface PodcastCardProps {
  podcast: Podcast;
  isSelected: boolean;
  onClick: () => void;
}

export function PodcastCard({ podcast, isSelected, onClick }: PodcastCardProps) {
  return (
    <motion.button
      type="button"
      whileHover={{ y: -4 }}
      whileTap={{ scale: 0.96 }}
      onClick={onClick}
      className={cn(
        "relative flex flex-col items-center gap-3 p-4 rounded-2xl border-2 transition-colors text-left",
        isSelected 
          ? "border-primary bg-primary/5" 
          : "border-transparent hover:bg-black/[0.02]"
      )}
    >
      <div 
        className={cn(
          "w-20 h-20 sm:w-24 sm:h-24 rounded-2xl flex items-center justify-center text-2xl font-display font-bold shadow-sm transition-transform",
          podcast.color
        )}
      >
        {podcast.initials}
      </div>
      
      <span className="font-semibold text-sm sm:text-base text-foreground text-center line-clamp-2">
        {podcast.name}
      </span>

      {isSelected && (
        <motion.div
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="absolute top-3 right-3 w-6 h-6 bg-primary text-primary-foreground rounded-full flex items-center justify-center shadow-md"
        >
          <Check className="w-3.5 h-3.5" strokeWidth={3} />
        </motion.div>
      )}
    </motion.button>
  );
}
