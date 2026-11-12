import assert from 'node:assert/strict'
import fs from 'node:fs'
import { execFileSync } from 'node:child_process'
import { pathToFileURL } from 'node:url'

export const requiredChecks = ['unit (ubuntu-latest)', 'unit (windows-latest)', 'host (ubuntu-latest)', 'host (windows-latest)']

export function validateSource({ tag, version, head, tagged, onMain, workflowRef, workflowSha }) {
  assert.match(tag, /^v\d+\.\d+\.\d+(?:-[\w.-]+)?$/, 'Expected an immutable version tag')
  assert.equal(tag, `v${version}`, 'Tag and package version differ')
  assert.equal(head, tagged, 'Checkout is not the tagged source')
  assert.equal(onMain, true, 'Release source must already be merged into origin/main')
  assert.equal(workflowRef, `refs/tags/${tag}`, 'Dispatch the workflow from the same version tag, not main')
  assert.equal(workflowSha, head, 'Actions provenance source differs from the checked out tag')
}

export function validateChecks(checks, head) {
  for (const name of requiredChecks) {
    // A later failed rerun must not be hidden by an older successful attempt.
    const latest = checks.filter(check => check.name === name && check.app?.slug === 'github-actions'
      && check.head_sha === head).sort((a, b) => b.id - a.id)[0]
    assert.ok(latest?.status === 'completed' && latest.conclusion === 'success', `Required check is not successful: ${name}`)
  }
}

export function validateAsset(release, tag) {
  assert.equal(release.tag_name, tag)
  assert.equal(release.draft, false, 'Release must already be published')
  const archives = release.assets.filter(asset => asset.name.endsWith('.tgz'))
  assert.equal(archives.length, 1, 'Expected exactly one release archive')
  assert.equal(archives[0].name, 'dsh-toolgate.tgz')
}

// A published changelog is the only thing a user reads before deciding to
// update. Draft wording ("本地构建，未发布" / "unpublished") left in place turns
// the release notes into a reason *not* to update, so the pipeline refuses it.
export function validateChangelog(text, version) {
  const escaped = String(version).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const heading = new RegExp(`^##\\s+${escaped}(?:\\s|$)`, 'm')
  const match = heading.exec(text)
  assert.ok(match, `CHANGELOG.md has no ${version} section`)
  const rest = text.slice(match.index + match[0].length)
  const next = /^##\s+/m.exec(rest)
  const body = next ? rest.slice(0, next.index) : rest
  assert.doesNotMatch(body, /本地构建|未发布|unpublished|local build/i,
    `The ${version} changelog still reads like an unreleased draft`)
  assert.match(body, /\S{20,}/, `The ${version} changelog has no readable notes`)
}

function main() {
  const tag = process.argv[2] || ''
  assert.match(tag, /^v\d+\.\d+\.\d+(?:-[\w.-]+)?$/)
  const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim()
  const head = git('rev-parse', 'HEAD')
  let onMain = false
  try { git('merge-base', '--is-ancestor', head, 'origin/main'); onMain = true } catch { /* fail below */ }
  validateSource({ tag, version: JSON.parse(fs.readFileSync('package.json', 'utf8')).version,
    head, tagged: git('rev-parse', `${tag}^{commit}`), onMain,
    workflowRef: process.env.GITHUB_REF, workflowSha: process.env.GITHUB_SHA })
  const repo = process.env.GH_REPO
  assert.match(repo || '', /^[\w.-]+\/[\w.-]+$/)
  const api = endpoint => JSON.parse(execFileSync('gh', ['api', endpoint], { encoding: 'utf8' }))
  // Use the Validation workflow's own jobs, rather than a different workflow
  // choosing the same display names for check runs.
  const runs = api(`repos/${repo}/actions/workflows/validation.yml/runs?head_sha=${head}&event=push&per_page=100`).workflow_runs
  const validation = runs.filter(run => run.head_sha === head && run.head_branch === 'main').sort((a, b) => b.id - a.id)[0]
  assert.ok(validation?.status === 'completed' && validation.conclusion === 'success', 'The main Validation workflow has not passed')
  const jobs = api(`repos/${repo}/actions/runs/${validation.id}/jobs?filter=latest&per_page=100`).jobs
  validateChecks(jobs.map(job => ({ ...job, head_sha: head, app: { slug: 'github-actions' } })), head)
  validateAsset(api(`repos/${repo}/releases/tags/${encodeURIComponent(tag)}`), tag)
  validateChangelog(fs.readFileSync('CHANGELOG.md', 'utf8'), JSON.parse(fs.readFileSync('package.json', 'utf8')).version)
  console.log(`Release preflight passed for ${tag} at ${head}`)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main()
