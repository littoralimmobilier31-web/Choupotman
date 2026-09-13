'use client';

import * as React from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Search, X } from 'lucide-react';
import { Input } from '@/components/ui/field';
import type { Dictionary } from '@/lib/i18n/types';

/**
 * Blog search box. Debounced and URL-driven, so the server does the filtering
 * and the resulting page stays linkable.
 */
export function BlogSearch({ dict, initialQuery }: { dict: Dictionary; initialQuery: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [value, setValue] = React.useState(initialQuery);

  React.useEffect(() => {
    if (value === initialQuery) return;
    const timer = setTimeout(() => {
      const params = new URLSearchParams(searchParams.toString());
      if (value.trim() === '') params.delete('q');
      else params.set('q', value.trim());
      const qs = params.toString();
      router.push(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    }, 350);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  return (
    <div className="relative">
      <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-fg-subtle" />
      <Input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={dict.blog.search}
        aria-label={dict.blog.search}
        className="ps-9"
      />
      {value !== '' && (
        <button
          type="button"
          onClick={() => setValue('')}
          aria-label={dict.common.cancel}
          className="absolute end-2.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-fg-subtle hover:text-fg"
        >
          <X className="size-3.5" />
        </button>
      )}
    </div>
  );
}
