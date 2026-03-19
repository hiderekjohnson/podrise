import { useState, useMemo, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  Search, ShoppingBag, BookOpen, Package, Image, Upload, X, Edit3,
  ExternalLink, CheckCircle2, XCircle, Clock, Filter, Loader2,
  ChevronLeft, ChevronRight, AlertTriangle, Save, Info, ThumbsUp, ThumbsDown,
} from "lucide-react";

type ItemType = "product" | "book";
type StatusFilter = "all" | "approved" | "pending" | "rejected";
type TypeFilter = "all" | "product" | "book";

interface ShopItem {
  id: number;
  type: ItemType;
  name: string;
  company: string | null;
  description: string | null;
  url: string | null;
  image_url: string | null;
  category: string | null;
  status: string;
  image_status: string | null;
  extra: Record<string, any>;
}

const ITEMS_PER_PAGE = 40;

function StatusBadge({ status }: { status: string }) {
  if (status === "approved")
    return <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-green-100 text-green-700" data-testid="badge-status-approved"><CheckCircle2 className="w-2.5 h-2.5" />Approved</span>;
  if (status === "rejected")
    return <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-100 text-red-700" data-testid="badge-status-rejected"><XCircle className="w-2.5 h-2.5" />Rejected</span>;
  return <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-yellow-100 text-yellow-700" data-testid="badge-status-pending"><Clock className="w-2.5 h-2.5" />Pending</span>;
}

function TypeBadge({ type }: { type: ItemType }) {
  if (type === "book")
    return <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700"><BookOpen className="w-2.5 h-2.5" />Book</span>;
  return <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-orange-100 text-orange-700"><Package className="w-2.5 h-2.5" />Product</span>;
}

function EditModal({ item, onClose, onSaved }: { item: ShopItem; onClose: () => void; onSaved: () => void }) {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState(item.name);
  const [description, setDescription] = useState(item.description || "");
  const [url, setUrl] = useState(item.url || "");
  const [imageUrl, setImageUrl] = useState(item.image_url || "");
  const [uploading, setUploading] = useState(false);
  const [previewFile, setPreviewFile] = useState<string | null>(null);

  const updateMutation = useMutation({
    mutationFn: async (data: { name: string; description: string; url: string; imageUrl: string }) => {
      await apiRequest("POST", `/api/admin/shop-items/${item.type}/${item.id}/update`, data);
    },
    onSuccess: () => {
      toast({ title: "Saved", description: `${item.type === "book" ? "Book" : "Product"} updated successfully` });
      onSaved();
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err?.message || "Failed to save", variant: "destructive" });
    },
  });

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      toast({ title: "Invalid file", description: "Please select an image file (PNG, JPG, WebP)", variant: "destructive" });
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast({ title: "File too large", description: "Max file size is 10MB", variant: "destructive" });
      return;
    }

    const reader = new FileReader();
    reader.onload = (ev) => setPreviewFile(ev.target?.result as string);
    reader.readAsDataURL(file);

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("image", file);
      formData.append("type", item.type);
      formData.append("id", String(item.id));

      const res = await fetch("/api/admin/shop-items/upload-image", {
        method: "POST",
        credentials: "include",
        body: formData,
      });
      if (!res.ok) throw new Error((await res.json()).message || "Upload failed");
      const result = await res.json();
      setImageUrl(result.imageUrl);
      toast({ title: "Uploaded", description: "Image uploaded successfully" });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/shop-items"] });
    } catch (err: any) {
      toast({ title: "Upload failed", description: err?.message || "Failed to upload image", variant: "destructive" });
      setPreviewFile(null);
    } finally {
      setUploading(false);
    }
  };

  const handleSave = () => {
    updateMutation.mutate({ name, description, url, imageUrl });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={onClose} data-testid="modal-edit-item">
      <div className="bg-white dark:bg-zinc-900 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto m-4" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-5 border-b border-border">
          <div className="flex items-center gap-3">
            <Edit3 className="w-5 h-5 text-primary" />
            <h2 className="text-lg font-bold" data-testid="text-edit-modal-title">Edit {item.type === "book" ? "Book" : "Product"}</h2>
            <TypeBadge type={item.type} />
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-muted transition-colors" data-testid="button-close-edit-modal">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-5">
          <div className="flex gap-5">
            <div className="shrink-0">
              <div className="w-[150px] h-[150px] rounded-xl overflow-hidden bg-muted/30 border border-dashed border-border flex items-center justify-center">
                {(previewFile || imageUrl) ? (
                  <img src={previewFile || imageUrl} alt={name} className="w-full h-full object-cover" data-testid="img-edit-preview" />
                ) : (
                  <Image className="w-10 h-10 text-muted-foreground/30" />
                )}
              </div>
              <div className="mt-3 space-y-2">
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                  className="w-full px-3 py-2 rounded-lg text-xs font-bold bg-primary text-white hover:bg-primary/90 transition-colors flex items-center justify-center gap-1.5 disabled:opacity-50"
                  data-testid="button-upload-image"
                >
                  {uploading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Upload className="w-3 h-3" />}
                  {uploading ? "Uploading..." : "Upload Image"}
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleFileUpload}
                  className="hidden"
                  data-testid="input-file-upload"
                />
                <div className="flex items-start gap-1.5 p-2 rounded-lg bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800">
                  <Info className="w-3.5 h-3.5 text-blue-600 shrink-0 mt-0.5" />
                  <p className="text-[10px] leading-snug text-blue-700 dark:text-blue-400" data-testid="text-image-dimensions-guide">
                    Recommended: 600x600px (1200x1200px for retina). Images display at 300x300px in product cards.
                  </p>
                </div>
              </div>
            </div>
            <div className="flex-1 space-y-4">
              <div>
                <label className="text-xs font-bold text-muted-foreground uppercase tracking-wide mb-1 block">Name</label>
                <input
                  type="text"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                  data-testid="input-edit-name"
                />
              </div>
              <div>
                <label className="text-xs font-bold text-muted-foreground uppercase tracking-wide mb-1 block">Description</label>
                <textarea
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  rows={3}
                  className="w-full px-3 py-2.5 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none"
                  data-testid="input-edit-description"
                />
              </div>
              <div>
                <label className="text-xs font-bold text-muted-foreground uppercase tracking-wide mb-1 block">URL</label>
                <input
                  type="text"
                  value={url}
                  onChange={e => setUrl(e.target.value)}
                  placeholder="https://..."
                  className="w-full px-3 py-2.5 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                  data-testid="input-edit-url"
                />
              </div>
              <div>
                <label className="text-xs font-bold text-muted-foreground uppercase tracking-wide mb-1 block">Image URL</label>
                <input
                  type="text"
                  value={imageUrl}
                  onChange={e => setImageUrl(e.target.value)}
                  placeholder={item.type === "book" ? "Use upload button for books" : "https://... or /uploads/..."}
                  disabled={item.type === "book"}
                  className="w-full px-3 py-2.5 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:opacity-50 disabled:cursor-not-allowed"
                  data-testid="input-edit-image-url"
                />
                {item.type === "book" && (
                  <p className="text-[10px] text-muted-foreground mt-1">Book images are managed via file upload only.</p>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 p-5 border-t border-border">
          <button
            onClick={onClose}
            className="px-4 py-2.5 rounded-xl text-sm font-bold text-muted-foreground hover:bg-muted transition-colors"
            data-testid="button-cancel-edit"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={updateMutation.isPending || !name.trim()}
            className="px-5 py-2.5 rounded-xl text-sm font-bold bg-primary text-white hover:bg-primary/90 transition-colors disabled:opacity-50 flex items-center gap-2"
            data-testid="button-save-edit"
          >
            {updateMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Save Changes
          </button>
        </div>
      </div>
    </div>
  );
}

export default function ShopManagement() {
  const { toast } = useToast();
  const [searchTerm, setSearchTerm] = useState("");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [page, setPage] = useState(1);
  const [editingItem, setEditingItem] = useState<ShopItem | null>(null);

  const statusMutation = useMutation({
    mutationFn: async ({ type, id, status }: { type: ItemType; id: number; status: string }) => {
      await apiRequest("POST", `/api/admin/shop-items/${type}/${id}/status`, { status });
    },
    onSuccess: (_data, variables) => {
      toast({ title: "Status updated", description: `Item ${variables.status}` });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/shop-items"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/products"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/shop-books"] });
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err?.message || "Failed to update status", variant: "destructive" });
    },
  });

  const { data, isLoading } = useQuery<{ items: ShopItem[]; stats: { total: number; books: number; products: number; approved: number; pending: number; rejected: number } }>({
    queryKey: ["/api/admin/shop-items"],
    queryFn: async () => {
      const res = await fetch("/api/admin/shop-items", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load");
      return res.json();
    },
  });

  const allItems = data?.items || [];
  const stats = data?.stats || { total: 0, books: 0, products: 0, approved: 0, pending: 0, rejected: 0 };

  const filtered = useMemo(() => {
    let result = allItems;
    if (searchTerm) {
      const q = searchTerm.toLowerCase();
      result = result.filter(item =>
        item.name.toLowerCase().includes(q) ||
        (item.company && item.company.toLowerCase().includes(q)) ||
        (item.category && item.category.toLowerCase().includes(q)) ||
        (item.description && item.description.toLowerCase().includes(q))
      );
    }
    if (typeFilter !== "all") {
      result = result.filter(item => item.type === typeFilter);
    }
    if (statusFilter !== "all") {
      result = result.filter(item => item.status === statusFilter);
    }
    return result;
  }, [allItems, searchTerm, typeFilter, statusFilter]);

  const totalPages = Math.ceil(filtered.length / ITEMS_PER_PAGE);
  const paginated = filtered.slice((page - 1) * ITEMS_PER_PAGE, page * ITEMS_PER_PAGE);

  const handleSaved = () => {
    setEditingItem(null);
    queryClient.invalidateQueries({ queryKey: ["/api/admin/shop-items"] });
    queryClient.invalidateQueries({ queryKey: ["/api/admin/products"] });
    queryClient.invalidateQueries({ queryKey: ["/api/admin/shop-books"] });
  };

  const typeButtons: { mode: TypeFilter; label: string; icon: typeof Package }[] = [
    { mode: "all", label: `All (${stats.total})`, icon: Filter },
    { mode: "book", label: `Books (${stats.books})`, icon: BookOpen },
    { mode: "product", label: `Products (${stats.products})`, icon: Package },
  ];

  const statusButtons: { mode: StatusFilter; label: string; color: string }[] = [
    { mode: "all", label: "All", color: "bg-gray-100 text-gray-700" },
    { mode: "approved", label: `Approved (${stats.approved})`, color: "bg-green-100 text-green-700" },
    { mode: "pending", label: `Pending (${stats.pending})`, color: "bg-yellow-100 text-yellow-700" },
    { mode: "rejected", label: `Rejected (${stats.rejected})`, color: "bg-red-100 text-red-700" },
  ];

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-lg font-bold flex items-center gap-2" data-testid="text-shop-management-title">
          <ShoppingBag className="w-5 h-5 text-primary" />
          Shop Management
        </h3>
        <p className="text-sm text-muted-foreground mt-1">
          Search, browse, and edit all shop items — books and products — in one place.
        </p>
      </div>

      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
        <div className="relative flex-1 w-full sm:w-auto">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search by name, company, or category..."
            value={searchTerm}
            onChange={e => { setSearchTerm(e.target.value); setPage(1); }}
            className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
            data-testid="input-shop-search"
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-bold text-muted-foreground uppercase tracking-wide mr-1">Type:</span>
        {typeButtons.map(({ mode, label, icon: Icon }) => (
          <button
            key={mode}
            onClick={() => { setTypeFilter(mode); setPage(1); }}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all ${
              typeFilter === mode ? "bg-primary/10 text-primary ring-2 ring-offset-1 ring-primary/30" : "bg-muted/50 text-muted-foreground hover:bg-muted"
            }`}
            data-testid={`filter-type-${mode}`}
          >
            <Icon className="w-3.5 h-3.5" />
            {label}
          </button>
        ))}

        <span className="text-xs font-bold text-muted-foreground uppercase tracking-wide mr-1 ml-3">Status:</span>
        {statusButtons.map(({ mode, label, color }) => (
          <button
            key={mode}
            onClick={() => { setStatusFilter(mode); setPage(1); }}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all ${
              statusFilter === mode ? color + " ring-2 ring-offset-1 ring-current" : "bg-muted/50 text-muted-foreground hover:bg-muted"
            }`}
            data-testid={`filter-status-${mode}`}
          >
            {label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-10">
          <ShoppingBag className="w-12 h-12 text-muted-foreground/30 mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">
            {searchTerm ? "No items match your search." : "No items found."}
          </p>
        </div>
      ) : (
        <>
          <div className="text-xs text-muted-foreground mb-1">{filtered.length} items found</div>
          <div className="grid grid-cols-1 gap-2">
            {paginated.map(item => {
              const imgSrc = item.type === "book"
                ? (item.image_url || null)
                : item.image_url;

              return (
                <div
                  key={`${item.type}-${item.id}`}
                  className="flex items-center gap-4 p-3 rounded-xl border border-border hover:border-primary/30 hover:bg-primary/[0.02] transition-all group"
                  data-testid={`card-shop-item-${item.type}-${item.id}`}
                >
                  <div className="w-[50px] h-[50px] rounded-lg overflow-hidden bg-muted/30 border border-border flex items-center justify-center shrink-0">
                    {imgSrc ? (
                      <img
                        src={imgSrc}
                        alt={item.name}
                        className="w-full h-full object-cover"
                        loading="lazy"
                        onError={e => { (e.target as HTMLImageElement).style.display = "none"; }}
                        data-testid={`img-shop-item-${item.type}-${item.id}`}
                      />
                    ) : (
                      <Image className="w-5 h-5 text-muted-foreground/30" />
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-bold truncate" data-testid={`text-shop-item-name-${item.type}-${item.id}`}>{item.name}</span>
                      <TypeBadge type={item.type} />
                      <StatusBadge status={item.status} />
                      {item.image_status && item.image_status !== "approved" && item.type === "product" && (
                        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-amber-50 text-amber-600 border border-amber-200">
                          img: {item.image_status}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 mt-0.5">
                      {item.company && <span className="text-xs text-muted-foreground truncate">{item.company}</span>}
                      {item.category && (
                        <span className="text-[10px] text-muted-foreground/70 truncate">{item.category}</span>
                      )}
                      {item.url && (
                        <a
                          href={item.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[10px] text-primary hover:underline flex items-center gap-0.5 shrink-0"
                          onClick={e => e.stopPropagation()}
                          data-testid={`link-shop-item-${item.type}-${item.id}`}
                        >
                          Link <ExternalLink className="w-2.5 h-2.5" />
                        </a>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    {item.status !== "approved" && (
                      <button
                        onClick={() => statusMutation.mutate({ type: item.type, id: item.id, status: "approved" })}
                        disabled={statusMutation.isPending}
                        className="px-2.5 py-2 rounded-lg text-xs font-bold bg-green-50 text-green-700 hover:bg-green-100 transition-colors flex items-center gap-1"
                        title="Approve"
                        data-testid={`button-approve-shop-item-${item.type}-${item.id}`}
                      >
                        <ThumbsUp className="w-3.5 h-3.5" />
                      </button>
                    )}
                    {item.status !== "rejected" && (
                      <button
                        onClick={() => statusMutation.mutate({ type: item.type, id: item.id, status: "rejected" })}
                        disabled={statusMutation.isPending}
                        className="px-2.5 py-2 rounded-lg text-xs font-bold bg-red-50 text-red-700 hover:bg-red-100 transition-colors flex items-center gap-1"
                        title="Reject"
                        data-testid={`button-reject-shop-item-${item.type}-${item.id}`}
                      >
                        <ThumbsDown className="w-3.5 h-3.5" />
                      </button>
                    )}
                    <button
                      onClick={() => setEditingItem(item)}
                      className="px-3 py-2 rounded-lg text-xs font-bold bg-primary/10 text-primary hover:bg-primary/20 transition-colors flex items-center gap-1.5"
                      data-testid={`button-edit-shop-item-${item.type}-${item.id}`}
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                      Edit
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-3 pt-2">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                className="px-3 py-1.5 rounded-lg text-xs font-bold bg-muted/50 hover:bg-muted disabled:opacity-30 transition-colors flex items-center gap-1"
                data-testid="button-shop-prev"
              >
                <ChevronLeft className="w-3 h-3" /> Previous
              </button>
              <span className="text-xs text-muted-foreground font-bold">
                Page {page} of {totalPages} · {filtered.length} items
              </span>
              <button
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="px-3 py-1.5 rounded-lg text-xs font-bold bg-muted/50 hover:bg-muted disabled:opacity-30 transition-colors flex items-center gap-1"
                data-testid="button-shop-next"
              >
                Next <ChevronRight className="w-3 h-3" />
              </button>
            </div>
          )}
        </>
      )}

      {editingItem && (
        <EditModal
          item={editingItem}
          onClose={() => setEditingItem(null)}
          onSaved={handleSaved}
        />
      )}
    </div>
  );
}
