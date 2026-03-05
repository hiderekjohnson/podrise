import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Save, RotateCcw, BrainCircuit, Info } from "lucide-react";

export default function RecapPromptEditor() {
  const { toast } = useToast();
  const [prompt, setPrompt] = useState("");
  const [hasChanges, setHasChanges] = useState(false);

  const { data, isLoading } = useQuery<{ prompt: string; defaultPrompt: string }>({
    queryKey: ["/api/admin/recap-prompt"],
  });

  useEffect(() => {
    if (data) {
      setPrompt(data.prompt || data.defaultPrompt);
    }
  }, [data]);

  const saveMutation = useMutation({
    mutationFn: async (newPrompt: string) => {
      await apiRequest("PUT", "/api/admin/recap-prompt", { prompt: newPrompt });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/recap-prompt"] });
      setHasChanges(false);
      toast({ title: "Prompt saved", description: "Your AI recap prompt has been updated." });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to save prompt.", variant: "destructive" });
    },
  });

  const handleReset = () => {
    if (data) {
      setPrompt(data.defaultPrompt);
      setHasChanges(true);
    }
  };

  const handleChange = (value: string) => {
    setPrompt(value);
    setHasChanges(true);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  const charCount = prompt.length;
  const isOverLimit = charCount > 10000;

  return (
    <div className="space-y-6" data-testid="recap-prompt-editor">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold flex items-center gap-2" data-testid="text-prompt-title">
            <BrainCircuit className="w-5 h-5 text-primary" />
            AI Recap Prompt
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            This prompt controls how the AI generates episode recaps. The system automatically provides episode data, podcast names, and stats — this controls the format and tone instructions.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {hasChanges && (
            <span className="text-xs text-amber-600 font-medium" data-testid="text-prompt-unsaved">
              Unsaved changes
            </span>
          )}
          <button
            data-testid="button-reset-prompt"
            onClick={handleReset}
            className="flex items-center gap-1.5 px-3 py-2 text-sm rounded-lg border border-border text-muted-foreground hover:text-foreground hover:bg-black/[0.03] transition-all"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Reset to Default
          </button>
          <button
            data-testid="button-save-prompt"
            onClick={() => saveMutation.mutate(prompt)}
            disabled={!hasChanges || isOverLimit || saveMutation.isPending}
            className="flex items-center gap-1.5 px-4 py-2 text-sm rounded-lg bg-primary text-white font-medium hover:bg-primary/90 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saveMutation.isPending ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Save className="w-3.5 h-3.5" />
            )}
            Save Prompt
          </button>
        </div>
      </div>

      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 flex gap-3" data-testid="prompt-info-box">
        <Info className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
        <div className="text-sm text-blue-900 space-y-2">
          <p className="font-medium">How this works</p>
          <p>
            The system automatically prepends a header with episode data, transcript excerpts, podcast names, and duration stats. Your prompt below controls the <strong>format instructions and tone guidelines</strong> — how the AI should structure each episode recap.
          </p>
          <p>
            The AI sees: system intro → episode data → stats header → <strong>your prompt below</strong>
          </p>
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label className="text-sm font-medium text-foreground">Prompt Instructions</label>
          <span className={`text-xs ${isOverLimit ? "text-red-500 font-medium" : "text-muted-foreground"}`} data-testid="text-prompt-char-count">
            {charCount.toLocaleString()} / 10,000 characters
          </span>
        </div>
        <textarea
          data-testid="textarea-recap-prompt"
          value={prompt}
          onChange={(e) => handleChange(e.target.value)}
          className="w-full min-h-[500px] p-4 rounded-xl border border-border bg-white font-mono text-sm leading-relaxed resize-y focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all"
          placeholder="Enter your AI recap format instructions..."
          spellCheck={false}
        />
        {isOverLimit && (
          <p className="text-xs text-red-500 font-medium">
            Prompt exceeds the 10,000 character limit. Please shorten it.
          </p>
        )}
      </div>
    </div>
  );
}