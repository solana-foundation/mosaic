import Link from 'next/link';
import { cn } from '@/lib/utils';

export default function DocsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const nav = [
    { href: '/docs', label: 'Overview' },
    { href: '/docs/website', label: 'About the App' },
    { href: '/docs/templates', label: 'Token Templates' },
    { href: '/docs/deps', label: 'SDK, CLI, and Deps' },
  ];

  return (
    <div className="flex-1 p-6 md:p-8">
      <div className="mx-auto grid w-full max-w-6xl gap-6 md:grid-cols-[240px_1fr]">
        <aside className="hidden md:block">
          <nav className="space-y-1">
            <h2 className="mb-2 px-3 text-xs font-semibold tracking-wider text-muted-foreground uppercase">
              Documentation
            </h2>
            {nav.map(item => (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'block rounded-md px-3 py-2 text-sm hover:bg-muted'
                )}
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </aside>
        <section className="min-w-0">
          <div className="prose prose-invert max-w-none">{children}</div>
        </section>
      </div>
    </div>
  );
}
