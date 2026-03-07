import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Plus, Trash2, Loader2, Twitter, Users, ExternalLink } from "lucide-react";
import type { PodcastDirectoryEntry } from "@shared/schema";

export default function PodcastDirectory() {
  const { toast } = useToast();
  const [showForm, setShowForm] = useState(false);
  const [editEntry, setEditEntry] = useState<PodcastDirectoryEntry | null>(null);
  const [form, setForm] = useState({ itunesId: "", name: "", twitterHandle: "", hostHandle: "", followers: "" });

  const { data: entries, isLoading } = useQuery<PodcastDirectoryEntry[]>({
    queryKey: ["/api/admin/podcast-directory"],
  });

  const upsertMutation = useMutation({
    mutationFn: (data: typeof form) => apiRequest("POST", "/api/admin/podcast-directory", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/podcast-directory"] });
      toast({ title: editEntry ? "Entry updated" : "Entry added" });
      resetForm();
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/admin/podcast-directory/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/podcast-directory"] });
      toast({ title: "Entry deleted" });
    },
  });

  function resetForm() {
    setForm({ itunesId: "", name: "", twitterHandle: "", hostHandle: "", followers: "" });
    setShowForm(false);
    setEditEntry(null);
  }

  function startEdit(entry: PodcastDirectoryEntry) {
    setEditEntry(entry);
    setForm({
      itunesId: entry.itunesId,
      name: entry.name,
      twitterHandle: entry.twitterHandle || "",
      hostHandle: entry.hostHandle || "",
      followers: entry.followers?.toString() || "",
    });
    setShowForm(true);
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6" data-testid="podcast-directory-tab">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-bold text-foreground">Podcast Directory</h3>
          <p className="text-sm text-muted-foreground mt-0.5">
            {entries?.length || 0} podcasts tracked
          </p>
        </div>
        <button
          data-testid="button-add-podcast"
          onClick={() => { resetForm(); setShowForm(true); }}
          className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-xl text-sm font-semibold hover:bg-primary/90 transition-colors"
        >
          <Plus className="w-4 h-4" />
          Add Podcast
        </button>
      </div>

      {showForm && (
        <div className="bg-white border border-border rounded-2xl p-6 space-y-4">
          <h4 className="font-semibold text-foreground">
            {editEntry ? "Edit Podcast" : "Add Podcast"}
          </h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">iTunes ID *</label>
              <input
                data-testid="input-itunes-id"
                type="text"
                value={form.itunesId}
                onChange={(e) => setForm({ ...form, itunesId: e.target.value })}
                placeholder="e.g. 1469759170"
                disabled={!!editEntry}
                className="w-full px-3 py-2 border border-border rounded-lg text-sm disabled:opacity-50"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">Name *</label>
              <input
                data-testid="input-podcast-name"
                type="text"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="e.g. My First Million"
                className="w-full px-3 py-2 border border-border rounded-lg text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">Twitter Handle</label>
              <input
                data-testid="input-twitter-handle"
                type="text"
                value={form.twitterHandle}
                onChange={(e) => setForm({ ...form, twitterHandle: e.target.value })}
                placeholder="e.g. @maboroshi"
                className="w-full px-3 py-2 border border-border rounded-lg text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">Host Handle</label>
              <input
                data-testid="input-host-handle"
                type="text"
                value={form.hostHandle}
                onChange={(e) => setForm({ ...form, hostHandle: e.target.value })}
                placeholder="e.g. @ShaanVP"
                className="w-full px-3 py-2 border border-border rounded-lg text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">Followers</label>
              <input
                data-testid="input-followers"
                type="number"
                value={form.followers}
                onChange={(e) => setForm({ ...form, followers: e.target.value })}
                placeholder="e.g. 50000"
                className="w-full px-3 py-2 border border-border rounded-lg text-sm"
              />
            </div>
          </div>
          <div className="flex gap-3 pt-2">
            <button
              data-testid="button-save-podcast"
              onClick={() => upsertMutation.mutate(form)}
              disabled={!form.itunesId || !form.name || upsertMutation.isPending}
              className="px-4 py-2 bg-primary text-white rounded-lg text-sm font-semibold hover:bg-primary/90 disabled:opacity-50 transition-colors"
            >
              {upsertMutation.isPending ? "Saving..." : editEntry ? "Update" : "Add"}
            </button>
            <button
              data-testid="button-cancel-podcast"
              onClick={resetForm}
              className="px-4 py-2 border border-border rounded-lg text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="bg-white border border-border rounded-2xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/30">
              <th className="text-left px-4 py-3 font-semibold text-foreground">Podcast</th>
              <th className="text-left px-4 py-3 font-semibold text-foreground hidden sm:table-cell">iTunes ID</th>
              <th className="text-left px-4 py-3 font-semibold text-foreground hidden md:table-cell">Twitter</th>
              <th className="text-left px-4 py-3 font-semibold text-foreground hidden md:table-cell">Host</th>
              <th className="text-right px-4 py-3 font-semibold text-foreground hidden sm:table-cell">Followers</th>
              <th className="text-right px-4 py-3 font-semibold text-foreground w-24">Actions</th>
            </tr>
          </thead>
          <tbody>
            {(!entries || entries.length === 0) ? (
              <tr>
                <td colSpan={6} className="text-center py-12 text-muted-foreground">
                  No podcasts in directory yet. Click "Add Podcast" to get started.
                </td>
              </tr>
            ) : (
              entries.map((entry) => (
                <tr key={entry.id} className="border-b border-border last:border-0 hover:bg-muted/20 transition-colors" data-testid={`row-podcast-${entry.id}`}>
                  <td className="px-4 py-3 font-medium text-foreground">{entry.name}</td>
                  <td className="px-4 py-3 text-muted-foreground hidden sm:table-cell">
                    <a
                      href={`https://podcasts.apple.com/podcast/id${entry.itunesId}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 text-primary hover:underline"
                    >
                      {entry.itunesId}
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground hidden md:table-cell">
                    {entry.twitterHandle ? (
                      <a
                        href={`https://x.com/${entry.twitterHandle.replace("@", "")}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1 text-primary hover:underline"
                      >
                        <Twitter className="w-3 h-3" />
                        {entry.twitterHandle}
                      </a>
                    ) : (
                      <span className="text-muted-foreground/50">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground hidden md:table-cell">
                    {entry.hostHandle ? (
                      <a
                        href={`https://x.com/${entry.hostHandle.replace("@", "")}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1 text-primary hover:underline"
                      >
                        {entry.hostHandle}
                      </a>
                    ) : (
                      <span className="text-muted-foreground/50">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right text-muted-foreground hidden sm:table-cell">
                    {entry.followers ? (
                      <span className="flex items-center gap-1 justify-end">
                        <Users className="w-3 h-3" />
                        {entry.followers.toLocaleString()}
                      </span>
                    ) : (
                      <span className="text-muted-foreground/50">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center gap-1 justify-end">
                      <button
                        data-testid={`button-edit-podcast-${entry.id}`}
                        onClick={() => startEdit(entry)}
                        className="p-1.5 text-muted-foreground hover:text-primary rounded-lg hover:bg-primary/5 transition-colors"
                        title="Edit"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg>
                      </button>
                      <button
                        data-testid={`button-delete-podcast-${entry.id}`}
                        onClick={() => {
                          if (confirm(`Delete "${entry.name}" from directory?`)) {
                            deleteMutation.mutate(entry.id);
                          }
                        }}
                        className="p-1.5 text-muted-foreground hover:text-red-600 rounded-lg hover:bg-red-50 transition-colors"
                        title="Delete"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
