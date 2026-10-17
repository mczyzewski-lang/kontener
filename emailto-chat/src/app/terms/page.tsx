import type { Metadata } from "next";
import { LegalPage, OPERATOR } from "@/components/legal/legal-page";

export const metadata: Metadata = { title: "Terms of Service", description: "The terms that apply to your use of emailto.chat." };

export default function TermsPage() {
  return (
    <LegalPage title="Terms of Service" updated="17 October 2026">
      <p>
        These Terms govern your use of emailto.chat (the “Service”), operated by {OPERATOR.name} (“we”). By using the Service you agree to these Terms. If you do not
        agree, do not use the Service.
      </p>

      <h2>1. The Service</h2>
      <p>
        emailto.chat is an e-mail client for Gmail that presents your e-mail as conversations with people. It is not a separate messaging network: messages you send are
        regular e-mails sent through your Gmail account. E-mail delivery and synchronization are not instantaneous and may be delayed.
      </p>
      <p>The Service is currently offered as a beta. Features may change, and we may suspend or discontinue the Service with reasonable notice.</p>

      <h2>2. Your account</h2>
      <ul>
        <li>You must have a Google account and the right to use the Gmail account you connect.</li>
        <li>You are responsible for activity in your account and for keeping your Google account secure.</li>
        <li>You can disconnect Gmail or delete your account at any time in Settings.</li>
      </ul>

      <h2>3. Acceptable use</h2>
      <p>You agree not to use the Service to send spam or unsolicited bulk e-mail, to violate any law or Google’s terms and policies, to infringe others’ rights, to distribute malware, or to attempt to disrupt or gain unauthorized access to the Service.</p>

      <h2>4. Your content</h2>
      <p>
        Your e-mail remains yours. You grant us only the permissions needed to operate the Service for you as described in our <a href="/privacy">Privacy Policy</a>. Gmail
        remains the source of truth; actions you take in the Service (send, archive, mark read, star, trash) are applied to your Gmail account.
      </p>

      <h2>5. Third-party services</h2>
      <p>The Service relies on Google APIs. Your use of Gmail is also subject to Google’s terms. We are not affiliated with or endorsed by Google.</p>

      <h2>6. Disclaimers</h2>
      <p>
        The Service is provided “as is” and “as available”. To the extent permitted by law, we disclaim all warranties, including fitness for a particular purpose and
        non-infringement. We do not guarantee that e-mails will be delivered, synchronized or displayed without errors or delays. Keep important information in Gmail, which
        remains your primary mailbox.
      </p>

      <h2>7. Limitation of liability</h2>
      <p>
        To the extent permitted by law, we are not liable for indirect, incidental or consequential damages, or for loss of data or profits, arising from your use of the
        Service. Nothing in these Terms limits liability that cannot be limited under applicable law, including consumer protection law.
      </p>

      <h2>8. Termination</h2>
      <p>You may stop using the Service at any time. We may suspend accounts that violate these Terms. On termination we delete your stored data as described in the Privacy Policy.</p>

      <h2>9. Changes and contact</h2>
      <p>
        We may update these Terms; we will post the new version here and notify you of material changes. Governing law: [to be completed before launch]. Questions:{" "}
        <a href={`mailto:${OPERATOR.email}`}>{OPERATOR.email}</a>.
      </p>
    </LegalPage>
  );
}
