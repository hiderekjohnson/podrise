import { Link } from "wouter";
import { FileText, Trophy } from "lucide-react";
import { Footer } from "@/components/Footer";
import logoPath from "@assets/Podcap_logo_1772731738179.png";

export default function Terms() {
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
            <FileText className="w-5 h-5" />
            Terms & Conditions
          </div>
          <h1 className="sr-only">Terms & Conditions</h1>
          <p className="text-sm text-muted-foreground">Last updated: January 1, 2026</p>
        </div>

        <div className="prose prose-sm max-w-none space-y-6 text-foreground/80">
          <section>
            <h2 className="text-lg font-semibold text-foreground mb-2">1. Acceptance of Terms</h2>
            <p>By accessing or using PodCap ("the Service"), operated at podcap.io, you agree to be bound by these Terms and Conditions ("Terms"). If you do not agree to these Terms, you may not access or use the Service. These Terms constitute a legally binding agreement between you and PodCap ("we," "our," or "us").</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground mb-2">2. Description of Service</h2>
            <p>PodCap provides AI-generated daily summaries of podcast episodes delivered via email. The Service allows users to select podcasts, receive automated recaps, and manage their preferences through a web-based dashboard.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground mb-2">3. User Accounts</h2>
            <p>To use the Service, you must create an account by providing a valid email address. You are responsible for maintaining the confidentiality of your account and for all activities that occur under your account. You agree to notify us immediately of any unauthorized use of your account.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground mb-2">4. Free and Pro Plans</h2>
            <p><strong>Free Plan:</strong> Provides access to a limited number of podcast summaries. Free plan features and limitations are subject to change at our discretion.</p>
            <p><strong>Pro Plan:</strong> Available for $9.99 per month, the Pro plan offers unlimited podcast summaries and additional features as described on our website. Pro plan pricing and features are subject to change with reasonable notice.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground mb-2">5. Payments and Billing</h2>
            <p>Pro plan subscriptions are billed monthly through Stripe. By subscribing, you authorize us to charge your payment method on a recurring basis. You may cancel your subscription at any time, and cancellation will take effect at the end of the current billing period. We do not offer refunds for partial billing periods.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground mb-2">6. Acceptable Use</h2>
            <p>You agree not to:</p>
            <ul className="list-disc pl-5 space-y-1">
              <li>Use the Service for any unlawful purpose</li>
              <li>Attempt to gain unauthorized access to any part of the Service</li>
              <li>Interfere with or disrupt the Service or servers connected to the Service</li>
              <li>Use automated systems or software to extract data from the Service (scraping)</li>
              <li>Reproduce, distribute, or create derivative works from our content without permission</li>
              <li>Impersonate any person or entity or misrepresent your affiliation</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground mb-2">7. Intellectual Property</h2>
            <p>The Service, including its design, features, and content generated by PodCap, is protected by copyright, trademark, and other intellectual property laws. AI-generated podcast summaries are provided for personal, non-commercial use only. The original podcast content remains the property of its respective creators and rights holders.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground mb-2">8. Disclaimer of Warranties</h2>
            <p>THE SERVICE IS PROVIDED "AS IS" AND "AS AVAILABLE" WITHOUT WARRANTIES OF ANY KIND, EITHER EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO IMPLIED WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, AND NON-INFRINGEMENT. We do not warrant that the Service will be uninterrupted, error-free, or secure. AI-generated summaries may contain inaccuracies and should not be relied upon as a substitute for listening to the original podcast episodes.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground mb-2">9. Limitation of Liability</h2>
            <p>TO THE MAXIMUM EXTENT PERMITTED BY APPLICABLE LAW, IN NO EVENT SHALL PODCAP, ITS OFFICERS, DIRECTORS, EMPLOYEES, OR AGENTS BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES, OR ANY LOSS OF PROFITS OR REVENUES, WHETHER INCURRED DIRECTLY OR INDIRECTLY, OR ANY LOSS OF DATA, USE, GOODWILL, OR OTHER INTANGIBLE LOSSES RESULTING FROM YOUR USE OF THE SERVICE.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground mb-2">10. Indemnification</h2>
            <p>You agree to indemnify, defend, and hold harmless PodCap and its officers, directors, employees, and agents from and against any claims, liabilities, damages, losses, and expenses, including reasonable attorney's fees, arising out of or in any way connected with your access to or use of the Service or your violation of these Terms.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground mb-2">11. Termination</h2>
            <p>We reserve the right to suspend or terminate your account and access to the Service at our sole discretion, without notice, for conduct that we believe violates these Terms or is harmful to other users, us, or third parties, or for any other reason. Upon termination, your right to use the Service will immediately cease.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground mb-2">12. Governing Law</h2>
            <p>These Terms shall be governed by and construed in accordance with the laws of the United States, without regard to its conflict of law provisions. Any disputes arising under these Terms shall be resolved in the courts of competent jurisdiction.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground mb-2">13. Changes to Terms</h2>
            <p>We reserve the right to modify these Terms at any time. We will notify you of material changes by posting the updated Terms on this page and updating the "Last updated" date. Your continued use of the Service after any changes constitutes your acceptance of the revised Terms.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground mb-2">14. Contact Us</h2>
            <p>If you have any questions about these Terms, please <a href="/support" className="text-primary hover:underline">contact us</a>.</p>
          </section>
        </div>
      </main>

      <Footer />
    </div>
  );
}
