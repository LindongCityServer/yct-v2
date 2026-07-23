'use client';

import { useEffect } from 'react';
import {
  detectEmbeddedContext,
  publishEmbeddedContextChanged,
  subscribeEmbeddedContextChanged,
} from '../lib/client-embedded-context';

export function EmbeddedContextBridge() {
  useEffect(() => {
    const unsubscribe = subscribeEmbeddedContextChanged(({ embedded }) => {
      document.documentElement.toggleAttribute('data-embedded', embedded);
    });

    publishEmbeddedContextChanged(detectEmbeddedContext());

    return unsubscribe;
  }, []);

  return null;
}
