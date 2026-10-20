// Mirrors index.html's import map for Node: bare "three" → vendored copy.
import { register } from 'node:module';

register('data:text/javascript,' + encodeURIComponent(`
  const THREE_URL = ${JSON.stringify(new URL('../../vendor/three/three.module.js', import.meta.url).href)};
  export async function resolve(specifier, context, next) {
    if (specifier === 'three') return { url: THREE_URL, shortCircuit: true };
    return next(specifier, context);
  }
`));
