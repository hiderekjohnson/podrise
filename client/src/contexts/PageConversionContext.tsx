import { createContext, useContext, useState, useCallback, useEffect } from "react";

export interface PageConversionData {
  pageType: "podcast" | "episode" | "topic" | "category" | "general";
  name: string;
  slug: string;
  artworkUrl?: string;
  hosts?: string[];
  description?: string;
  categoryType?: "industry" | "interest" | "role";
  itunesId?: string;
  episodeTitle?: string;
  podcastName?: string;
  podcastSlug?: string;
  podcastCount?: number;
}

interface PageConversionContextType {
  data: PageConversionData | null;
  setConversionData: (data: PageConversionData) => void;
  clearConversionData: () => void;
}

const PageConversionContext = createContext<PageConversionContextType>({
  data: null,
  setConversionData: () => {},
  clearConversionData: () => {},
});

export function PageConversionProvider({ children }: { children: React.ReactNode }) {
  const [data, setData] = useState<PageConversionData | null>(null);

  const setConversionData = useCallback((newData: PageConversionData) => {
    setData(newData);
  }, []);

  const clearConversionData = useCallback(() => {
    setData(null);
  }, []);

  return (
    <PageConversionContext.Provider value={{ data, setConversionData, clearConversionData }}>
      {children}
    </PageConversionContext.Provider>
  );
}

export function usePageConversion() {
  return useContext(PageConversionContext);
}

export function useSetConversion(data: PageConversionData | null) {
  const { setConversionData, clearConversionData } = usePageConversion();
  const serialized = data ? JSON.stringify(data) : null;
  useEffect(() => {
    if (data) {
      setConversionData(data);
    }
    return () => clearConversionData();
  }, [serialized]);
}
