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

/** Select the merged PR whose merge commit is the current dev ref. */
export function selectMergedDevPull({ ref, pulls }) {
  const devSha = ref?.object?.sha;
  if (!/^[0-9a-f]{40}$/.test(devSha ?? '')) {
    throw new Error('Frontend dev reference is missing or malformed');
  }
  if (!Array.isArray(pulls)) {
    throw new Error('Frontend merged pull request list is unavailable');
  }
  const merged = pulls.find(
    (pull) => pull.merged_at && pull.merge_commit_sha === devSha,
  );
  if (!merged || !Number.isInteger(merged.number)) {
    throw new Error('No merged frontend PR corresponds to the current dev head');
  }
  return { devSha, prNumber: merged.number };
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

  if (!env.GH_TOKEN) throw new Error('GH_TOKEN is required for Vercel preview discovery');

  const endpoint = `https://api.github.com/repos/${OWNER}/${REPOSITORY}`;
  const [ref, pulls] = await Promise.all([
    requester(`${endpoint}/git/ref/heads/dev`, env.GH_TOKEN),
    requester(
      `${endpoint}/pulls?state=closed&base=dev&sort=updated&direction=desc&per_page=40`,
      env.GH_TOKEN,
    ),
  ]);
  const { devSha, prNumber } = selectMergedDevPull({ ref, pulls });
  if (env.E2E_WEB_PR_NUMBER && env.E2E_WEB_PR_NUMBER !== String(prNumber)) {
    throw new Error('E2E_WEB_PR_NUMBER does not match the current merged frontend dev head');
  }
  const pull = await requester(`${endpoint}/pulls/${prNumber}`, env.GH_TOKEN);
  const prSha = pull?.head?.sha;
  if (!/^[0-9a-f]{40}$/.test(prSha ?? '')) {
    throw new Error('Frontend PR has no valid exact-head commit SHA');
  }
  const [status, comments, devCommit, prCommit] = await Promise.all([
    requester(`${endpoint}/commits/${prSha}/status`, env.GH_TOKEN),
    requester(`${endpoint}/issues/${prNumber}/comments?per_page=100`, env.GH_TOKEN),
    requester(`${endpoint}/git/commits/${devSha}`, env.GH_TOKEN),
    requester(`${endpoint}/git/commits/${prSha}`, env.GH_TOKEN),
  ]);
  if (
    !/^[0-9a-f]{40}$/.test(devCommit?.tree?.sha ?? '') ||
    devCommit.tree.sha !== prCommit?.tree?.sha
  ) {
    throw new Error('Frontend preview source tree differs from the current dev tree');
  }
  const preview = selectVerifiedVercelPreview({ pull, status, comments });
  return { url: preview.url, sha: devSha, prSha };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const { url, sha } = await resolvePreview(process.env);
    if (!process.env.GITHUB_ENV) {
      throw new Error('GITHUB_ENV is required for workflow URL propagation');
    }
    appendFileSync(process.env.GITHUB_ENV, 'E2E_BASE_URL=' + url + '\n');
    console.log(
      'Preview resolution PASS: ' +
        new URL(url).hostname +
        (sha ? ' (verified frontend dev tree ' + sha.slice(0, 12) + ')' : ' (configured e2e origin)'),
    );
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
