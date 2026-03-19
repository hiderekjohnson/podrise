import { useRoute } from "wouter";
import { useQuery } from "@tanstack/react-query";
import ShopItemDetailPage from "./ShopItemDetailPage";
import type { BookData, ProductData } from "./ShopItemDetailPage";
import { SiteHeader } from "@/components/SiteHeader";
import { Footer } from "@/components/Footer";
import { Link } from "wouter";
import { ShoppingBag, AlertCircle, ArrowRight, Mic, Users, TrendingUp } from "lucide-react";
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
          <Link href="/shop" className="text-[#6366F1] hover:text-[#6366F1]/80 font-medium" data-testid="link-back-shop">Back to Pod Shop</Link>
        </div>
        {!isLoggedIn && <Footer />}
      </div>
    );
  }

  if (bookData && !isLoggedIn) {
    const mentionCount = bookData.mentionCount || 0;
    const bookName = bookData.name || "this book";
    const hasMentions = mentionCount > 0;
    return (
      <div className="relative">
        <div className="pointer-events-none select-none overflow-hidden max-h-screen" aria-hidden="true">
          <ShopItemDetailPage itemKind="book" bookData={bookData} isLoggedIn={false} />
        </div>

        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center px-4" role="dialog" aria-modal="true" data-testid="overlay-book-gate">
          <div className="w-full max-w-lg rounded-2xl overflow-hidden shadow-2xl" data-testid="modal-book-gate">
            <div className="bg-[#6366F1] px-8 pt-8 pb-8">
              <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-white/30 bg-white/10 mb-5">
                <Mic className="w-4 h-4 text-white" />
                <span className="text-white text-xs font-semibold tracking-wide uppercase" data-testid="text-book-pill">
                  {bookName}{hasMentions ? ` · ${mentionCount} MENTION${mentionCount !== 1 ? "S" : ""}` : ""}
                </span>
              </div>
              <h1 className="text-2xl sm:text-3xl font-bold text-white leading-tight mb-3" data-testid="heading-book-gate">
                {hasMentions
                  ? `See which ${mentionCount} episode${mentionCount !== 1 ? "s" : ""} recommended this book`
                  : "See which episodes recommended this book"}
              </h1>
              <p className="text-white/80 text-[15px]" data-testid="text-book-gate-subtitle">
                Free account. We listened so you didn't have to.
              </p>
            </div>

            <div className="bg-white dark:bg-[#18181B] px-8 py-8 space-y-6">
              <div className="flex items-start gap-4" data-testid="value-prop-episodes">
                <div className="flex-shrink-0 w-10 h-10 rounded-full bg-[#6366F1]/10 flex items-center justify-center">
                  <Mic className="w-5 h-5 text-[#6366F1]" />
                </div>
                <p className="text-[15px] text-[#3F3F46] dark:text-[#D4D4D8] leading-relaxed">
                  Every episode where <strong>{bookName}</strong> was mentioned — with the exact quote and context
                </p>
              </div>
              <div className="flex items-start gap-4" data-testid="value-prop-hosts">
                <div className="flex-shrink-0 w-10 h-10 rounded-full bg-[#6366F1]/10 flex items-center justify-center">
                  <Users className="w-5 h-5 text-[#6366F1]" />
                </div>
                <p className="text-[15px] text-[#3F3F46] dark:text-[#D4D4D8] leading-relaxed">
                  Which <strong>hosts and guests</strong> recommended it — and what they said about it
                </p>
              </div>
              <div className="flex items-start gap-4" data-testid="value-prop-briefings">
                <div className="flex-shrink-0 w-10 h-10 rounded-full bg-[#6366F1]/10 flex items-center justify-center">
                  <TrendingUp className="w-5 h-5 text-[#6366F1]" />
                </div>
                <p className="text-[15px] text-[#3F3F46] dark:text-[#D4D4D8] leading-relaxed">
                  Daily briefings from <strong>200+ podcasts</strong> — organized by your industry and interests
                </p>
              </div>

              <Link
                href="/register"
                className="flex items-center justify-center gap-2 w-full py-3 rounded-xl border-2 border-[#09090B] dark:border-white bg-transparent hover:bg-[#09090B] hover:text-white dark:hover:bg-white dark:hover:text-[#09090B] text-[#09090B] dark:text-white font-semibold text-[15px] transition-colors"
                data-testid="button-signup-book-gate"
              >
                Create free account
                <ArrowRight className="w-4 h-4" />
              </Link>
              <p className="text-center text-[14px] text-[#71717A] dark:text-[#A1A1AA]" data-testid="text-login-link">
                Already have an account?{" "}
                <Link href="/login" className="text-[#6366F1] hover:text-[#6366F1]/80 font-medium underline" data-testid="link-login">
                  Log in
                </Link>
              </p>
            </div>
          </div>
        </div>
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
        <Link href="/shop" className="text-[#6366F1] hover:text-[#6366F1]/80 font-medium" data-testid="link-back-shop">Back to Pod Shop</Link>
      </div>
      {!isLoggedIn && <Footer />}
    </div>
  );
}
