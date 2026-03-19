import { useRoute } from "wouter";
import { useQuery } from "@tanstack/react-query";
import ShopItemDetailPage from "./ShopItemDetailPage";
import type { BookData, ProductData } from "./ShopItemDetailPage";
import { SiteHeader } from "@/components/SiteHeader";
import { Footer } from "@/components/Footer";
import { Link } from "wouter";
import { ShoppingBag, AlertCircle, ArrowRight, Lock } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";

function is404(error: unknown): boolean {
  if (!error) return false;
  if (error instanceof Error && error.message.startsWith("404")) return true;
  if (error instanceof Error && error.message.includes("404:")) return true;
  return false;
}

function isServerError(error: unknown): boolean {
  return !!error && !is404(error);
}

export default function ShopDetailRouter() {
  const { data: authUser } = useAuth();
  const isLoggedIn = !!authUser;
  const [, params] = useRoute("/shop/:slug");
  const slug = params?.slug || "";

  const { data: bookData, isLoading: bookLoading, error: bookError } = useQuery<BookData>({
    queryKey: ["/api/shop/book", slug],
    enabled: !!slug,
    retry: false,
  });

  const bookIs404 = is404(bookError);
  const shouldTryProduct = !!slug && bookIs404;

  const { data: productData, isLoading: productLoading, error: productError } = useQuery<ProductData>({
    queryKey: ["/api/shop/product", slug],
    enabled: shouldTryProduct,
    retry: false,
  });

  if (bookLoading) {
    return (
      <div className="min-h-screen flex flex-col bg-[#F7F7FC] dark:bg-[#08080F]">
        {!isLoggedIn && <SiteHeader />}
        <div className="flex-1 flex items-center justify-center">
          <div className="w-8 h-8 border-4 border-[#6366F1] border-t-transparent rounded-full animate-spin" />
        </div>
      </div>
    );
  }

  if (isServerError(bookError)) {
    return (
      <div className="min-h-screen flex flex-col bg-[#F7F7FC] dark:bg-[#08080F]">
        {!isLoggedIn && <SiteHeader />}
        <div className="flex-1 flex flex-col items-center justify-center gap-4">
          <AlertCircle className="w-12 h-12 text-red-400/60" />
          <h1 className="text-xl font-bold text-[#09090B] dark:text-white" data-testid="heading-error">Something went wrong</h1>
          <p className="text-[#A1A1AA] text-sm">Please try refreshing the page.</p>
          <Link href="/shop" className="text-[#6366F1] hover:text-[#6366F1]/80 font-medium" data-testid="link-back-shop">Back to Shop</Link>
        </div>
        {!isLoggedIn && <Footer />}
      </div>
    );
  }

  if (bookData && !isLoggedIn) {
    return (
      <div className="min-h-screen flex flex-col bg-[#F7F7FC] dark:bg-[#08080F]">
        <SiteHeader />
        <div className="flex-1 flex flex-col items-center justify-center gap-4 px-4">
          <div className="max-w-md text-center">
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-amber-500/10 mb-4">
              <Lock className="w-7 h-7 text-amber-600" />
            </div>
            <h1 className="text-2xl font-bold text-[#09090B] dark:text-white mb-2" data-testid="heading-book-gate">
              {bookData.name}
            </h1>
            {bookData.author && (
              <p className="text-[16px] text-[#A1A1AA] mb-4" data-testid="text-book-author">by {bookData.author}</p>
            )}
            <p className="text-[15px] text-[#52525B] dark:text-[#A1A1AA] mb-2" data-testid="text-book-gate-info">
              This book has been mentioned on {bookData.podcastCount} podcast{bookData.podcastCount !== 1 ? "s" : ""} across {bookData.mentionCount} episode{bookData.mentionCount !== 1 ? "s" : ""}.
            </p>
            <p className="text-[15px] text-[#52525B] dark:text-[#A1A1AA] mb-6">
              Sign up for a free PodRise account to see the full details, episode appearances, and cross-podcast recommendations.
            </p>
            <Link
              href="/register"
              className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-white font-semibold text-[15px] transition-colors shadow-sm"
              data-testid="button-signup-book-gate"
            >
              Sign Up Free
              <ArrowRight className="w-4 h-4" />
            </Link>
            <div className="mt-4">
              <Link href="/shop" className="text-[14px] text-[#6366F1] hover:text-[#6366F1]/80 font-medium" data-testid="link-back-shop">
                Back to Shop
              </Link>
            </div>
          </div>
        </div>
        <Footer />
      </div>
    );
  }

  if (bookData) {
    return <ShopItemDetailPage itemKind="book" bookData={bookData} isLoggedIn={isLoggedIn} />;
  }

  if (shouldTryProduct && productLoading) {
    return (
      <div className="min-h-screen flex flex-col bg-[#F7F7FC] dark:bg-[#08080F]">
        {!isLoggedIn && <SiteHeader />}
        <div className="flex-1 flex items-center justify-center">
          <div className="w-8 h-8 border-4 border-[#6366F1] border-t-transparent rounded-full animate-spin" />
        </div>
      </div>
    );
  }

  if (productData) {
    return <ShopItemDetailPage itemKind="product" productData={productData} isLoggedIn={isLoggedIn} />;
  }

  return (
    <div className="min-h-screen flex flex-col bg-[#F7F7FC] dark:bg-[#08080F]">
      {!isLoggedIn && <SiteHeader />}
      <div className="flex-1 flex flex-col items-center justify-center gap-4">
        <ShoppingBag className="w-12 h-12 text-[#A1A1AA]/30" />
        <h1 className="text-xl font-bold text-[#09090B] dark:text-white" data-testid="heading-not-found">Item not found</h1>
        <Link href="/shop" className="text-[#6366F1] hover:text-[#6366F1]/80 font-medium" data-testid="link-back-shop">Back to Shop</Link>
      </div>
      {!isLoggedIn && <Footer />}
    </div>
  );
}
