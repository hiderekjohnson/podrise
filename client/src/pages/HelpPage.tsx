import { useState, useRef, useEffect } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Send, Bot, User, Sparkles, Loader2 } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

const SUGGESTED_QUESTIONS = [
  "How does PodCap work?",
  "How do I follow a podcast?",
  "When do I receive email recaps?",
  "How do saved episodes work?",
  "How do I change my email?",
  "What's the difference between For You and Following?",
];

export default function HelpPage() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const sendMessage = async (text: string) => {
    if (!text.trim() || isLoading) return;

    const userMessage: ChatMessage = { role: "user", content: text.trim() };
    const updatedMessages = [...messages, userMessage];
    setMessages(updatedMessages);
    setInput("");
    setIsLoading(true);

    try {
      const res = await apiRequest("POST", "/api/help-chat", {
        messages: updatedMessages.map((m) => ({ role: m.role, content: m.content })),
      });
      const data = await res.json();
      setMessages((prev) => [...prev, { role: "assistant", content: data.reply }]);
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "Sorry, I'm having trouble right now. Please try again or contact us at hello@podcap.io." },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    sendMessage(input);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  };

  return (
    <DashboardLayout>
      <div className="min-h-screen bg-[#F9F9FB] dark:bg-[#09090B] flex flex-col" data-testid="help-page">
        <div className="max-w-3xl w-full mx-auto px-4 md:px-8 py-6 pb-24 md:pb-6 flex flex-col flex-1">
          <div className="mb-6">
            <h1 className="text-[24px] md:text-[28px] font-bold text-[#09090B] dark:text-white mb-1">Help & Support</h1>
            <p className="text-[15px] text-[#71717A] dark:text-[#A1A1AA]">Ask me anything about PodCap — I'm here to help.</p>
          </div>

          <div className="flex-1 flex flex-col rounded-2xl bg-white dark:bg-[#111114] border border-[#F0F0F2] dark:border-[#1C1C22] overflow-hidden min-h-[500px]">
            <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-4" data-testid="chat-messages">
              {messages.length === 0 && (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <div className="w-14 h-14 rounded-2xl bg-[#6366F1]/10 flex items-center justify-center mb-4">
                    <Sparkles className="w-7 h-7 text-[#6366F1]" />
                  </div>
                  <h2 className="text-[18px] font-bold text-[#09090B] dark:text-white mb-2" data-testid="chat-welcome-title">
                    Hi! I'm PodCap's AI assistant.
                  </h2>
                  <p className="text-[14px] text-[#71717A] dark:text-[#A1A1AA] max-w-md mb-6">
                    I can help you with questions about how PodCap works, your account, email recaps, saved episodes, subscriptions, and more.
                  </p>
                  <div className="flex flex-wrap justify-center gap-2 max-w-lg" data-testid="suggested-questions">
                    {SUGGESTED_QUESTIONS.map((q) => (
                      <button
                        key={q}
                        onClick={() => sendMessage(q)}
                        className="px-3 py-1.5 rounded-full text-[13px] font-medium bg-[#F4F4F5] dark:bg-[#1C1C22] text-[#52525B] dark:text-[#A1A1AA] hover:bg-[#E4E4E7] dark:hover:bg-[#27272A] transition-colors border border-[#E4E4E7] dark:border-[#27272A]"
                        data-testid={`suggested-question-${q.slice(0, 20).replace(/\s+/g, "-").toLowerCase()}`}
                      >
                        {q}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {messages.map((msg, i) => (
                <div
                  key={i}
                  className={`flex gap-3 ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                  data-testid={`chat-message-${msg.role}-${i}`}
                >
                  {msg.role === "assistant" && (
                    <div className="flex-shrink-0 w-8 h-8 rounded-full bg-[#6366F1]/10 flex items-center justify-center mt-0.5">
                      <Bot className="w-4 h-4 text-[#6366F1]" />
                    </div>
                  )}
                  <div
                    className={`max-w-[80%] rounded-2xl px-4 py-3 text-[14px] md:text-[15px] leading-relaxed whitespace-pre-wrap ${
                      msg.role === "user"
                        ? "bg-[#6366F1] text-white"
                        : "bg-[#F4F4F5] dark:bg-[#1C1C22] text-[#09090B] dark:text-[#E4E4E7]"
                    }`}
                  >
                    {msg.content}
                  </div>
                  {msg.role === "user" && (
                    <div className="flex-shrink-0 w-8 h-8 rounded-full bg-[#E4E4E7] dark:bg-[#27272A] flex items-center justify-center mt-0.5">
                      <User className="w-4 h-4 text-[#52525B] dark:text-[#A1A1AA]" />
                    </div>
                  )}
                </div>
              ))}

              {isLoading && (
                <div className="flex gap-3 justify-start" data-testid="chat-loading">
                  <div className="flex-shrink-0 w-8 h-8 rounded-full bg-[#6366F1]/10 flex items-center justify-center mt-0.5">
                    <Bot className="w-4 h-4 text-[#6366F1]" />
                  </div>
                  <div className="bg-[#F4F4F5] dark:bg-[#1C1C22] rounded-2xl px-4 py-3 flex items-center gap-2">
                    <Loader2 className="w-4 h-4 text-[#6366F1] animate-spin" />
                    <span className="text-[14px] text-[#71717A] dark:text-[#A1A1AA]">Thinking...</span>
                  </div>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>

            <form
              onSubmit={handleSubmit}
              className="border-t border-[#F0F0F2] dark:border-[#1C1C22] p-3 md:p-4 flex gap-2 items-end"
              data-testid="chat-input-form"
            >
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ask a question about PodCap..."
                rows={1}
                className="flex-1 resize-none rounded-xl border border-[#E4E4E7] dark:border-[#27272A] bg-[#FAFAFA] dark:bg-[#18181B] px-4 py-2.5 text-[14px] md:text-[15px] text-[#09090B] dark:text-white placeholder:text-[#A1A1AA] focus:outline-none focus:ring-2 focus:ring-[#6366F1]/30 focus:border-[#6366F1] transition-all"
                data-testid="input-chat-message"
              />
              <button
                type="submit"
                disabled={!input.trim() || isLoading}
                className="flex-shrink-0 w-10 h-10 rounded-xl bg-[#6366F1] text-white flex items-center justify-center hover:bg-[#5558E6] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                data-testid="button-send-message"
              >
                <Send className="w-4 h-4" />
              </button>
            </form>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
