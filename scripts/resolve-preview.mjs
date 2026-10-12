import { appendFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

import { assertPublicPreviewOrigin } from './public-preflight.mjs';

const OWNER = 'mentality-prj';
const REPOSITORY = 'mentality-web';
const VERCEL_PROJECT_PREFIX = 'mentality-web-git-';
const VERCEL_PROJECT_SUFFIX = '-taras-gezs-projects.vercel.app';

export function selectVerifiedVercelPreview({ pull, status, comments }) {
  const sha = pull?.head?.sha;
  if (!/^[0-9a-f]{40}$/.test(sha ?? '')) {
    throw new Error('Frontend PR has no valid exact-head commit SHA');
  }
  const succeeded = status?.statuses?.find(
    (entry) =>
      entry.context === 'Vercel' &&
      entry.state === 'success' &&
      typeof entry.target_url === 'string' &&
      entry.target_url.startsWith('https://vercel.com/'),
  );
  if (!succeeded || status.state === 'failure') {
    throw new Error('Frontend PR head has no successful Vercel deployment status');
  }
  for (const comment of comments ?? []) {
    if (comment.user?.login !== 'vercel[bot]') continue;
    if (!comment.body?.includes(`[Ready](${succeeded.target_url})`)) continue;
    const preview = comment.body.match(/\[Preview\]\((https:\/\/[^)]+)\)/);
    if (!preview) continue;
    const url = new URL(assertPublicPreviewOrigin(preview[1]));
    if (
      !url.hostname.startsWith(VERCEL_PROJECT_PREFIX) ||
      !url.hostname.endsWith(VERCEL_PROJECT_SUFFIX)
    ) {
      continue;
    }
    return { url: url.origin, sha };
  }
  throw new Error('No ready Vercel bot preview linked to the exact frontend PR head');
}

async function githubJson(url, token) {
  const response = await fetch(url, {
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'X-GitHub-Api-Version': '2022-11-28',
    },
  });
  if (!response.ok) throw new Error('GitHub preview lookup failed (HTTP ' + response.status + ')');
  return response.json();
}

export async function resolvePreview(env, requester = githubJson) {
  if (env.E2E_BASE_URL) {
    return { url: assertPublicPreviewOrigin(env.E2E_BASE_URL), sha: null };
  }

  // Temporary bridge for the currently reviewed frontend changes.
  // Override E2E_WEB_PR_NUMBER or define stable E2E_BASE_URL for later releases.
  const pr = env.E2E_WEB_PR_NUMBER || '444';
  if (!/^[1-9]\d{0,5}$/.test(pr)) throw new Error('E2E_WEB_PR_NUMBER must be a PR number');
  if (!env.GH_TOKEN) throw new Error('GH_TOKEN is required for Vercel preview discovery');

  const endpoint = `https://api.github.com/repos/${OWNER}/${REPOSITORY}`;
  const pull = await requester(`${endpoint}/pulls/${pr}`, env.GH_TOKEN);
  const sha = pull?.head?.sha;
  if (!/^[0-9a-f]{40}$/.test(sha ?? '')) {
    throw new Error('Frontend PR has no valid exact-head commit SHA');
  }
  const [status, comments] = await Promise.all([
    requester(`${endpoint}/commits/${sha}/status`, env.GH_TOKEN),
    requester(`${endpoint}/issues/${pr}/comments?per_page=100`, env.GH_TOKEN),
  ]);
  return selectVerifiedVercelPreview({ pull, status, comments });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const { url, sha } = await resolvePreview(process.env);
    if (!process.env.GITHUB_ENV) throw new Error('GITHUB_ENV is required for workflow URL propagation');
    appendFileSync(process.env.GITHUB_ENV, 'E2E_BASE_URL=' + url + '\n');
    console.log(
      'Preview resolution PASS: ' +
        new URL(url).hostname +
        (sha ? ' (web PR head ' + sha.slice(0, 12) + ')' : ' (configured e2e origin)'),
    );
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
