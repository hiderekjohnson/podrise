import { useEffect } from "react";
import { Shield } from "lucide-react";
import { Footer } from "@/components/Footer";
import { SiteHeader } from "@/components/SiteHeader";

function SEOHead() {
  useEffect(() => {
    const title = "Privacy Policy | PodRise";
    const desc = "Read PodRise's privacy policy. Learn how we handle your data, protect your information, and respect your privacy.";
    document.title = title;
    const setMeta = (attr: string, key: string, value: string) => {
      let el = document.querySelector(`meta[${attr}="${key}"]`) as HTMLMetaElement | null;
      if (!el) { el = document.createElement("meta"); el.setAttribute(attr, key); document.head.appendChild(el); }
      el.setAttribute("content", value);
    };
    setMeta("name", "description", desc);
    setMeta("property", "og:title", title);
    setMeta("property", "og:description", desc);
    setMeta("name", "twitter:card", "summary");
    setMeta("name", "twitter:title", title);
    setMeta("name", "twitter:description", desc);
  }, []);
  return null;
}

export default function Privacy() {
  return (
    <div className="min-h-screen flex flex-col bg-background">
      <SEOHead />
      <SiteHeader />

      <main className="flex-1 w-full max-w-3xl mx-auto px-6 py-10">
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2.5 px-6 py-2.5 rounded-full bg-primary/[0.07] text-primary text-base sm:text-lg font-display font-bold uppercase tracking-widest mb-4">
            <Shield className="w-5 h-5" />
            Privacy Policy
          </div>
          <h1 className="sr-only">Privacy Policy</h1>
          <p className="text-base text-[#52525B] dark:text-[#A1A1AA]">Last updated: March 14, 2026</p>
        </div>

        <div className="prose prose-sm max-w-none space-y-6 text-[#52525B] dark:text-[#A1A1AA]">
          <section>
            <h2 className="text-lg font-semibold text-foreground mb-2">1. Introduction</h2>
            <p>PodRise ("we," "our," or "us") operates the website podrise.com (the "Service"). This Privacy Policy explains how we collect, use, disclose, and safeguard your information when you visit our website and use our Service. By using the Service, you agree to the collection and use of information in accordance with this policy.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground mb-2">2. Information We Collect</h2>
            <p><strong>Personal Information:</strong> When you create an account, we collect your email address. This is used for authentication via magic link login and to deliver your daily podcast digest emails.</p>
            <p><strong>Usage Data:</strong> We automatically collect information about how you interact with our Service, including podcast preferences, pages visited, and features used.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground mb-2">3. How We Use Your Information</h2>
            <p>We use the information we collect to:</p>
            <ul className="list-disc pl-5 space-y-1">
              <li>Provide, maintain, and improve the Service</li>
              <li>Send you daily podcast digest emails based on your preferences</li>
              <li>Authenticate your identity via magic link login</li>
              <li>Communicate with you about service updates and changes</li>
              <li>Monitor and analyze usage patterns and trends</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground mb-2">4. Data Sharing and Disclosure</h2>
            <p>We do not sell, trade, or rent your personal information to third parties. We may share your information with:</p>
            <ul className="list-disc pl-5 space-y-1">
              <li><strong>Service Providers:</strong> Third-party companies that assist us in operating our Service, such as Resend (email delivery) and hosting providers</li>
              <li><strong>Legal Requirements:</strong> When required by law, subpoena, or other legal process</li>
              <li><strong>Business Transfers:</strong> In connection with a merger, acquisition, or sale of assets</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground mb-2">5. Data Security</h2>
            <p>We implement appropriate technical and organizational security measures to protect your personal information against unauthorized access, alteration, disclosure, or destruction. However, no method of transmission over the Internet or electronic storage is 100% secure, and we cannot guarantee absolute security.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground mb-2">6. Data Retention</h2>
            <p>We retain your personal information for as long as your account is active or as needed to provide you with the Service. You may request deletion of your account and associated data by <a href="/support" className="text-primary hover:underline">contacting us</a>.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground mb-2">7. Cookies and Tracking</h2>
            <p>We use session cookies to maintain your authenticated state. These are essential cookies required for the Service to function and cannot be disabled. We do not use advertising or third-party tracking cookies.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground mb-2">8. Advertising and Sponsored Content</h2>
            <p>The Service may include advertisements and sponsored content within emails, on the website, and in any audio or video content we produce. In connection with advertising:</p>
            <ul className="list-disc pl-5 space-y-1">
              <li><strong>We do not sell your personal information to advertisers.</strong> We do not share your name, email address, or any individually identifiable information with advertising partners</li>
              <li><strong>Audience-based targeting:</strong> Advertisements may be targeted based on aggregated, non-personally-identifiable audience segments derived from your podcast preferences, selected industries, professional roles, and interest categories. Advertisers select audience segments — they never receive individual user data</li>
              <li><strong>Click tracking:</strong> When you click on a link in our emails, we may record that a click occurred for aggregate analytics purposes (such as measuring overall campaign performance). This data is used internally and is not shared with advertisers in a personally identifiable form</li>
              <li><strong>Third-party advertiser practices:</strong> If you interact with an advertisement and visit a third-party website, that third party's privacy policy will govern their collection and use of your data. We encourage you to review their policies before providing any information</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground mb-2">9. Your Rights</h2>
            <p>Depending on your jurisdiction, you may have the right to:</p>
            <ul className="list-disc pl-5 space-y-1">
              <li>Access the personal information we hold about you</li>
              <li>Request correction of inaccurate data</li>
              <li>Request deletion of your data</li>
              <li>Object to or restrict processing of your data</li>
              <li>Data portability</li>
              <li>Withdraw consent at any time</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground mb-2">10. Children's Privacy</h2>
            <p>Our Service is not directed to individuals under the age of 13. We do not knowingly collect personal information from children under 13. If we become aware that we have collected personal information from a child under 13, we will take steps to delete such information.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground mb-2">11. Changes to This Policy</h2>
            <p>We may update this Privacy Policy from time to time. We will notify you of any material changes by posting the updated policy on this page and updating the "Last updated" date. Your continued use of the Service after any changes constitutes your acceptance of the revised policy.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground mb-2">12. Contact Us</h2>
            <p>If you have any questions about this Privacy Policy, please <a href="/support" className="text-primary hover:underline">contact us</a>.</p>
          </section>
        </div>
      </main>

      <Footer />
    </div>
  );
}
