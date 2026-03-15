import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Plus, Pencil, Trash2, Shield, Crown, X, UserPlus } from "lucide-react";

interface AdminUserRow {
  id: number;
  email: string;
  name: string | null;
  role: string;
  createdAt: string | null;
}

export default function AdminUsersManager() {
  const { toast } = useToast();
  const [showAdd, setShowAdd] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editEmail, setEditEmail] = useState("");
  const [editName, setEditName] = useState("");
  const [editRole, setEditRole] = useState("admin");
  const [newEmail, setNewEmail] = useState("");
  const [newName, setNewName] = useState("");
  const [newRole, setNewRole] = useState("admin");
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);

  const { data: adminUsers, isLoading } = useQuery<AdminUserRow[]>({
    queryKey: ["/api/admin/admin-users"],
  });

  const addMutation = useMutation({
    mutationFn: (data: { email: string; name?: string; role: string }) =>
      apiRequest("POST", "/api/admin/admin-users", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/admin-users"] });
      setShowAdd(false);
      setNewEmail("");
      setNewName("");
      setNewRole("admin");
      toast({ title: "Admin added", description: "New admin user has been created." });
    },
    onError: (err: any) => {
      toast({ title: "Failed", description: err.message || "Could not add admin.", variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, ...data }: { id: number; email?: string; name?: string; role?: string }) =>
      apiRequest("PATCH", `/api/admin/admin-users/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/admin-users"] });
      setEditingId(null);
      toast({ title: "Updated", description: "Admin user has been updated." });
    },
    onError: (err: any) => {
      toast({ title: "Failed", description: err.message || "Could not update admin.", variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/admin/admin-users/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/admin-users"] });
      setConfirmDeleteId(null);
      toast({ title: "Deleted", description: "Admin user has been removed." });
    },
    onError: (err: any) => {
      toast({ title: "Failed", description: err.message || "Could not delete admin.", variant: "destructive" });
    },
  });

  const startEditing = (user: AdminUserRow) => {
    setEditingId(user.id);
    setEditEmail(user.email);
    setEditName(user.name || "");
    setEditRole(user.role);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-10">
        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4" data-testid="section-admin-users">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
            <Shield className="w-5 h-5 text-primary" />
            Admin Users
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Manage who has admin access. {adminUsers?.length || 0} admin{(adminUsers?.length || 0) !== 1 ? "s" : ""} total.
          </p>
        </div>
        <button
          data-testid="button-add-admin"
          onClick={() => setShowAdd(true)}
          className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold bg-primary text-white hover:brightness-105 transition-all"
        >
          <UserPlus className="w-4 h-4" />
          Add Admin
        </button>
      </div>

      {showAdd && (
        <div className="glass-panel rounded-2xl p-5 border-2 border-primary/20" data-testid="form-add-admin">
          <h3 className="text-sm font-bold text-foreground mb-3 flex items-center gap-2">
            <Plus className="w-4 h-4 text-primary" />
            Add New Admin
          </h3>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!newEmail.trim()) return;
              addMutation.mutate({ email: newEmail.trim(), name: newName.trim() || undefined, role: newRole });
            }}
            className="space-y-3"
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-muted-foreground mb-1 block">Email *</label>
                <input
                  type="email"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  placeholder="admin@example.com"
                  className="w-full h-10 px-3 bg-white border border-black/[0.08] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/30"
                  data-testid="input-new-admin-email"
                  required
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-muted-foreground mb-1 block">Name</label>
                <input
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="Optional display name"
                  className="w-full h-10 px-3 bg-white border border-black/[0.08] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/30"
                  data-testid="input-new-admin-name"
                />
              </div>
            </div>
            <div>
              <label className="text-xs font-semibold text-muted-foreground mb-1 block">Role</label>
              <select
                value={newRole}
                onChange={(e) => setNewRole(e.target.value)}
                className="h-10 px-3 bg-white border border-black/[0.08] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/30"
                data-testid="select-new-admin-role"
              >
                <option value="admin">Admin</option>
                <option value="owner">Owner</option>
              </select>
            </div>
            <div className="flex gap-2 pt-1">
              <button
                type="submit"
                disabled={!newEmail.trim() || addMutation.isPending}
                className="h-9 px-4 rounded-lg font-bold text-sm bg-primary text-white hover:brightness-105 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                data-testid="button-submit-add-admin"
              >
                {addMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Add Admin"}
              </button>
              <button
                type="button"
                onClick={() => { setShowAdd(false); setNewEmail(""); setNewName(""); setNewRole("admin"); }}
                className="h-9 px-4 rounded-lg font-bold text-sm text-muted-foreground hover:text-foreground hover:bg-black/[0.03] transition-all"
                data-testid="button-cancel-add-admin"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="space-y-2">
        {(!adminUsers || adminUsers.length === 0) && (
          <div className="glass-panel rounded-2xl p-8 text-center">
            <Shield className="w-8 h-8 text-muted-foreground/40 mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">No admin users yet. Add your first admin above.</p>
          </div>
        )}
        {adminUsers?.map((user) => (
          <div
            key={user.id}
            className="glass-panel rounded-xl p-4 flex items-center justify-between gap-4"
            data-testid={`admin-user-row-${user.id}`}
          >
            {editingId === user.id ? (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  updateMutation.mutate({
                    id: user.id,
                    email: editEmail.trim(),
                    name: editName.trim() || undefined,
                    role: editRole,
                  });
                }}
                className="flex-1 space-y-3"
                data-testid={`form-edit-admin-${user.id}`}
              >
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="text-xs font-semibold text-muted-foreground mb-1 block">Email</label>
                    <input
                      type="email"
                      value={editEmail}
                      onChange={(e) => setEditEmail(e.target.value)}
                      className="w-full h-9 px-3 bg-white border border-black/[0.08] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/30"
                      data-testid={`input-edit-email-${user.id}`}
                      required
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-muted-foreground mb-1 block">Name</label>
                    <input
                      type="text"
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      placeholder="Optional"
                      className="w-full h-9 px-3 bg-white border border-black/[0.08] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/30"
                      data-testid={`input-edit-name-${user.id}`}
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-muted-foreground mb-1 block">Role</label>
                    <select
                      value={editRole}
                      onChange={(e) => setEditRole(e.target.value)}
                      className="h-9 px-3 bg-white border border-black/[0.08] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/30"
                      data-testid={`select-edit-role-${user.id}`}
                    >
                      <option value="admin">Admin</option>
                      <option value="owner">Owner</option>
                    </select>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    type="submit"
                    disabled={updateMutation.isPending}
                    className="h-8 px-3 rounded-lg font-bold text-xs bg-primary text-white hover:brightness-105 disabled:opacity-40 transition-all"
                    data-testid={`button-save-edit-${user.id}`}
                  >
                    {updateMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : "Save"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditingId(null)}
                    className="h-8 px-3 rounded-lg font-bold text-xs text-muted-foreground hover:text-foreground hover:bg-black/[0.03] transition-all"
                    data-testid={`button-cancel-edit-${user.id}`}
                  >
                    Cancel
                  </button>
                </div>
              </form>
            ) : (
              <>
                <div className="flex items-center gap-3 min-w-0">
                  <div className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 ${user.role === "owner" ? "bg-amber-100 text-amber-700" : "bg-primary/10 text-primary"}`}>
                    {user.role === "owner" ? <Crown className="w-4 h-4" /> : <Shield className="w-4 h-4" />}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-foreground truncate" data-testid={`text-admin-email-${user.id}`}>
                      {user.email}
                    </p>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      {user.name && <span>{user.name}</span>}
                      <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide ${user.role === "owner" ? "bg-amber-100 text-amber-700" : "bg-primary/10 text-primary"}`}>
                        {user.role}
                      </span>
                      {user.createdAt && (
                        <span>Added {new Date(user.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</span>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={() => startEditing(user)}
                    className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-black/[0.04] transition-all"
                    data-testid={`button-edit-admin-${user.id}`}
                    title="Edit"
                  >
                    <Pencil className="w-4 h-4" />
                  </button>
                  {confirmDeleteId === user.id ? (
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => deleteMutation.mutate(user.id)}
                        disabled={deleteMutation.isPending}
                        className="h-8 px-3 rounded-lg font-bold text-xs bg-red-500 text-white hover:bg-red-600 transition-all"
                        data-testid={`button-confirm-delete-admin-${user.id}`}
                      >
                        {deleteMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : "Delete"}
                      </button>
                      <button
                        onClick={() => setConfirmDeleteId(null)}
                        className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-black/[0.04] transition-all"
                        data-testid={`button-cancel-delete-admin-${user.id}`}
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setConfirmDeleteId(user.id)}
                      className="p-2 rounded-lg text-muted-foreground hover:text-red-500 hover:bg-red-50 transition-all"
                      data-testid={`button-delete-admin-${user.id}`}
                      title="Delete"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
