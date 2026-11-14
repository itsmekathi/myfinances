import type { ReactNode } from 'react';
import { CONTACT_EMAIL, OPERATOR_NAME, PublicShell } from '../components/PublicShell';

const EFFECTIVE_DATE = '14 November 2026';

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="text-xl font-semibold">{title}</h2>
      {children}
    </section>
  );
}

const mail = (
  <a href={`mailto:${CONTACT_EMAIL}`} className="text-brand-600 hover:underline">
    {CONTACT_EMAIL}
  </a>
);

/** Public privacy policy (linked from the Google OAuth consent screen). */
export function PrivacyPage() {
  return (
    <PublicShell>
      <article className="mx-auto max-w-3xl space-y-8 px-4 py-12 leading-relaxed text-slate-700 dark:text-slate-300 [&_li]:ml-5 [&_li]:list-disc [&_ul]:space-y-1">
        <header className="space-y-2">
          <h1 className="text-3xl font-bold text-slate-900 dark:text-white">Privacy policy</h1>
          <p className="text-sm text-slate-500">Effective {EFFECTIVE_DATE}</p>
        </header>

        <p>
          MyFinances is an expense tracker operated by {OPERATOR_NAME} ("we", "us"). This policy explains what
          information MyFinances collects, how it is used, and the choices you have. It applies to the MyFinances website
          and mobile app.
        </p>

        <Section title="Information we collect">
          <p>
            <strong>Account information.</strong> Your email address, username and display name. If you sign up with a
            password, we store only a one-way hash of it (Argon2), never the password itself.
          </p>
          <p>
            <strong>Google sign-in.</strong> If you choose to sign in with Google, Google shares your Google account ID,
            email address, whether that email is verified, your name and your profile picture URL. We request only these
            basic profile details. We do not get access to your Gmail, contacts, files or any other Google data.
          </p>
          <p>
            <strong>Data you enter.</strong> The expenses you record (amounts, currencies, dates, notes, line items and
            tags), your categories, and any receipts or documents you attach.
          </p>
          <p>
            <strong>Technical information.</strong> When you create or edit an expense we record the type of device,
            browser or app version used, so you can see where a change came from. Your IP address is used briefly to
            protect the service from abuse (rate limiting). Our hosting providers may keep standard request logs for a
            limited time for security and troubleshooting.
          </p>
        </Section>

        <Section title="How we use it">
          <ul>
            <li>To create your account, sign you in and keep you signed in.</li>
            <li>To store, show and calculate summaries of the expenses you enter.</li>
            <li>To keep the service secure and working.</li>
          </ul>
          <p>
            We do not sell your information, show ads, or use advertising or analytics trackers. We do not use your data
            to train AI models.
          </p>
        </Section>

        <Section title="Google user data">
          <p>
            Information received from Google is used only to create your MyFinances account and sign you in. It is not
            shared with anyone except as needed to run the service (see "Service providers" below), and is never used for
            advertising. MyFinances' use of information received from Google APIs adheres to the{' '}
            <a
              href="https://developers.google.com/terms/api-services-user-data-policy"
              className="text-brand-600 hover:underline"
              target="_blank"
              rel="noreferrer"
            >
              Google API Services User Data Policy
            </a>
            , including the Limited Use requirements.
          </p>
        </Section>

        <Section title="Cookies and local storage">
          <p>
            The website sets one essential, secure cookie that keeps you signed in. The mobile app keeps the equivalent
            sign-in token in your device's secure storage. We do not use advertising or tracking cookies.
          </p>
        </Section>

        <Section title="Service providers">
          <p>Your data is processed by these providers on our behalf, only to run MyFinances:</p>
          <ul>
            <li>Neon: database hosting (accounts and expenses).</li>
            <li>Cloudflare R2: storage for attached files.</li>
            <li>Render: hosting for the MyFinances server.</li>
            <li>Vercel: hosting for the MyFinances website.</li>
            <li>Google: sign-in, if you choose to use it.</li>
          </ul>
          <p>These providers may process data in countries other than your own.</p>
        </Section>

        <Section title="Sharing">
          <p>
            Your data is private to your workspace. If you share a workspace with other people (when that feature is
            available), they can see that workspace's expenses and attachments. We may disclose information if required
            by law.
          </p>
        </Section>

        <Section title="Security">
          <p>
            All traffic is encrypted with HTTPS. Passwords and sign-in tokens are stored only as hashes, attached files
            are kept in private storage and can only be downloaded by signed-in members of the workspace. No system is
            perfectly secure, but we work to protect your information.
          </p>
        </Section>

        <Section title="Keeping and deleting your data">
          <p>
            We keep your information for as long as your account exists. Deleting an expense also deletes its attached
            files. To delete your account and all its data, email {mail} from the email address on your account; we will
            delete it within 30 days. Database backups may keep copies for a short additional period before they expire.
          </p>
          <p>You can also email us to ask for a copy of your data or to correct it.</p>
        </Section>

        <Section title="Children">
          <p>MyFinances is not intended for children under 13, and we do not knowingly collect their information.</p>
        </Section>

        <Section title="Changes to this policy">
          <p>
            If we change this policy, we will update it on this page and change the effective date above. For significant
            changes, we will notify you in the app or by email.
          </p>
        </Section>

        <Section title="Contact">
          <p>
            Questions or requests about your privacy: {mail} ({OPERATOR_NAME}).
          </p>
        </Section>
      </article>
    </PublicShell>
  );
}
