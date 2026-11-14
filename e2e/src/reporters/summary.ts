import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { FullConfig, FullResult, Reporter, Suite, TestCase, TestResult } from '@playwright/test/reporter';
import { METRICS_ATTACHMENT, type RequestMetric } from '../api-client';
import { resolveTarget } from '../targets';

type Outcome = ReturnType<TestCase['outcome']>;

interface Totals {
  passed: number;
  failed: number;
  flaky: number;
  skipped: number;
  durationMs: number;
}

interface EndpointStats {
  source: string;
  method: string;
  endpoint: string;
  calls: number;
  errors: number;
  p50: number;
  p95: number;
  max: number;
}

/**
 * Writes the run's metrics as markdown to the GitHub job summary ($GITHUB_STEP_SUMMARY)
 * and to results/summary.md, plus machine-readable results/metrics.json:
 * pass/fail/flaky/skip per suite, slowest tests, failures and request latency per endpoint.
 */
export default class SummaryReporter implements Reporter {
  private readonly outDir: string;
  private readonly tests = new Map<string, TestCase>();
  private readonly durations = new Map<string, number>();
  private readonly requests: RequestMetric[] = [];
  private startedAt = new Date();

  constructor(options: { outputDir?: string } = {}) {
    this.outDir = options.outputDir ?? 'results';
  }

  printsToStdio() {
    return false;
  }

  onBegin(_config: FullConfig, _suite: Suite) {
    this.startedAt = new Date();
  }

  onTestEnd(test: TestCase, result: TestResult) {
    this.tests.set(test.id, test);
    this.durations.set(test.id, (this.durations.get(test.id) ?? 0) + result.duration);
    for (const a of result.attachments) {
      if (a.name !== METRICS_ATTACHMENT || !a.body) continue;
      try {
        this.requests.push(...(JSON.parse(a.body.toString('utf8')) as RequestMetric[]));
      } catch {
        // ignore malformed metrics
      }
    }
  }

  onEnd(result: FullResult) {
    const target = resolveTarget();
    const tests = [...this.tests.values()].map((t) => ({
      title: t.titlePath().slice(3).join(' › '),
      project: t.parent.project()?.name ?? 'default',
      file: t.location.file.replace(/\\/g, '/').replace(/^.*\/tests\//, ''),
      outcome: t.outcome(),
      retries: Math.max(0, t.results.length - 1),
      durationMs: Math.round(this.durations.get(t.id) ?? 0),
      error: firstErrorLine(t),
    }));

    const projects: Record<string, Totals> = {};
    for (const t of tests) {
      const p = (projects[t.project] ??= { passed: 0, failed: 0, flaky: 0, skipped: 0, durationMs: 0 });
      p[bucket(t.outcome)]++;
      p.durationMs += t.durationMs;
    }
    const endpoints = aggregate(this.requests);

    const metrics = {
      target: target.name,
      webURL: target.webURL,
      apiURL: target.apiURL,
      apiVersion: process.env.E2E_API_VERSION ?? null,
      runId: process.env.E2E_RUN_ID ?? null,
      commit: process.env.GITHUB_SHA ?? null,
      startedAt: this.startedAt.toISOString(),
      wallTimeMs: Math.round(result.duration),
      status: result.status,
      projects,
      endpoints,
      tests: tests.map(({ error, ...t }) => (error ? { ...t, error } : t)),
    };

    const md = renderMarkdown(metrics, tests, endpoints);
    mkdirSync(this.outDir, { recursive: true });
    writeFileSync(join(this.outDir, 'metrics.json'), JSON.stringify(metrics, null, 2));
    writeFileSync(join(this.outDir, 'summary.md'), md);
    const summaryFile = process.env.GITHUB_STEP_SUMMARY;
    if (summaryFile) {
      mkdirSync(dirname(summaryFile), { recursive: true });
      appendFileSync(summaryFile, md + '\n');
    }
  }
}

function bucket(outcome: Outcome): keyof Omit<Totals, 'durationMs'> {
  return outcome === 'expected' ? 'passed' : outcome === 'unexpected' ? 'failed' : outcome === 'flaky' ? 'flaky' : 'skipped';
}

function firstErrorLine(t: TestCase): string | undefined {
  if (t.outcome() !== 'unexpected') return undefined;
  const last = t.results[t.results.length - 1];
  const msg = last?.error?.message ?? last?.errors[0]?.message;
  // Strip ANSI colour codes.
  return msg?.replace(/\u001b\[[0-9;]*m/g, '').split('\n').find((l) => l.trim())?.trim().slice(0, 200);
}

function percentile(sorted: number[], p: number): number {
  if (!sorted.length) return 0;
  return sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)];
}

function aggregate(requests: RequestMetric[]): EndpointStats[] {
  const groups = new Map<string, RequestMetric[]>();
  for (const r of requests) {
    const key = `${r.source} ${r.method} ${r.endpoint}`;
    groups.set(key, [...(groups.get(key) ?? []), r]);
  }
  return [...groups.values()]
    .map((rs) => {
      const ms = rs.map((r) => r.ms).sort((a, b) => a - b);
      return {
        source: rs[0].source,
        method: rs[0].method,
        endpoint: rs[0].endpoint,
        calls: rs.length,
        errors: rs.filter((r) => r.status >= 500 || r.status === 0).length,
        p50: Math.round(percentile(ms, 50)),
        p95: Math.round(percentile(ms, 95)),
        max: Math.round(ms[ms.length - 1]),
      };
    })
    .sort((a, b) => b.p95 - a.p95);
}

const cell = (s: string) => s.replace(/\|/g, '\\|').replace(/\n/g, ' ');
const secs = (ms: number) => (ms >= 60_000 ? `${Math.floor(ms / 60_000)}m ${Math.round((ms % 60_000) / 1000)}s` : `${(ms / 1000).toFixed(1)}s`);

function renderMarkdown(
  m: {
    target: string;
    webURL: string;
    apiURL: string;
    apiVersion: string | null;
    runId: string | null;
    wallTimeMs: number;
    status: string;
    projects: Record<string, Totals>;
  },
  tests: { title: string; project: string; file: string; outcome: Outcome; durationMs: number; retries: number; error?: string }[],
  endpoints: EndpointStats[],
): string {
  const icon = m.status === 'passed' ? '✅' : m.status === 'interrupted' || m.status === 'timedout' ? '⏱️' : '❌';
  const out: string[] = [];
  out.push(`## ${icon} Playwright E2E: \`${m.target}\``, '');
  out.push('| Target | Web | API | API version | Run | Wall time |', '|---|---|---|---|---|---|');
  out.push(
    `| ${m.target} | ${m.webURL} | ${m.apiURL} | \`${(m.apiVersion ?? 'unknown').slice(0, 12)}\` | ${m.runId ?? '-'} | ${secs(m.wallTimeMs)} |`,
    '',
  );

  out.push('### Results', '', '| Suite | ✅ Passed | ❌ Failed | ⚠️ Flaky | ⏭️ Skipped | Total | Test time |', '|---|--:|--:|--:|--:|--:|--:|');
  const all: Totals = { passed: 0, failed: 0, flaky: 0, skipped: 0, durationMs: 0 };
  for (const [name, p] of Object.entries(m.projects).sort()) {
    out.push(`| ${name} | ${p.passed} | ${p.failed} | ${p.flaky} | ${p.skipped} | ${p.passed + p.failed + p.flaky + p.skipped} | ${secs(p.durationMs)} |`);
    for (const k of Object.keys(all) as (keyof Totals)[]) all[k] += p[k];
  }
  if (Object.keys(m.projects).length > 1) {
    out.push(`| **all** | **${all.passed}** | **${all.failed}** | **${all.flaky}** | **${all.skipped}** | **${all.passed + all.failed + all.flaky + all.skipped}** | **${secs(all.durationMs)}** |`);
  }
  out.push('');

  const failed = tests.filter((t) => t.outcome === 'unexpected');
  if (failed.length) {
    out.push('### ❌ Failures', '');
    for (const t of failed) out.push(`- **[${t.project}]** \`${t.file}\` › ${cell(t.title)}${t.error ? `<br>\`${cell(t.error)}\`` : ''}`);
    out.push('');
  }
  const flaky = tests.filter((t) => t.outcome === 'flaky');
  if (flaky.length) {
    out.push('### ⚠️ Flaky (passed on retry)', '');
    for (const t of flaky) out.push(`- **[${t.project}]** \`${t.file}\` › ${cell(t.title)} (${t.retries} retr${t.retries === 1 ? 'y' : 'ies'})`);
    out.push('');
  }

  const slowest = [...tests].filter((t) => t.outcome !== 'skipped').sort((a, b) => b.durationMs - a.durationMs).slice(0, 10);
  if (slowest.length) {
    out.push('<details><summary><b>Slowest tests</b></summary>', '', '| Test | Suite | Duration |', '|---|---|--:|');
    for (const t of slowest) out.push(`| \`${t.file}\` › ${cell(t.title)} | ${t.project} | ${secs(t.durationMs)} |`);
    out.push('', '</details>', '');
  }

  if (endpoints.length) {
    const calls = endpoints.reduce((s, e) => s + e.calls, 0);
    out.push(
      `<details><summary><b>Request latency</b> (${calls} requests, ${endpoints.length} endpoints; slowest p95 first)</summary>`,
      '',
      '`api` = called by the API suite directly; `ui` = made by the web app in the browser (through the web origin).',
      '',
      '| Source | Endpoint | Calls | p50 | p95 | Max | 5xx |',
      '|---|---|--:|--:|--:|--:|--:|',
    );
    for (const e of endpoints.slice(0, 30)) {
      out.push(`| ${e.source} | \`${e.method} ${cell(e.endpoint)}\` | ${e.calls} | ${e.p50} ms | ${e.p95} ms | ${e.max} ms | ${e.errors} |`);
    }
    out.push('', '</details>', '');
  }
  return out.join('\n');
}
