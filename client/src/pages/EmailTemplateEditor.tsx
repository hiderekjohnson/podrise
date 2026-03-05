import { useState, useEffect, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Save, RotateCcw, Eye, EyeOff, Copy, Info } from "lucide-react";

interface MergeTag {
  tag: string;
  description: string;
  example: string;
}

interface TemplateData {
  template: Record<string, string>;
  mergeTags: MergeTag[];
  defaults: Record<string, string>;
}

const FIELD_LABELS: Record<string, { label: string; hint: string }> = {
  headerTitle: { label: "Header Title", hint: "Main title in the blue banner" },
  headerSubtitle: { label: "Header Subtitle", hint: "Smaller text under the title" },
  headline: { label: "Headline", hint: "Big bold text at the top of the email body" },
  subtitle: { label: "Subtitle", hint: "Text right below the headline" },
  signoffLine1: { label: "Sign-off Line 1", hint: "First line of the closing" },
  signoffLine2: { label: "Sign-off Line 2", hint: "Second line of the closing" },
  psLine1: { label: "P.S. Line 1", hint: "Bold text in the P.S. box" },
  psLine2: { label: "P.S. Line 2", hint: "Lighter text in the P.S. box" },
  showPs: { label: "Show P.S. Section", hint: "Toggle the P.S. box on/off" },
  footerText: { label: "Footer Text", hint: "Small text at the very bottom" },
  headerColor: { label: "Header Color", hint: "Background color of the top banner" },
  accentColor: { label: "Accent Color", hint: "Color for links and highlights" },
};

const TEXT_FIELDS = ["headerTitle", "headerSubtitle", "headline", "subtitle", "signoffLine1", "signoffLine2", "psLine1", "psLine2", "footerText"];
const COLOR_FIELDS = ["headerColor", "accentColor"];

export default function EmailTemplateEditor() {
  const { toast } = useToast();
  const [form, setForm] = useState<Record<string, string>>({});
  const [showPreview, setShowPreview] = useState(true);
  const [previewHtml, setPreviewHtml] = useState("");
  const [previewLoading, setPreviewLoading] = useState(false);

  const { data, isLoading } = useQuery<TemplateData>({
    queryKey: ["/api/admin/email-template"],
  });

  useEffect(() => {
    if (data?.template) {
      setForm(data.template);
    }
  }, [data]);

  const saveMutation = useMutation({
    mutationFn: () => apiRequest("PUT", "/api/admin/email-template", { template: form }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/email-template"] });
      toast({ title: "Saved", description: "Email template updated. Changes will apply to the next email sent." });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to save template.", variant: "destructive" });
    },
  });

  const loadPreview = useCallback(async (templateData: Record<string, string>) => {
    setPreviewLoading(true);
    try {
      const res = await apiRequest("POST", "/api/admin/email-template/preview", { template: templateData });
      const result = await res.json();
      setPreviewHtml(result.html);
    } catch {
      setPreviewHtml("<p style='padding:20px;color:red;'>Preview failed to load</p>");
    } finally {
      setPreviewLoading(false);
    }
  }, []);

  useEffect(() => {
    if (Object.keys(form).length > 0) {
      const timer = setTimeout(() => loadPreview(form), 500);
      return () => clearTimeout(timer);
    }
  }, [form, loadPreview]);

  const updateField = (key: string, value: string) => {
    setForm(prev => ({ ...prev, [key]: value }));
  };

  const resetToDefaults = () => {
    if (data?.defaults) {
      setForm(data.defaults);
      toast({ title: "Reset", description: "Template reset to defaults. Click Save to apply." });
    }
  };

  const insertMergeTag = (tag: string) => {
    navigator.clipboard.writeText(tag);
    toast({ title: "Copied", description: `${tag} copied to clipboard. Paste it into any text field.` });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-blue-500" />
      </div>
    );
  }

  const hasChanges = data?.template && JSON.stringify(form) !== JSON.stringify(data.template);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-gray-900 dark:text-white" data-testid="text-template-title">Email Template Editor</h2>
          <p className="text-sm text-gray-500 mt-1">Customize your daily digest emails. Use merge tags to insert dynamic content.</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={resetToDefaults}
            className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors dark:bg-gray-700 dark:text-gray-300"
            data-testid="button-reset-template"
          >
            <RotateCcw className="w-4 h-4" />
            Reset
          </button>
          <button
            onClick={() => saveMutation.mutate()}
            disabled={saveMutation.isPending || !hasChanges}
            className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            data-testid="button-save-template"
          >
            {saveMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Save Template
          </button>
        </div>
      </div>

      <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
        <div className="flex items-start gap-2">
          <Info className="w-4 h-4 text-blue-600 mt-0.5 flex-shrink-0" />
          <div>
            <p className="text-sm font-medium text-blue-900 dark:text-blue-200 mb-2">Available Merge Tags</p>
            <p className="text-xs text-blue-700 dark:text-blue-300 mb-3">Click a tag to copy it, then paste into any text field below.</p>
            <div className="flex flex-wrap gap-2">
              {data?.mergeTags?.map(mt => (
                <button
                  key={mt.tag}
                  onClick={() => insertMergeTag(mt.tag)}
                  className="group relative inline-flex items-center gap-1 px-2.5 py-1 text-xs font-mono bg-white dark:bg-gray-800 border border-blue-200 dark:border-blue-700 rounded-md hover:bg-blue-100 dark:hover:bg-blue-900 transition-colors cursor-pointer"
                  title={`${mt.description}\nExample: ${mt.example}`}
                  data-testid={`button-merge-tag-${mt.tag.replace(/[{}]/g, "")}`}
                >
                  <Copy className="w-3 h-3 text-blue-400" />
                  <span className="text-blue-700 dark:text-blue-300">{mt.tag}</span>
                  <span className="hidden group-hover:block absolute bottom-full left-0 mb-1 px-2 py-1 text-xs bg-gray-900 text-white rounded whitespace-nowrap z-10">
                    {mt.description} — e.g. "{mt.example}"
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className={`grid gap-6 ${showPreview ? "grid-cols-1 lg:grid-cols-2" : "grid-cols-1"}`}>
        <div className="space-y-4">
          <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">Content</h3>

          {TEXT_FIELDS.map(key => (
            <div key={key}>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                {FIELD_LABELS[key]?.label || key}
              </label>
              <p className="text-xs text-gray-400 mb-1.5">{FIELD_LABELS[key]?.hint}</p>
              {key === "headline" ? (
                <textarea
                  value={form[key] || ""}
                  onChange={e => updateField(key, e.target.value)}
                  rows={3}
                  className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
                  data-testid={`input-template-${key}`}
                />
              ) : (
                <input
                  type="text"
                  value={form[key] || ""}
                  onChange={e => updateField(key, e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  data-testid={`input-template-${key}`}
                />
              )}
            </div>
          ))}

          <div className="flex items-center gap-3 py-2">
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
              {FIELD_LABELS.showPs.label}
            </label>
            <button
              onClick={() => updateField("showPs", form.showPs === "true" ? "false" : "true")}
              className={`relative w-11 h-6 rounded-full transition-colors ${form.showPs === "true" ? "bg-blue-600" : "bg-gray-300 dark:bg-gray-600"}`}
              data-testid="toggle-show-ps"
            >
              <div className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${form.showPs === "true" ? "translate-x-[22px]" : "translate-x-0.5"}`} />
            </button>
          </div>

          <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider pt-4">Colors</h3>

          {COLOR_FIELDS.map(key => (
            <div key={key} className="flex items-center gap-3">
              <input
                type="color"
                value={form[key] || "#2563eb"}
                onChange={e => updateField(key, e.target.value)}
                className="w-10 h-10 rounded-lg border border-gray-200 dark:border-gray-600 cursor-pointer"
                data-testid={`input-template-${key}`}
              />
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                  {FIELD_LABELS[key]?.label}
                </label>
                <p className="text-xs text-gray-400">{FIELD_LABELS[key]?.hint}</p>
              </div>
              <input
                type="text"
                value={form[key] || "#2563eb"}
                onChange={e => updateField(key, e.target.value)}
                className="w-28 px-2 py-1 text-xs font-mono border border-gray-200 dark:border-gray-600 rounded bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300"
                data-testid={`input-template-${key}-hex`}
              />
            </div>
          ))}
        </div>

        <div>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">Live Preview</h3>
            <button
              onClick={() => setShowPreview(!showPreview)}
              className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
              data-testid="button-toggle-preview"
            >
              {showPreview ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              {showPreview ? "Hide" : "Show"}
            </button>
          </div>
          {showPreview && (
            <div className="relative border border-gray-200 dark:border-gray-600 rounded-lg overflow-hidden bg-gray-100 dark:bg-gray-900" style={{ minHeight: 500 }}>
              {previewLoading && (
                <div className="absolute inset-0 flex items-center justify-center bg-white/60 dark:bg-gray-900/60 z-10">
                  <Loader2 className="w-5 h-5 animate-spin text-blue-500" />
                </div>
              )}
              <iframe
                srcDoc={previewHtml}
                className="w-full border-0"
                style={{ height: 800 }}
                title="Email Preview"
                data-testid="iframe-email-preview"
              />
            </div>
          )}
        </div>
      </div>

      {hasChanges && (
        <div className="sticky bottom-4 flex justify-center">
          <div className="bg-yellow-50 dark:bg-yellow-900/30 border border-yellow-200 dark:border-yellow-700 rounded-lg px-4 py-3 flex items-center gap-3 shadow-lg">
            <p className="text-sm text-yellow-800 dark:text-yellow-200 font-medium">You have unsaved changes</p>
            <button
              onClick={() => saveMutation.mutate()}
              disabled={saveMutation.isPending}
              className="px-3 py-1.5 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50"
              data-testid="button-save-template-sticky"
            >
              {saveMutation.isPending ? "Saving..." : "Save Now"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}