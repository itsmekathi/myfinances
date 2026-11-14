import { Link } from 'react-router';
import { BarChart3, Paperclip, ShieldCheck, Smartphone, Tags, Wallet } from 'lucide-react';
import { PublicShell } from '../components/PublicShell';

const features = [
  { icon: Wallet, title: 'Track every expense', text: 'Record amounts, dates, notes and line items in seconds.' },
  { icon: Tags, title: 'Organise with categories', text: 'Group spending into categories and subcategories that fit your life.' },
  { icon: BarChart3, title: 'See where it goes', text: 'Monthly dashboards show your spending at a glance.' },
  { icon: Paperclip, title: 'Keep your receipts', text: 'Attach photos and PDFs of bills to any expense.' },
  { icon: Smartphone, title: 'Web and mobile', text: 'Use it in your browser or on your phone; your data stays in sync.' },
  { icon: ShieldCheck, title: 'Private by design', text: 'No ads, no tracking, and your data is never sold.' },
];

/** Public landing page shown at "/" to signed-out visitors (also the Google OAuth homepage). */
export function HomePage() {
  return (
    <PublicShell>
      <section className="bg-gradient-to-br from-brand-600 via-brand-700 to-indigo-900 text-white">
        <div className="mx-auto max-w-5xl px-4 py-20 sm:py-28">
          <h1 className="max-w-2xl text-4xl leading-tight font-bold sm:text-5xl">Know where your money goes.</h1>
          <p className="mt-4 max-w-xl text-lg text-brand-100">
            MyFinances is a simple, private expense tracker. Record what you spend, attach receipts, and see your
            spending by category and month.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              to="/login"
              className="rounded-lg bg-white px-5 py-2.5 font-medium text-brand-700 shadow-sm hover:bg-brand-50"
            >
              Get started free
            </Link>
            <Link to="/privacy" className="rounded-lg px-5 py-2.5 font-medium text-white ring-1 ring-white/40 hover:bg-white/10">
              Read our privacy policy
            </Link>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-4 py-16">
        <ul className="grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
          {features.map(({ icon: Icon, title, text }) => (
            <li key={title} className="space-y-2">
              <span className="flex size-10 items-center justify-center rounded-xl bg-brand-50 text-brand-600 dark:bg-indigo-950 dark:text-indigo-300">
                <Icon className="size-5" />
              </span>
              <h2 className="font-semibold">{title}</h2>
              <p className="text-sm text-slate-500">{text}</p>
            </li>
          ))}
        </ul>
        <p className="mt-12 text-sm text-slate-500">
          You can sign in with an email and password, or with your Google account. When you use Google, MyFinances only
          receives your name, email address and profile picture, and uses them solely to create and sign in to your
          account. See the <Link to="/privacy" className="text-brand-600 hover:underline">privacy policy</Link> for
          details.
        </p>
      </section>
    </PublicShell>
  );
}
