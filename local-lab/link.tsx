import type { AnchorHTMLAttributes } from 'react';

// This standalone build has no Next router; navigation stays a normal link.
export default function LocalLink(props: AnchorHTMLAttributes<HTMLAnchorElement>) {
  return <a {...props} />;
}
