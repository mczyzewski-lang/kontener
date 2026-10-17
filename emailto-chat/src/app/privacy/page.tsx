import type { Metadata } from "next";
import { LegalPage, OPERATOR } from "@/components/legal/legal-page";

export const metadata: Metadata = { title: "Privacy Policy", description: "How emailto.chat accesses, uses, stores and protects your Gmail data." };

export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy Policy" updated="17 October 2026">
      <p>
        emailto.chat (“we”, “us”) is a web e-mail client that shows your Gmail as conversations with people. This policy explains what data we access, why, how
        we store and protect it, and the choices you have. The service is operated by {OPERATOR.name}, {OPERATOR.address}. Contact: <a href={`mailto:${OPERATOR.email}`}>{OPERATOR.email}</a>.
      </p>

      <h2>1. Google user data we access</h2>
      <p>When you sign in, we receive your Google account’s basic profile: name, e-mail address, profile picture and a stable account identifier (scopes <code>openid</code>, <code>email</code>, <code>profile</code>).</p>
      <p>
        When you separately choose to connect Gmail, we request the <code>https://www.googleapis.com/auth/gmail.modify</code> scope. It allows us to read your
        messages, threads, labels and attachments; send e-mail on your behalf when you press Send; create and update drafts; and change labels (read/unread, starred,
        archived, trash). It does not allow us to permanently delete your e-mail. We do not request full mailbox access (<code>https://mail.google.com/</code>).
      </p>

      <h2>2. How we use this data</h2>
      <ul>
        <li>To display your e-mail grouped by person and topic, including attachments, and to keep it in sync with Gmail.</li>
        <li>To send the messages you write, save your drafts, and apply the actions you take (mark read, archive, star, trash).</li>
        <li>To search your mail when you use search (we pass your query to Gmail’s search).</li>
        <li>To operate, secure and troubleshoot the service (for example, rate limiting and error logs that contain identifiers but not message content).</li>
      </ul>
      <p>We use Google user data only to provide and improve user-facing features that are visible and prominent in the app.</p>

      <h2>3. Limited Use</h2>
      <p>
        emailto.chat’s use and transfer to any other app of information received from Google APIs will adhere to the{" "}
        <a href="https://developers.google.com/terms/api-services-user-data-policy" target="_blank" rel="noopener noreferrer">
          Google API Services User Data Policy
        </a>
        , including the Limited Use requirements. In particular:
      </p>
      <ul>
        <li>We do not use Gmail data for advertising, including retargeting, personalized or interest-based ads.</li>
        <li>We do not sell Gmail data or transfer it to data brokers or information resellers.</li>
        <li>We do not use Gmail data to determine creditworthiness or for lending purposes.</li>
        <li>We do not use Gmail data to develop, improve or train generalized or non-personalized AI/ML models.</li>
        <li>
          No human at emailto.chat reads your e-mail, except (a) with your explicit consent for specific messages (e.g. a support request), (b) when necessary for
          security purposes such as investigating abuse, (c) to comply with applicable law, or (d) when the data has been aggregated and anonymized for internal
          operations.
        </li>
        <li>We transfer Gmail data to third parties only as necessary to provide the service (our hosting and database providers, listed below), to comply with law, or as part of a merger or acquisition with notice to you.</li>
      </ul>

      <h2>4. What we store, and for how long</h2>
      <p>We follow a minimal-retention approach:</p>
      <ul>
        <li>
          <strong>Index:</strong> for each message we store identifiers (Gmail message and thread IDs, Message-ID headers), sender and recipient addresses and names,
          subject, a short snippet (as provided by Gmail), date, Gmail labels and attachment metadata (file name, type, size). This is needed to show people, topics and
          files without re-downloading your whole mailbox.
        </li>
        <li>
          <strong>Not stored:</strong> message bodies and attachment contents. They are fetched from Gmail when you open a conversation or a file, passed through our
          servers to your browser over HTTPS, and not written to our database.
        </li>
        <li>
          <strong>Credentials:</strong> Google OAuth access and refresh tokens, encrypted at rest (AES-256-GCM). Tokens are never sent to your browser.
        </li>
        <li>
          <strong>Account data:</strong> your name, e-mail, preferences, active sessions (stored as hashed identifiers) and idempotency records of messages you sent (to prevent duplicate sending; they contain no message content).
        </li>
      </ul>
      <p>
        The index is kept while your Gmail is connected. When you disconnect Gmail, we revoke our access at Google and delete the index, tokens and drafts mapping.
        When you delete your account, we delete all data associated with it. Backups maintained by our database provider, if any, expire according to the provider’s
        retention schedule.
      </p>

      <h2>5. Service providers</h2>
      <p>
        We use infrastructure providers to run the service, such as our application hosting provider and our managed PostgreSQL provider. They process data only on our
        instructions. [List the concrete providers and regions before launch — e.g. hosting provider, database provider.]
      </p>

      <h2>6. Security</h2>
      <ul>
        <li>All traffic uses HTTPS. Session cookies are HttpOnly, Secure and SameSite.</li>
        <li>OAuth tokens are encrypted at rest; every request is authorized and scoped to your own data.</li>
        <li>HTML e-mails are sanitized and displayed without scripts; remote images are blocked by default.</li>
        <li>Attachments are served with headers that prevent them from executing in our domain.</li>
      </ul>
      <p>No system is perfectly secure. If you believe you have found a vulnerability, contact us at <a href={`mailto:${OPERATOR.email}`}>{OPERATOR.email}</a>.</p>

      <h2>7. Your choices and rights</h2>
      <ul>
        <li>Disconnect Gmail at any time in Settings, or revoke access in your Google Account at <a href="https://myaccount.google.com/permissions" target="_blank" rel="noopener noreferrer">myaccount.google.com/permissions</a>.</li>
        <li>Delete your account and all stored data in Settings.</li>
        <li>Depending on where you live (e.g. under the GDPR), you may have rights to access, correct, delete, restrict or port your data, and to complain to a supervisory authority. Contact us to exercise them.</li>
      </ul>

      <h2>8. Cookies</h2>
      <p>We use a strictly necessary session cookie and a short-lived cookie used during Google sign-in. We do not use advertising or third-party analytics cookies.</p>

      <h2>9. Children</h2>
      <p>The service is not directed to children under 16.</p>

      <h2>10. Changes</h2>
      <p>We will post changes here and, for material changes, notify you in the app.</p>
    </LegalPage>
  );
}
