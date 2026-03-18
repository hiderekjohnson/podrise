import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { ToggleLeft, Plus, Trash2, Users, ChevronDown, ChevronRight } from "lucide-react";

interface FeatureFlag {
  id: number;
  key: string;
  description: string | null;
  enabled: boolean;
  createdAt: string | null;
}

interface UserOverride {
  id: number;
  userId: number;
  flagKey: string;
  enabled: boolean;
  userEmail: string;
}

export default function AdminFeatureFlags() {
  const { toast } = useToast();
  const [newFlagKey, setNewFlagKey] = useState("");
  const [newFlagDesc, setNewFlagDesc] = useState("");
  const [expandedFlag, setExpandedFlag] = useState<string | null>(null);
  const [newFlagEnabled, setNewFlagEnabled] = useState(false);
  const [overrideEmail, setOverrideEmail] = useState("");
  const [overrideEnabled, setOverrideEnabled] = useState(true);

  const { data: flags = [], isLoading } = useQuery<FeatureFlag[]>({
    queryKey: ["/api/admin/feature-flags"],
    queryFn: async () => {
      const res = await fetch("/api/admin/feature-flags", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch flags");
      return res.json();
    },
  });

  const createFlag = useMutation({
    mutationFn: async (data: { key: string; description: string; enabled?: boolean }) => {
      const res = await apiRequest("POST", "/api/admin/feature-flags", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/feature-flags"] });
      setNewFlagKey("");
      setNewFlagDesc("");
      toast({ title: "Flag created" });
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const toggleFlag = useMutation({
    mutationFn: async ({ id, enabled }: { id: number; enabled: boolean }) => {
      const res = await apiRequest("PATCH", `/api/admin/feature-flags/${id}`, { enabled });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/feature-flags"] });
      queryClient.invalidateQueries({ queryKey: ["/api/feature-flags"] });
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const deleteFlag = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/admin/feature-flags/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/feature-flags"] });
      queryClient.invalidateQueries({ queryKey: ["/api/feature-flags"] });
      toast({ title: "Flag deleted" });
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const addOverride = useMutation({
    mutationFn: async ({ flagKey, email, enabled }: { flagKey: string; email: string; enabled: boolean }) => {
      const res = await apiRequest("POST", `/api/admin/feature-flags/${flagKey}/overrides`, { email, enabled });
      return res.json();
    },
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/feature-flags", vars.flagKey, "overrides"] });
      queryClient.invalidateQueries({ queryKey: ["/api/feature-flags"] });
      setOverrideEmail("");
      toast({ title: "Override added" });
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const removeOverride = useMutation({
    mutationFn: async ({ flagKey, userId }: { flagKey: string; userId: number }) => {
      await apiRequest("DELETE", `/api/admin/feature-flags/${flagKey}/overrides/${userId}`);
    },
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/feature-flags", vars.flagKey, "overrides"] });
      queryClient.invalidateQueries({ queryKey: ["/api/feature-flags"] });
      toast({ title: "Override removed" });
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  if (isLoading) {
    return <div className="flex items-center justify-center py-20 text-muted-foreground">Loading...</div>;
  }

  return (
    <div className="space-y-6" data-testid="admin-feature-flags">
      <div className="glass-panel rounded-2xl p-5">
        <h3 className="text-sm font-bold text-foreground mb-4">Create New Flag</h3>
        <div className="flex gap-2 items-end">
          <div className="flex-1">
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Key</label>
            <input
              data-testid="input-new-flag-key"
              type="text"
              value={newFlagKey}
              onChange={(e) => setNewFlagKey(e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, ""))}
              placeholder="e.g. new-feature"
              className="w-full px-3 py-2 text-sm border rounded-lg bg-background"
            />
          </div>
          <div className="flex-1">
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Description</label>
            <input
              data-testid="input-new-flag-description"
              type="text"
              value={newFlagDesc}
              onChange={(e) => setNewFlagDesc(e.target.value)}
              placeholder="What does this flag control?"
              className="w-full px-3 py-2 text-sm border rounded-lg bg-background"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Default</label>
            <select
              data-testid="select-new-flag-enabled"
              value={newFlagEnabled ? "true" : "false"}
              onChange={(e) => setNewFlagEnabled(e.target.value === "true")}
              className="px-3 py-2 text-sm border rounded-lg bg-background"
            >
              <option value="false">Off</option>
              <option value="true">On</option>
            </select>
          </div>
          <button
            data-testid="button-create-flag"
            onClick={() => {
              createFlag.mutate({ key: newFlagKey, description: newFlagDesc, enabled: newFlagEnabled });
              setNewFlagEnabled(false);
            }}
            disabled={!newFlagKey || createFlag.isPending}
            className="px-4 py-2 bg-primary text-primary-foreground text-sm font-bold rounded-lg hover:bg-primary/90 disabled:opacity-50 flex items-center gap-1.5"
          >
            <Plus className="w-3.5 h-3.5" />
            Create
          </button>
        </div>
      </div>

      {flags.map((flag) => (
        <FlagRow
          key={flag.id}
          flag={flag}
          expanded={expandedFlag === flag.key}
          onToggleExpand={() => setExpandedFlag(expandedFlag === flag.key ? null : flag.key)}
          onToggle={(enabled) => toggleFlag.mutate({ id: flag.id, enabled })}
          onDelete={() => deleteFlag.mutate(flag.id)}
          overrideEmail={overrideEmail}
          overrideEnabled={overrideEnabled}
          setOverrideEmail={setOverrideEmail}
          setOverrideEnabled={setOverrideEnabled}
          onAddOverride={(email, enabled) => addOverride.mutate({ flagKey: flag.key, email, enabled })}
          onRemoveOverride={(userId) => removeOverride.mutate({ flagKey: flag.key, userId })}
          addingOverride={addOverride.isPending}
        />
      ))}

      {flags.length === 0 && (
        <div className="text-center py-12 text-muted-foreground text-sm">No feature flags yet</div>
      )}
    </div>
  );
}

function FlagRow({
  flag,
  expanded,
  onToggleExpand,
  onToggle,
  onDelete,
  overrideEmail,
  overrideEnabled,
  setOverrideEmail,
  setOverrideEnabled,
  onAddOverride,
  onRemoveOverride,
  addingOverride,
}: {
  flag: FeatureFlag;
  expanded: boolean;
  onToggleExpand: () => void;
  onToggle: (enabled: boolean) => void;
  onDelete: () => void;
  overrideEmail: string;
  overrideEnabled: boolean;
  setOverrideEmail: (v: string) => void;
  setOverrideEnabled: (v: boolean) => void;
  onAddOverride: (email: string, enabled: boolean) => void;
  onRemoveOverride: (userId: number) => void;
  addingOverride: boolean;
}) {
  const { data: overrides = [] } = useQuery<UserOverride[]>({
    queryKey: ["/api/admin/feature-flags", flag.key, "overrides"],
    queryFn: async () => {
      const res = await fetch(`/api/admin/feature-flags/${flag.key}/overrides`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch overrides");
      return res.json();
    },
    enabled: expanded,
  });

  return (
    <div className="glass-panel rounded-2xl overflow-hidden" data-testid={`flag-row-${flag.key}`}>
      <div className="flex items-center gap-3 p-4">
        <button
          data-testid={`button-expand-flag-${flag.key}`}
          onClick={onToggleExpand}
          className="text-muted-foreground hover:text-foreground transition-colors"
        >
          {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        </button>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <code className="text-sm font-bold text-foreground" data-testid={`text-flag-key-${flag.key}`}>{flag.key}</code>
            <span className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded-full ${
              flag.enabled
                ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
                : "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
            }`} data-testid={`badge-flag-status-${flag.key}`}>
              {flag.enabled ? "ON" : "OFF"}
            </span>
          </div>
          {flag.description && (
            <p className="text-xs text-muted-foreground mt-0.5">{flag.description}</p>
          )}
        </div>

        <button
          data-testid={`button-toggle-flag-${flag.key}`}
          onClick={() => onToggle(!flag.enabled)}
          className={`relative w-11 h-6 rounded-full transition-colors ${
            flag.enabled ? "bg-emerald-500" : "bg-zinc-300 dark:bg-zinc-600"
          }`}
        >
          <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${
            flag.enabled ? "translate-x-5" : "translate-x-0"
          }`} />
        </button>

        <button
          data-testid={`button-delete-flag-${flag.key}`}
          onClick={onDelete}
          className="text-muted-foreground hover:text-red-500 transition-colors p-1"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>

      {expanded && (
        <div className="border-t px-4 py-4 bg-muted/30">
          <div className="flex items-center gap-2 mb-3">
            <Users className="w-4 h-4 text-muted-foreground" />
            <h4 className="text-xs font-bold text-foreground uppercase tracking-wider">Per-User Overrides</h4>
          </div>

          <div className="flex gap-2 mb-4">
            <input
              data-testid={`input-override-email-${flag.key}`}
              type="email"
              value={overrideEmail}
              onChange={(e) => setOverrideEmail(e.target.value)}
              placeholder="user@example.com"
              className="flex-1 px-3 py-2 text-sm border rounded-lg bg-background"
            />
            <select
              data-testid={`select-override-enabled-${flag.key}`}
              value={overrideEnabled ? "true" : "false"}
              onChange={(e) => setOverrideEnabled(e.target.value === "true")}
              className="px-3 py-2 text-sm border rounded-lg bg-background"
            >
              <option value="true">Enabled</option>
              <option value="false">Disabled</option>
            </select>
            <button
              data-testid={`button-add-override-${flag.key}`}
              onClick={() => onAddOverride(overrideEmail, overrideEnabled)}
              disabled={!overrideEmail || addingOverride}
              className="px-3 py-2 bg-primary text-primary-foreground text-sm font-bold rounded-lg hover:bg-primary/90 disabled:opacity-50"
            >
              Add
            </button>
          </div>

          {overrides.length > 0 ? (
            <div className="space-y-2">
              {overrides.map((o) => (
                <div key={o.id} className="flex items-center justify-between py-2 px-3 bg-background rounded-lg" data-testid={`override-row-${o.userId}`}>
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-foreground">{o.userEmail}</span>
                    <span className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded-full ${
                      o.enabled
                        ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
                        : "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
                    }`}>
                      {o.enabled ? "ON" : "OFF"}
                    </span>
                  </div>
                  <button
                    data-testid={`button-remove-override-${o.userId}`}
                    onClick={() => onRemoveOverride(o.userId)}
                    className="text-muted-foreground hover:text-red-500 transition-colors p-1"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground text-center py-3">No overrides for this flag</p>
          )}
        </div>
      )}
    </div>
  );
}
