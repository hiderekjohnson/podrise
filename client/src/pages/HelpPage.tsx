import { useState } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Link } from "wouter";
import { ChevronDown, Mail, MessageCircle, FileText, Shield, HelpCircle } from "lucide-react";

interface FAQItem {
  question: string;
  answer: string;
}

const FAQ_SECTIONS = [
  {
    title: "Getting Started",
    icon: HelpCircle,
    items: [
      { question: "How does PodCap work?", answer: "PodCap generates AI-powered recaps of your favorite podcasts. Follow the podcasts you care about, and we'll deliver concise summaries of new episodes to your inbox and feed." },
      { question: "How do I follow a podcast?", answer: "Go to the Discover page and search for a podcast, or browse our curated lists. Click the 'Follow' button next to any podcast to add it to your feed." },
      { question: "When do I receive email recaps?", answer: "Email recaps are sent daily at your configured delivery time. You can change your delivery time and timezone in Settings." },
      { question: "Can I pause email delivery?", answer: "Yes! In Settings, you can set a 'Pause emails until' date. You'll stop receiving emails until that date, but your feed will still update." },
    ],
  },
  {
    title: "Account Management",
    icon: Shield,
    items: [
      { question: "How do I change my email?", answer: "Go to Settings and update your email address in the Account section. Click Save to confirm the change." },
      { question: "How do I log out?", answer: "Go to Settings and scroll to the bottom. Click the 'Log out' button." },
      { question: "How do I update my profile?", answer: "Go to Settings and scroll to the Account Settings section. You can update your display name, location, language, and more." },
    ],
  },
  {
    title: "Feed & Content",
    icon: MessageCircle,
    items: [
      { question: "What's the difference between 'For You' and 'Following'?", answer: "The 'For You' tab shows recaps from all podcasts in our directory that might interest you. 'Following' shows only recaps from podcasts you explicitly follow." },
      { question: "How do bookmarks work?", answer: "Click the bookmark icon on any episode recap card to save it. Access your saved episodes from the Bookmarks page in the sidebar." },
      { question: "Can I share episode recaps?", answer: "Yes! Each recap card has a share button. On mobile, it uses your device's native share functionality. On desktop, it copies the link to your clipboard." },
    ],
  },
];

function FAQSection({ title, icon: Icon, items }: { title: string; icon: typeof HelpCircle; items: FAQItem[] }) {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  return (
    <section className="mb-8" data-testid={`faq-section-${title.toLowerCase().replace(/\s+/g, "-")}`}>
      <div className="flex items-center gap-2 mb-4">
        <Icon className="w-5 h-5 text-[#6366F1]" />
        <h2 className="text-[18px] md:text-[20px] font-bold text-[#09090B] dark:text-white">{title}</h2>
      </div>
      <div className="rounded-2xl bg-white dark:bg-[#111114] border border-[#F0F0F2] dark:border-[#1C1C22] overflow-hidden divide-y divide-[#F4F4F5] dark:divide-[#1C1C22]">
        {items.map((item, i) => (
          <div key={i}>
            <button
              onClick={() => setOpenIndex(openIndex === i ? null : i)}
              className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-[#FAFAFA] dark:hover:bg-[#18181B] transition-colors"
              data-testid={`faq-question-${i}`}
            >
              <span className="text-[15px] md:text-[16px] font-semibold text-[#09090B] dark:text-white pr-4">{item.question}</span>
              <ChevronDown className={`w-5 h-5 text-[#A1A1AA] flex-shrink-0 transition-transform ${openIndex === i ? "rotate-180" : ""}`} />
            </button>
            {openIndex === i && (
              <div className="px-5 pb-4">
                <p className="text-[14px] md:text-[15px] text-[#52525B] dark:text-[#A1A1AA] leading-relaxed">{item.answer}</p>
              </div>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

export default function HelpPage() {
  return (
    <DashboardLayout hideRightSidebar>
      <div className="min-h-screen bg-[#F9F9FB] dark:bg-[#09090B]" data-testid="help-page">
        <div className="max-w-5xl mx-auto px-4 md:px-8 py-8 pb-24 md:pb-8">
          <div className="mb-8">
            <h1 className="text-[24px] md:text-[28px] font-bold text-[#09090B] dark:text-white mb-2">Help & Support</h1>
            <p className="text-[15px] md:text-[16px] text-[#71717A] dark:text-[#A1A1AA]">Find answers to common questions and get in touch with our team.</p>
          </div>

          {FAQ_SECTIONS.map((section) => (
            <FAQSection key={section.title} {...section} />
          ))}

          <section className="mb-8">
            <h2 className="text-[18px] md:text-[20px] font-bold text-[#09090B] dark:text-white mb-4">Contact Us</h2>
            <div className="rounded-2xl bg-white dark:bg-[#111114] border border-[#F0F0F2] dark:border-[#1C1C22] p-5 md:p-6">
              <div className="flex items-start gap-3 mb-4">
                <Mail className="w-5 h-5 text-[#6366F1] mt-0.5" />
                <div>
                  <p className="text-[15px] md:text-[16px] font-semibold text-[#09090B] dark:text-white">Email Support</p>
                  <a href="mailto:hello@podcap.io" className="text-[14px] md:text-[15px] text-[#6366F1] hover:underline" data-testid="help-email-link">hello@podcap.io</a>
                </div>
              </div>
              <p className="text-[14px] md:text-[15px] text-[#52525B] dark:text-[#A1A1AA] leading-relaxed">
                Have a question, feature request, or feedback? We'd love to hear from you. Our team typically responds within 24 hours.
              </p>
            </div>
          </section>

          <section>
            <h2 className="text-[18px] md:text-[20px] font-bold text-[#09090B] dark:text-white mb-4">Resources</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              <Link href="/terms" className="rounded-2xl bg-white dark:bg-[#111114] border border-[#F0F0F2] dark:border-[#1C1C22] p-5 hover:border-[#6366F1]/30 transition-colors" data-testid="help-link-terms">
                <div className="flex items-center gap-2 mb-1">
                  <FileText className="w-4 h-4 text-[#6366F1]" />
                  <span className="text-[15px] font-semibold text-[#09090B] dark:text-white">Terms of Service</span>
                </div>
                <p className="text-[13px] text-[#71717A] dark:text-[#A1A1AA]">Our terms and conditions</p>
              </Link>
              <Link href="/privacy" className="rounded-2xl bg-white dark:bg-[#111114] border border-[#F0F0F2] dark:border-[#1C1C22] p-5 hover:border-[#6366F1]/30 transition-colors" data-testid="help-link-privacy">
                <div className="flex items-center gap-2 mb-1">
                  <Shield className="w-4 h-4 text-[#6366F1]" />
                  <span className="text-[15px] font-semibold text-[#09090B] dark:text-white">Privacy Policy</span>
                </div>
                <p className="text-[13px] text-[#71717A] dark:text-[#A1A1AA]">How we handle your data</p>
              </Link>
              <Link href="/updates" className="rounded-2xl bg-white dark:bg-[#111114] border border-[#F0F0F2] dark:border-[#1C1C22] p-5 hover:border-[#6366F1]/30 transition-colors" data-testid="help-link-updates">
                <div className="flex items-center gap-2 mb-1">
                  <MessageCircle className="w-4 h-4 text-[#6366F1]" />
                  <span className="text-[15px] font-semibold text-[#09090B] dark:text-white">Feature Updates</span>
                </div>
                <p className="text-[13px] text-[#71717A] dark:text-[#A1A1AA]">What's new and upcoming</p>
              </Link>
              <Link href="/contact" className="rounded-2xl bg-white dark:bg-[#111114] border border-[#F0F0F2] dark:border-[#1C1C22] p-5 hover:border-[#6366F1]/30 transition-colors" data-testid="help-link-contact">
                <div className="flex items-center gap-2 mb-1">
                  <Mail className="w-4 h-4 text-[#6366F1]" />
                  <span className="text-[15px] font-semibold text-[#09090B] dark:text-white">Contact Us</span>
                </div>
                <p className="text-[13px] text-[#71717A] dark:text-[#A1A1AA]">Get in touch with our team</p>
              </Link>
            </div>
          </section>
        </div>
      </div>
    </DashboardLayout>
  );
}
