import { Link } from "wouter";
import { Shield, Trophy } from "lucide-react";
import { Footer } from "@/components/Footer";
import logoPath from "@assets/Podcap_logo_1772731738179.png";

export default function Privacy() {
  return (
    <div className="min-h-screen flex flex-col bg-background">
      <nav className="sticky top-0 z-50 w-full border-b border-black/[0.04] bg-white/80 backdrop-blur-md" data-testid="nav-bar">
        <div className="max-w-6xl mx-auto flex items-center justify-between h-14 px-6">
          <a href="/" className="flex items-center" data-testid="link-home">
            <img src={logoPath} alt="PodCap" className="h-6 object-contain" />
          </a>
          <div className="flex items-center gap-4">
            <Link href="/podcasts" data-testid="link-nav-podcasts">
              <div className="flex items-center gap-1.5 px-4 py-2 bg-amber-500/10 border border-amber-500/20 rounded-full text-xs font-semibold text-amber-600 tracking-wide uppercase hover:bg-amber-500/15 transition-colors">
                <Trophy className="w-3.5 h-3.5" />
                Top Podcasts
              </div>
            </Link>
            <Link href="/login" className="text-sm text-muted-foreground hover:text-foreground transition-colors" data-testid="link-login">
              Log In
            </Link>
          </div>
        </div>
      </nav>

      <main className="flex-1 w-full max-w-3xl mx-auto px-6 py-10">
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2.5 px-6 py-2.5 rounded-full bg-primary/[0.07] text-primary text-base sm:text-lg font-display font-bold uppercase tracking-widest mb-4">
            <Shield className="w-5 h-5" />
            Privacy Policy
          </div>
          <h1 className="sr-only">Privacy Policy</h1>
          <p className="text-sm text-muted-foreground">Last updated: January 1, 2026</p>
        </div>

        <div className="prose prose-sm max-w-none space-y-6 text-foreground/80">
          <section>
            <h2 className="text-lg font-semibold text-foreground mb-2">1. Introduction</h2>
            <p>PodCap ("we," "our," or "us") operates the website podcap.io (the "Service"). This Privacy Policy explains how we collect, use, disclose, and safeguard your information when you visit our website and use our Service. By using the Service, you agree to the collection and use of information in accordance with this policy.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground mb-2">2. Information We Collect</h2>
            <p><strong>Personal Information:</strong> When you create an account, we collect your email address. This is used for authentication via magic link login and to deliver your daily podcast digest emails.</p>
            <p><strong>Usage Data:</strong> We automatically collect information about how you interact with our Service, including podcast preferences, pages visited, and features used.</p>
            <p><strong>Payment Information:</strong> If you subscribe to our Pro plan, payment processing is handled by Stripe. We do not store your credit card details on our servers. Please refer to Stripe's privacy policy for information on how they handle your payment data.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground mb-2">3. How We Use Your Information</h2>
            <p>We use the information we collect to:</p>
            <ul className="list-disc pl-5 space-y-1">
              <li>Provide, maintain, and improve the Service</li>
              <li>Send you daily podcast digest emails based on your preferences</li>
              <li>Authenticate your identity via magic link login</li>
              <li>Process payments and manage subscriptions</li>
              <li>Communicate with you about service updates and changes</li>
              <li>Monitor and analyze usage patterns and trends</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground mb-2">4. Data Sharing and Disclosure</h2>
            <p>We do not sell, trade, or rent your personal information to third parties. We may share your information with:</p>
            <ul className="list-disc pl-5 space-y-1">
              <li><strong>Service Providers:</strong> Third-party companies that assist us in operating our Service, such as Stripe (payments), Resend (email delivery), and hosting providers</li>
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
            <h2 className="text-lg font-semibold text-foreground mb-2">8. Your Rights</h2>
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
            <h2 className="text-lg font-semibold text-foreground mb-2">9. Children's Privacy</h2>
            <p>Our Service is not directed to individuals under the age of 13. We do not knowingly collect personal information from children under 13. If we become aware that we have collected personal information from a child under 13, we will take steps to delete such information.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground mb-2">10. Changes to This Policy</h2>
            <p>We may update this Privacy Policy from time to time. We will notify you of any material changes by posting the updated policy on this page and updating the "Last updated" date. Your continued use of the Service after any changes constitutes your acceptance of the revised policy.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground mb-2">11. Contact Us</h2>
            <p>If you have any questions about this Privacy Policy, please <a href="/support" className="text-primary hover:underline">contact us</a>.</p>
          </section>
        </div>
      </main>

      <Footer />
    </div>
  );
}
