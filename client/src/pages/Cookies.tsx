import { useEffect } from "react";
import { Cookie } from "lucide-react";
import { Footer } from "@/components/Footer";
import { SiteHeader } from "@/components/SiteHeader";
import { useAuth } from "@/hooks/use-auth";

function SEOHead() {
  useEffect(() => {
    const title = "Cookie Policy | PodRise";
    const desc = "Learn about the cookies PodRise uses, why we use them, and how you can manage your cookie preferences.";
    document.title = title;
    const setMeta = (attr: string, key: string, value: string) => {
      let el = document.querySelector(`meta[${attr}="${key}"]`) as HTMLMetaElement | null;
      if (!el) { el = document.createElement("meta"); el.setAttribute(attr, key); document.head.appendChild(el); }
      el.setAttribute("content", value);
    };
    setMeta("name", "description", desc);
    setMeta("property", "og:title", title);
    setMeta("property", "og:description", desc);
    setMeta("property", "og:url", "https://podrise.com/cookies");
    setMeta("property", "og:type", "website");
    setMeta("property", "og:site_name", "PodRise");
    setMeta("name", "twitter:card", "summary");
    setMeta("name", "twitter:site", "@podrise_hq");
    setMeta("name", "twitter:title", title);
    setMeta("name", "twitter:description", desc);

    let canonical = document.querySelector('link[rel="canonical"]') as HTMLLinkElement | null;
    if (!canonical) { canonical = document.createElement("link"); canonical.rel = "canonical"; document.head.appendChild(canonical); }
    canonical.href = "https://podrise.com/cookies";
  }, []);
  return null;
}

export default function Cookies() {
  const { data: user } = useAuth();

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <SEOHead />
      {!user && <SiteHeader />}

      <main className="flex-1 w-full max-w-3xl mx-auto px-6 py-10">
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2.5 px-6 py-2.5 rounded-full bg-primary/[0.07] text-primary text-base sm:text-lg font-display font-bold uppercase tracking-widest mb-4">
            <Cookie className="w-5 h-5" />
            Cookie Policy
          </div>
          <h1 className="sr-only">Cookie Policy</h1>
          <p className="text-base text-[#52525B] dark:text-[#A1A1AA]">Last updated: March 14, 2026</p>
        </div>

        <div className="prose prose-sm max-w-none space-y-6 text-[#52525B] dark:text-[#A1A1AA]">
          <section>
            <h2 className="text-lg font-semibold text-foreground mb-2">1. What Are Cookies</h2>
            <p>Cookies are small text files that are stored on your device (computer, tablet, or mobile phone) when you visit a website. They are widely used to make websites work more efficiently, provide a better user experience, and supply information to the site owners. Cookies allow websites to remember your actions and preferences over a period of time so you don't have to keep re-entering them.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground mb-2">2. How PodRise Uses Cookies</h2>
            <p>PodRise ("we," "our," or "us") uses cookies on podrise.com (the "Service") for several purposes. Below is a description of the types of cookies we use and what they do:</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground mb-2">3. Essential Cookies</h2>
            <p>These cookies are strictly necessary for the Service to function and cannot be switched off. They are typically set in response to actions you take, such as logging in or setting your preferences. Without these cookies, the Service cannot operate properly.</p>
            <ul className="list-disc pl-5 space-y-1">
              <li><strong>Session cookies:</strong> Used to maintain your authenticated state after you log in via magic link. These cookies ensure you remain logged in as you navigate between pages.</li>
              <li><strong>Security cookies:</strong> Used to support security features and help detect malicious activity.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground mb-2">4. Analytics Cookies</h2>
            <p>We use analytics cookies to understand how visitors interact with our Service. These cookies help us measure and improve the performance of our site by collecting information about which pages are visited most often, how users navigate between pages, and whether users encounter error messages.</p>
            <ul className="list-disc pl-5 space-y-1">
              <li>Analytics data is collected in aggregate and does not personally identify you.</li>
              <li>This information helps us improve the layout, content, and overall experience of the Service.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground mb-2">5. Preference Cookies</h2>
            <p>Preference cookies allow the Service to remember choices you make, such as:</p>
            <ul className="list-disc pl-5 space-y-1">
              <li><strong>Theme preferences:</strong> Whether you prefer light or dark mode.</li>
              <li><strong>Display settings:</strong> Your preferred layout or view options within the dashboard.</li>
            </ul>
            <p>These cookies enhance your experience by personalizing the Service to your preferences without you needing to reconfigure settings each time you visit.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground mb-2">6. Third-Party Cookies</h2>
            <p>We may use third-party services that set their own cookies. These include:</p>
            <ul className="list-disc pl-5 space-y-1">
              <li><strong>Analytics:</strong> We may use analytics services that set cookies to help us understand how users interact with our Service.</li>
            </ul>
            <p>We do not use advertising or third-party tracking cookies. We do not allow third parties to use cookies on our Service for their own advertising purposes.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground mb-2">7. Managing Your Cookie Preferences</h2>
            <p>You can control and manage cookies in several ways. Please note that removing or blocking certain cookies may impact your experience and the functionality of the Service.</p>
            <p><strong>Browser settings:</strong> Most web browsers allow you to manage cookies through their settings. You can typically find these settings in the "Options," "Preferences," or "Privacy" menu of your browser. The following links provide instructions for common browsers:</p>
            <ul className="list-disc pl-5 space-y-1">
              <li><a href="https://support.google.com/chrome/answer/95647" className="text-primary hover:underline" target="_blank" rel="noopener noreferrer">Google Chrome</a></li>
              <li><a href="https://support.mozilla.org/en-US/kb/cookies-information-websites-store-on-your-computer" className="text-primary hover:underline" target="_blank" rel="noopener noreferrer">Mozilla Firefox</a></li>
              <li><a href="https://support.apple.com/guide/safari/manage-cookies-sfri11471" className="text-primary hover:underline" target="_blank" rel="noopener noreferrer">Safari</a></li>
              <li><a href="https://support.microsoft.com/en-us/microsoft-edge/manage-cookies-in-microsoft-edge-view-allow-block-delete-and-use-168dab11-0753-043d-7c16-ede5947fc64d" className="text-primary hover:underline" target="_blank" rel="noopener noreferrer">Microsoft Edge</a></li>
            </ul>
            <p><strong>Please note:</strong> If you disable essential cookies, you may not be able to log in or use key features of the Service.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground mb-2">8. Changes to This Policy</h2>
            <p>We may update this Cookie Policy from time to time to reflect changes in technology, regulation, or our business practices. We will notify you of any material changes by posting the updated policy on this page and updating the "Last updated" date. Your continued use of the Service after any changes constitutes your acceptance of the revised policy.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground mb-2">9. Contact Us</h2>
            <p>If you have any questions about our use of cookies or this Cookie Policy, please <a href="/contact" className="text-primary hover:underline">contact us</a>.</p>
          </section>
        </div>
      </main>

      {!user && <Footer />}
    </div>
  );
}
