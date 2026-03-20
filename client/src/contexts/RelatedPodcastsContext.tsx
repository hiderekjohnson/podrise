import { createContext, useContext, useState, useCallback, useEffect } from "react";

export interface RelatedPodcast {
  slug: string;
  name: string;
  category: string;
  artworkUrl?: string;
}

interface RelatedPodcastsContextType {
  podcasts: RelatedPodcast[];
  setRelatedPodcasts: (podcasts: RelatedPodcast[]) => void;
  clearRelatedPodcasts: () => void;
}

const RelatedPodcastsContext = createContext<RelatedPodcastsContextType>({
  podcasts: [],
  setRelatedPodcasts: () => {},
  clearRelatedPodcasts: () => {},
});

export function RelatedPodcastsProvider({ children }: { children: React.ReactNode }) {
  const [podcasts, setPodcasts] = useState<RelatedPodcast[]>([]);

  const setRelatedPodcasts = useCallback((newPodcasts: RelatedPodcast[]) => {
    setPodcasts(newPodcasts);
  }, []);

  const clearRelatedPodcasts = useCallback(() => {
    setPodcasts([]);
  }, []);

  return (
    <RelatedPodcastsContext.Provider value={{ podcasts, setRelatedPodcasts, clearRelatedPodcasts }}>
      {children}
    </RelatedPodcastsContext.Provider>
  );
}

export function useRelatedPodcasts() {
  return useContext(RelatedPodcastsContext);
}

export function useSetRelatedPodcasts(podcasts: RelatedPodcast[]) {
  const { setRelatedPodcasts, clearRelatedPodcasts } = useRelatedPodcasts();
  const serialized = JSON.stringify(podcasts);
  useEffect(() => {
    if (podcasts.length > 0) {
      setRelatedPodcasts(podcasts);
    }
    return () => clearRelatedPodcasts();
  }, [serialized]);
}
