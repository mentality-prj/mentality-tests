import { pathToFileURL } from 'node:url';

export function assertPublicPreviewOrigin(value) {
  if (!value) {
    throw new Error(
      'E2E_BASE_URL is missing: configure environment e2e variable E2E_BASE_URL or supply the manual base_url input',
    );
  }
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error('E2E_BASE_URL must be a valid HTTPS preview origin');
  }
  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== '/' ||
    url.port
  ) {
    throw new Error(
      'E2E_BASE_URL must be an HTTPS origin without a path, port, query or credentials',
    );
  }
  const host = url.hostname.toLowerCase();
  if (
    host === 'dzvin.co' ||
    host.endsWith('.dzvin.co') ||
    host === 'mentality-web.vercel.app' ||
    host.includes('-git-production-')
  ) {
    throw new Error(
      'E2E_BASE_URL must not target a production hostname or production deployment alias',
    );
  }
  return url.origin;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const origin = assertPublicPreviewOrigin(process.env.E2E_BASE_URL);
    console.log(
      'Public browser E2E preflight PASS for nonproduction HTTPS origin: ' +
        new URL(origin).hostname,
    );
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
