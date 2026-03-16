import { useRoute } from "wouter";
import { useQuery } from "@tanstack/react-query";
import ShopItemDetailPage from "./ShopItemDetailPage";
import type { BookData, ProductData } from "./ShopItemDetailPage";
import { SiteHeader } from "@/components/SiteHeader";
import { Footer } from "@/components/Footer";
import { Link } from "wouter";
import { ShoppingBag, AlertCircle } from "lucide-react";

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
  const [, params] = useRoute("/shop/:slug");
  const slug = params?.slug || "";

  const { data: bookData, isLoading: bookLoading, error: bookError } = useQuery<BookData>({
    queryKey: ["/api/bookstore", slug],
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
        <SiteHeader />
        <div className="flex-1 flex items-center justify-center">
          <div className="w-8 h-8 border-4 border-[#6366F1] border-t-transparent rounded-full animate-spin" />
        </div>
      </div>
    );
  }

  if (isServerError(bookError)) {
    return (
      <div className="min-h-screen flex flex-col bg-[#F7F7FC] dark:bg-[#08080F]">
        <SiteHeader />
        <div className="flex-1 flex flex-col items-center justify-center gap-4">
          <AlertCircle className="w-12 h-12 text-red-400/60" />
          <h1 className="text-xl font-bold text-[#09090B] dark:text-white" data-testid="heading-error">Something went wrong</h1>
          <p className="text-[#A1A1AA] text-sm">Please try refreshing the page.</p>
          <Link href="/shop" className="text-[#6366F1] hover:text-[#6366F1]/80 font-medium" data-testid="link-back-shop">Back to Shop</Link>
        </div>
        <Footer />
      </div>
    );
  }

  if (bookData) {
    return <ShopItemDetailPage itemKind="book" bookData={bookData} />;
  }

  if (shouldTryProduct && productLoading) {
    return (
      <div className="min-h-screen flex flex-col bg-[#F7F7FC] dark:bg-[#08080F]">
        <SiteHeader />
        <div className="flex-1 flex items-center justify-center">
          <div className="w-8 h-8 border-4 border-[#6366F1] border-t-transparent rounded-full animate-spin" />
        </div>
      </div>
    );
  }

  if (productData) {
    return <ShopItemDetailPage itemKind="product" productData={productData} />;
  }

  return (
    <div className="min-h-screen flex flex-col bg-[#F7F7FC] dark:bg-[#08080F]">
      <SiteHeader />
      <div className="flex-1 flex flex-col items-center justify-center gap-4">
        <ShoppingBag className="w-12 h-12 text-[#A1A1AA]/30" />
        <h1 className="text-xl font-bold text-[#09090B] dark:text-white" data-testid="heading-not-found">Item not found</h1>
        <Link href="/shop" className="text-[#6366F1] hover:text-[#6366F1]/80 font-medium" data-testid="link-back-shop">Back to Shop</Link>
      </div>
      <Footer />
    </div>
  );
}
