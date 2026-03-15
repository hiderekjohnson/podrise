import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Plus, Pencil, Trash2, ExternalLink, Bold, Italic, Link as LinkIcon } from "lucide-react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";

interface Advertiser {
  id: number;
  message: string;
  link: string;
  createdAt: string | null;
}

function stripHtml(html: string): string {
  const tmp = document.createElement("div");
  tmp.innerHTML = html;
  return tmp.textContent || tmp.innerText || "";
}

function RichTextEditor({
  content,
  onChange,
  charCount,
  maxChars,
}: {
  content: string;
  onChange: (html: string) => void;
  charCount: number;
  maxChars: number;
}) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: false,
        codeBlock: false,
        blockquote: false,
        bulletList: false,
        orderedList: false,
        horizontalRule: false,
        code: false,
      }),
      Link.configure({
        openOnClick: false,
        HTMLAttributes: { target: "_blank", rel: "noopener noreferrer" },
      }),
    ],
    content,
    onUpdate: ({ editor }) => {
      onChange(editor.getHTML());
    },
    editorProps: {
      attributes: {
        class: "prose prose-sm max-w-none focus:outline-none min-h-[80px] px-3 py-2 text-sm",
      },
    },
  });

  if (!editor) return null;

  const addLink = () => {
    const url = prompt("Enter URL:");
    if (!url) return;
    try {
      const parsed = new URL(url);
      if (!["http:", "https:"].includes(parsed.protocol)) return;
    } catch {
      return;
    }
    if (editor.state.selection.empty) {
      const label = prompt("Enter link text:") || url;
      editor.chain().focus().insertContent({
        type: "text",
        text: label,
        marks: [{ type: "link", attrs: { href: url } }],
      }).run();
    } else {
      editor.chain().focus().setLink({ href: url }).run();
    }
  };

  const isOverLimit = charCount > maxChars;

  return (
    <div className="border border-black/[0.08] rounded-xl overflow-hidden bg-white dark:bg-black/20">
      <div className="flex items-center gap-1 px-2 py-1.5 border-b border-black/[0.06] bg-black/[0.02]">
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleBold().run()}
          className={`p-1.5 rounded-md transition-colors ${editor.isActive("bold") ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground hover:bg-black/[0.04]"}`}
          data-testid="button-bold"
          title="Bold"
        >
          <Bold className="w-4 h-4" />
        </button>
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleItalic().run()}
          className={`p-1.5 rounded-md transition-colors ${editor.isActive("italic") ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground hover:bg-black/[0.04]"}`}
          data-testid="button-italic"
          title="Italic"
        >
          <Italic className="w-4 h-4" />
        </button>
        <button
          type="button"
          onClick={addLink}
          className={`p-1.5 rounded-md transition-colors ${editor.isActive("link") ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground hover:bg-black/[0.04]"}`}
          data-testid="button-link"
          title="Insert link"
        >
          <LinkIcon className="w-4 h-4" />
        </button>
        <div className="flex-1" />
        <span className={`text-xs font-medium px-2 ${isOverLimit ? "text-red-500" : "text-muted-foreground"}`} data-testid="text-char-count">
          {charCount}/{maxChars}
        </span>
      </div>
      <EditorContent editor={editor} data-testid="input-rich-text" />
    </div>
  );
}

export default function AdvertisersAdmin() {
  const { toast } = useToast();
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [messageHtml, setMessageHtml] = useState("");
  const MAX_CHARS = 300;

  const charCount = stripHtml(messageHtml).length;

  const { data: advertisers, isLoading } = useQuery<Advertiser[]>({
    queryKey: ["/api/admin/advertisers"],
  });

  const createMutation = useMutation({
    mutationFn: (data: { message: string }) =>
      apiRequest("POST", "/api/admin/advertisers", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/advertisers"] });
      toast({ title: "Created", description: "Advertiser added." });
      resetForm();
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err?.message || "Failed to create", variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: { message: string } }) =>
      apiRequest("PATCH", `/api/admin/advertisers/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/advertisers"] });
      toast({ title: "Updated", description: "Advertiser updated." });
      resetForm();
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err?.message || "Failed to update", variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/admin/advertisers/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/advertisers"] });
      toast({ title: "Deleted", description: "Advertiser removed." });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to delete.", variant: "destructive" });
    },
  });

  const resetForm = () => {
    setShowForm(false);
    setEditingId(null);
    setMessageHtml("");
  };

  const startEdit = (ad: Advertiser) => {
    setEditingId(ad.id);
    setMessageHtml(ad.message);
    setShowForm(true);
  };

  const handleSubmit = () => {
    const plainText = stripHtml(messageHtml);
    if (!plainText.trim()) {
      toast({ title: "Validation", description: "Message is required.", variant: "destructive" });
      return;
    }
    if (plainText.length > MAX_CHARS) {
      toast({ title: "Validation", description: `Message exceeds ${MAX_CHARS} characters.`, variant: "destructive" });
      return;
    }
    const payload = { message: messageHtml };
    if (editingId) {
      updateMutation.mutate({ id: editingId, data: payload });
    } else {
      createMutation.mutate(payload);
    }
  };

  const isSaving = createMutation.isPending || updateMutation.isPending;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-foreground" data-testid="text-advertisers-title">Advertisers</h2>
          <p className="text-sm text-muted-foreground">Manage ad messages for recap emails.</p>
        </div>
        {!showForm && (
          <button
            onClick={() => { resetForm(); setShowForm(true); }}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold bg-primary text-white hover:bg-primary/90 transition-colors"
            data-testid="button-add-advertiser"
          >
            <Plus className="w-4 h-4" />
            Add Advertiser
          </button>
        )}
      </div>

      {showForm && (
        <div className="glass-panel rounded-2xl p-5 space-y-4" data-testid="section-advertiser-form">
          <h3 className="text-sm font-bold text-foreground">
            {editingId ? "Edit Advertiser" : "New Advertiser"}
          </h3>

          <div>
            <label className="block text-xs font-semibold text-muted-foreground mb-1.5">
              Ad Message (bold, italic, links supported)
            </label>
            <RichTextEditor
              content={messageHtml}
              onChange={setMessageHtml}
              charCount={charCount}
              maxChars={MAX_CHARS}
            />
            {charCount > MAX_CHARS && (
              <p className="text-xs text-red-500 mt-1" data-testid="text-char-error">
                Message is {charCount - MAX_CHARS} characters over the limit.
              </p>
            )}
          </div>


          <div className="flex items-center gap-2 pt-1">
            <button
              onClick={handleSubmit}
              disabled={isSaving || charCount > MAX_CHARS || charCount === 0}
              className="px-4 py-2 rounded-xl text-sm font-bold bg-primary text-white hover:bg-primary/90 transition-colors disabled:opacity-50"
              data-testid="button-save-advertiser"
            >
              {isSaving ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : editingId ? (
                "Update"
              ) : (
                "Create"
              )}
            </button>
            <button
              onClick={resetForm}
              className="px-4 py-2 rounded-xl text-sm font-bold text-muted-foreground hover:text-foreground hover:bg-black/[0.04] transition-colors"
              data-testid="button-cancel-advertiser"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
        </div>
      ) : !advertisers || advertisers.length === 0 ? (
        <div className="glass-panel rounded-2xl p-8 text-center">
          <p className="text-sm text-muted-foreground" data-testid="text-no-advertisers">No advertisers yet. Click "Add Advertiser" to create one.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {advertisers.map((ad) => (
            <div
              key={ad.id}
              className="glass-panel rounded-2xl p-4 flex items-start justify-between gap-4"
              data-testid={`card-advertiser-${ad.id}`}
            >
              <div className="flex-1 min-w-0">
                <div
                  className="text-sm text-foreground prose prose-sm max-w-none [&_a]:text-primary [&_a]:underline"
                  dangerouslySetInnerHTML={{ __html: ad.message }}
                  data-testid={`text-advertiser-message-${ad.id}`}
                />
                {ad.link && (
                  <div className="flex items-center gap-1.5 mt-2">
                    <ExternalLink className="w-3 h-3 text-muted-foreground shrink-0" />
                    <a
                      href={ad.link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-primary hover:underline truncate"
                      data-testid={`link-advertiser-url-${ad.id}`}
                    >
                      {ad.link}
                    </a>
                  </div>
                )}
                {ad.createdAt && (
                  <p className="text-xs text-muted-foreground mt-1">
                    Created {new Date(ad.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button
                  onClick={() => startEdit(ad)}
                  className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-black/[0.04] transition-colors"
                  data-testid={`button-edit-advertiser-${ad.id}`}
                  title="Edit"
                >
                  <Pencil className="w-4 h-4" />
                </button>
                <button
                  onClick={() => {
                    if (confirm("Delete this advertiser?")) {
                      deleteMutation.mutate(ad.id);
                    }
                  }}
                  className="p-2 rounded-lg text-muted-foreground hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors"
                  data-testid={`button-delete-advertiser-${ad.id}`}
                  title="Delete"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
