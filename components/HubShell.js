import Link from 'next/link';
import { useRouter } from 'next/router';

export default function HubShell({ children, admin = false }) {
  const { pathname } = useRouter();
  const links = admin
    ? [['/admin', 'Events'], ['/admin/support', 'Support inbox'], ['/admin/venues', 'Venues'], ['/help', 'Help centre']]
    : [['/my-events', 'My events'], ['/help', 'Help & recovery'], ['/pro/portal', 'My account']];
  return <div className="std-hub">
    <header className="std-hub-header">
      <Link href="/my-events" className="std-wordmark"><span aria-hidden="true">✳</span> Set The Date<span className="std-wordmark-dot">.</span></Link>
      <nav aria-label={admin ? 'Admin navigation' : 'Your planning space'}>
        {links.map(([href, label]) => <Link key={href} href={href} aria-current={pathname === href ? 'page' : undefined}>{label}</Link>)}
      </nav>
      <Link className="std-hub-cta" href="/">Create a poll ↗</Link>
    </header>
    <div className="std-hub-intro"><span>{admin ? 'YOUR WORKSPACE' : 'GOOD COMPANY. ONE PLACE.'}</span><p>{admin ? 'Keep every plan and conversation moving.' : 'A little less organising. A lot more getting together.'}</p><span aria-hidden="true" className="std-hub-star">✳</span></div>
    <div className="std-hub-content">{children}</div>
    <footer className="std-hub-footer"><span>Made for real life. Made in Folkestone.</span><Link href="/help">Need a hand? →</Link></footer>
  </div>;
}
