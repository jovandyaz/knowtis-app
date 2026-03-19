import type { ArtifactType } from '@knowtis/shared-types';

interface KnowtisEventMap {
  'knowtis:generate-artifact': CustomEvent<{ type: ArtifactType }>;
}

export function dispatchKnowtisEvent<K extends keyof KnowtisEventMap>(
  type: K,
  detail: KnowtisEventMap[K]['detail']
): void {
  window.dispatchEvent(new CustomEvent(type, { detail }));
}

export function addKnowtisListener<K extends keyof KnowtisEventMap>(
  type: K,
  listener: (event: KnowtisEventMap[K]) => void
): () => void {
  window.addEventListener(type, listener as EventListener);
  return () => window.removeEventListener(type, listener as EventListener);
}
