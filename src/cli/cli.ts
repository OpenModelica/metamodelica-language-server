/*
 * This file is part of OpenModelica.
 *
 * Copyright (c) 1998-2026, Open Source Modelica Consortium (OSMC),
 * c/o Linköpings universitet, Department of Computer and Information Science,
 * SE-58183 Linköping, Sweden.
 *
 * All rights reserved.
 *
 * THIS PROGRAM IS PROVIDED UNDER THE TERMS OF AGPL VERSION 3 LICENSE OR
 * THIS OSMC PUBLIC LICENSE (OSMC-PL) VERSION 1.8.
 * ANY USE, REPRODUCTION OR DISTRIBUTION OF THIS PROGRAM CONSTITUTES
 * RECIPIENT'S ACCEPTANCE OF THE OSMC PUBLIC LICENSE OR THE GNU AGPL
 * VERSION 3, ACCORDING TO RECIPIENTS CHOICE.
 *
 * The OpenModelica software and the OSMC (Open Source Modelica Consortium)
 * Public License (OSMC-PL) are obtained from OSMC, either from the above
 * address, from the URLs:
 * http://www.openmodelica.org or
 * https://github.com/OpenModelica/ or
 * http://www.ida.liu.se/projects/OpenModelica,
 * and in the OpenModelica distribution.
 *
 * GNU AGPL version 3 is obtained from:
 * https://www.gnu.org/licenses/licenses.html#GPL
 *
 * This program is distributed WITHOUT ANY WARRANTY; without
 * even the implied warranty of MERCHANTABILITY or FITNESS
 * FOR A PARTICULAR PURPOSE, EXCEPT AS EXPRESSLY SET FORTH
 * IN THE BY RECIPIENT SELECTED SUBSIDIARY LICENSE CONDITIONS OF OSMC-PL.
 *
 * See the full OSMC Public License conditions for more details.
 *
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { Worker, isMainThread, parentPort } from 'worker_threads';
import { TextDocument } from 'vscode-languageserver-textdocument';
import * as LSP from 'vscode-languageserver/node';

import { initializeMetaModelicaParser } from '../server/metaModelicaParser';
import Analyzer from '../server/analyzer';
import {
  DeadSilencedAssignFix, RedundantParensFix, SilencedOutputFix, UnusedArgFix,
  UnusedCaseBindingFix, UnusedVarFix, WildcardMatchFix, WildcardTupleFix,
} from '../server/diagnostics';

export type CheckName =
  | 'unused-var' | 'unused-match-arg' | 'unused-case-binding'
  | 'unused-silenced-output' | 'wildcard-match' | 'dead-silenced-assign'
  | 'redundant-parens' | 'wildcard-tuple';

export const ALL_CHECKS: CheckName[] = [
  'unused-var', 'unused-match-arg', 'unused-case-binding',
  'unused-silenced-output', 'wildcard-match', 'dead-silenced-assign',
  'redundant-parens', 'wildcard-tuple',
];

type FixData = {
  unusedArgFix?: UnusedArgFix;
  unusedVarFix?: UnusedVarFix;
  unusedCaseBindingFix?: UnusedCaseBindingFix;
  silencedOutputFix?: SilencedOutputFix;
  wildcardMatchFix?: WildcardMatchFix;
  deadSilencedAssignFix?: DeadSilencedAssignFix;
  redundantParensFix?: RedundantParensFix;
  wildcardTupleFix?: WildcardTupleFix;
};

export interface ProcessResult {
  filesProcessed: number;
  issuesFound: number;
  issuesFixed: number;
}

interface FileResult {
  found: number;
  fixed: number;
  // Lines to emit on stdout (per-file diagnostics, "fixed N issues" summary).
  out: string[];
  // Lines to emit on stderr (self-overlap warnings).
  err: string[];
}

/**
 * Recursively collect all .mo files under a path.
 * If path is a file it is returned directly (if it ends with .mo).
 */
function findMoFiles(inputPath: string): string[] {
  let stat: fs.Stats;
  try {
    stat = fs.statSync(inputPath);
  } catch {
    throw new Error(`Path not found: ${inputPath}`);
  }

  if (stat.isFile()) {
    return inputPath.endsWith('.mo') ? [inputPath] : [];
  }

  if (stat.isDirectory()) {
    const results: string[] = [];
    for (const entry of fs.readdirSync(inputPath, { withFileTypes: true })) {
      results.push(...findMoFiles(path.join(inputPath, entry.name)));
    }
    return results;
  }

  return [];
}

/**
 * Apply a list of LSP TextEdits to a string, returning the modified string.
 */
function applyEdits(content: string, uri: string, edits: LSP.TextEdit[]): string {
  const doc = TextDocument.create(uri, 'metamodelica', 1, content);
  return TextDocument.applyEdits(doc, edits);
}

/**
 * Return the fix edits for a diagnostic if it matches one of the requested
 * checks, or undefined if it should be skipped.
 */
function getFixEdits(
  data: FixData | undefined,
  checks: Set<CheckName>,
): LSP.TextEdit[] | undefined {
  if (!data) { return undefined; }
  if (checks.has('unused-match-arg') && data.unusedArgFix) { return data.unusedArgFix.edits; }
  if (checks.has('unused-var') && data.unusedVarFix) { return data.unusedVarFix.edits; }
  if (checks.has('unused-case-binding') && data.unusedCaseBindingFix) { return data.unusedCaseBindingFix.edits; }
  if (checks.has('unused-silenced-output') && data.silencedOutputFix) { return data.silencedOutputFix.edits; }
  if (checks.has('wildcard-match') && data.wildcardMatchFix) { return data.wildcardMatchFix.edits; }
  if (checks.has('dead-silenced-assign') && data.deadSilencedAssignFix) { return data.deadSilencedAssignFix.edits; }
  if (checks.has('redundant-parens') && data.redundantParensFix) { return data.redundantParensFix.edits; }
  if (checks.has('wildcard-tuple') && data.wildcardTupleFix) { return data.wildcardTupleFix.edits; }
  return undefined;
}

/**
 * Process one file: detect issues and optionally apply quick-fixes in-place.
 * Returns counts and the log lines that would have been emitted, without
 * actually printing anything — callers collect and print so output stays
 * grouped per-file even when files are processed in parallel.
 */
async function processOneFile(
  filePath: string,
  fix: boolean,
  checks: Set<CheckName>,
): Promise<FileResult> {
  const result: FileResult = { found: 0, fixed: 0, out: [], err: [] };

  // Re-create the parser per file. Tree-sitter's wasm heap can grow but
  // never shrinks; on very large files (with hundreds of fixes) it would
  // eventually abort with 'Aborted()'. A fresh parser per file resets the
  // heap and keeps memory bounded regardless of total batch size.
  const parser = await initializeMetaModelicaParser();
  try {
    const analyzer = new Analyzer(parser);
    const absPath = path.resolve(filePath);
    const uri = `file://${absPath}`;
    let content = fs.readFileSync(absPath, 'utf-8');

    if (fix) {
      // Collect all non-overlapping fixes from each pass and apply them in
      // one go. One pass per round of fixes (not one parse per fix), which
      // keeps the wasm parser from drowning in leaked trees on large files.
      let fixed = 0;
      let hasMore = true;
      while (hasMore) {
        hasMore = false;
        const doc = TextDocument.create(uri, 'metamodelica', 1, content);
        const diagnostics = analyzer.analyze(doc);

        // Greedily accept every fix whose edits don't overlap an already-
        // accepted edit (sorted by start offset). Cascading fixes (e.g. a
        // parens removal that uncovers another) are picked up on the next
        // pass.
        const accepted: LSP.TextEdit[] = [];
        const occupied: { start: number; end: number }[] = [];
        const offset = (pos: LSP.Position): number => doc.offsetAt(pos);
        const overlapsAny = (s: { start: number; end: number }, xs: { start: number; end: number }[]): boolean =>
          xs.some(o => s.start < o.end && o.start < s.end);
        for (const diagnostic of diagnostics) {
          const data = diagnostic.data as FixData | undefined;
          const edits = getFixEdits(data, checks);
          if (!edits || edits.length === 0) { continue; }
          const spans = edits.map(e => ({ start: offset(e.range.start), end: offset(e.range.end) }));
          // Reject the whole fix if any of its edits overlap an already-
          // accepted edit OR another edit from this same fix. The latter
          // means the detector emitted a self-overlapping edit list —
          // skip rather than crashing applyEdits.
          if (spans.some(s => overlapsAny(s, occupied))) { continue; }
          let selfOverlap = false;
          for (let i = 0; i < spans.length && !selfOverlap; i++) {
            for (let j = i + 1; j < spans.length; j++) {
              const a = spans[i], b = spans[j];
              if (a.start < b.end && b.start < a.end) { selfOverlap = true; break; }
            }
          }
          if (selfOverlap) {
            result.err.push(`${filePath}: skipping self-overlapping fix from "${diagnostic.message}"`);
            continue;
          }
          accepted.push(...edits);
          occupied.push(...spans);
          fixed++;
        }

        if (accepted.length > 0) {
          try {
            content = applyEdits(content, uri, accepted);
          } catch (err) {
            // Most commonly "Overlapping edit" from TextDocument.applyEdits.
            // Re-throw with the file path and the accepted edit ranges so a
            // multi-file batch run is actually diagnosable.
            const msg = err instanceof Error ? err.message : String(err);
            const ranges = accepted.map(e =>
              `[${e.range.start.line + 1}:${e.range.start.character + 1}` +
              `-${e.range.end.line + 1}:${e.range.end.character + 1}]`,
            ).join(', ');
            throw new Error(`${filePath}: applyEdits failed (${msg}). Accepted edits: ${ranges}`);
          }
          hasMore = true;
        }
      }
      if (fixed > 0) {
        fs.writeFileSync(absPath, content);
        result.out.push(`${filePath}: fixed ${fixed} issue(s)`);
      }
      result.fixed = fixed;
    } else {
      const doc = TextDocument.create(uri, 'metamodelica', 1, content);
      const diagnostics = analyzer.analyze(doc);
      let count = 0;
      for (const diagnostic of diagnostics) {
        const data = diagnostic.data as FixData | undefined;
        if (getFixEdits(data, checks)) {
          const { line, character } = diagnostic.range.start;
          result.out.push(`${filePath}:${line + 1}:${character + 1}: ${diagnostic.message}`);
          count++;
        }
      }
      result.found = count;
    }
  } finally {
    parser.delete();
  }

  return result;
}

function flushFileResult(r: FileResult): void {
  for (const line of r.out) { console.log(line); }
  for (const line of r.err) { console.error(line); }
}

/**
 * Run `processOneFile` across `files` using up to `jobs` worker threads.
 * Falls back to in-process sequential execution when `jobs <= 1`.
 */
async function runParallel(
  files: string[],
  fix: boolean,
  checks: Set<CheckName>,
  jobs: number,
): Promise<ProcessResult> {
  let totalFound = 0;
  let totalFixed = 0;

  if (jobs <= 1 || files.length <= 1) {
    for (const filePath of files) {
      const r = await processOneFile(filePath, fix, checks);
      flushFileResult(r);
      totalFound += r.found;
      totalFixed += r.fixed;
    }
    return { filesProcessed: files.length, issuesFound: totalFound, issuesFixed: totalFixed };
  }

  const checksArr = Array.from(checks);
  const workerCount = Math.min(jobs, files.length);
  let cursor = 0;
  let firstError: Error | null = null;

  await new Promise<void>((resolve) => {
    let active = 0;

    const dispatch = (worker: Worker): void => {
      if (firstError || cursor >= files.length) {
        worker.postMessage({ type: 'exit' });
        return;
      }
      const filePath = files[cursor++];
      worker.postMessage({ type: 'file', filePath, fix, checks: checksArr });
    };

    const onExitOrError = (worker: Worker): void => {
      active--;
      // Stop workers when the queue is drained AND no more in flight.
      if (active === 0) { resolve(); }
    };

    for (let i = 0; i < workerCount; i++) {
      const worker = new Worker(__filename);
      active++;
      worker.on('message', (msg: { result?: FileResult; error?: string }) => {
        if (msg.error) {
          if (!firstError) { firstError = new Error(msg.error); }
        } else if (msg.result) {
          flushFileResult(msg.result);
          totalFound += msg.result.found;
          totalFixed += msg.result.fixed;
        }
        dispatch(worker);
      });
      worker.on('error', (err: unknown) => {
        if (!firstError) {
          firstError = err instanceof Error ? err : new Error(String(err));
        }
        worker.postMessage({ type: 'exit' });
      });
      worker.on('exit', () => onExitOrError(worker));
      dispatch(worker);
    }
  });

  if (firstError) { throw firstError; }
  return { filesProcessed: files.length, issuesFound: totalFound, issuesFixed: totalFixed };
}

/**
 * Process a set of file/directory paths: detect issues and optionally apply
 * the quick-fixes in-place.
 *
 * @param paths   File or directory paths to process.
 * @param fix     When true, apply quick-fixes and save files. When false, only report.
 * @param checks  Which checks to run/fix. Defaults to all checks.
 * @param jobs    Worker-thread parallelism. Defaults to 1 (in-process).
 * @returns       Summary of what was found and fixed.
 */
export async function processFiles(
  paths: string[],
  fix: boolean,
  checks: Set<CheckName> = new Set(ALL_CHECKS),
  jobs = 1,
): Promise<ProcessResult> {
  const moFiles: string[] = [];
  for (const p of paths) {
    moFiles.push(...findMoFiles(p));
  }
  return runParallel(moFiles, fix, checks, jobs);
}

type WorkerInMessage =
  | { type: 'file'; filePath: string; fix: boolean; checks: CheckName[] }
  | { type: 'exit' };

function runWorker(port: NonNullable<typeof parentPort>): void {
  port.on('message', async (msg: WorkerInMessage) => {
    if (msg.type === 'exit') {
      port.close();
      return;
    }
    try {
      const result = await processOneFile(msg.filePath, msg.fix, new Set(msg.checks));
      port.postMessage({ result });
    } catch (err) {
      port.postMessage({ error: err instanceof Error ? err.message : String(err) });
    }
  });
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    console.log(
      'Usage: mmlsc [--fix] [--check <name>]... [--jobs N] <paths...>\n\n' +
      '  --fix            Apply quick-fixes to files in-place (default: report only)\n' +
      '  --check <name>   Limit to a specific check (repeatable; default: all checks)\n' +
      '  --jobs N         Process files in parallel using N worker threads\n' +
      '                   (default: number of CPU cores; pass 1 to disable)\n' +
      '  --help           Show this help\n\n' +
      '  Available check names:\n' +
      '    unused-var              Unused protected/local variables\n' +
      '    unused-match-arg        Unused match/matchcontinue arguments\n' +
      '    unused-case-binding     Unused case-pattern bindings (replace identifier with `_`)\n' +
      '    unused-silenced-output  Unnecessary output silencing (\'_ := expr\')\n' +
      '    wildcard-match          Wildcard before match/matchcontinue (\'_ :=\' → \'() :=\')\n' +
      '    dead-silenced-assign    Drop entire `_ := variable;` (RHS has no side-effect)\n' +
      '    redundant-parens        Redundant single-element parens (match/case/assignment LHS)\n' +
      '    wildcard-tuple          All-wildcard case pattern `(_, _, _)` reducible to `_`\n\n' +
      '  paths    Files or directories to process (.mo files, directories are scanned recursively)'
    );
    process.exit(0);
  }

  const fix = args.includes('--fix');

  // Collect --check <name> and --jobs N pairs
  const requestedChecks: CheckName[] = [];
  let jobs: number | undefined;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--check') {
      const name = args[i + 1];
      if (!name || name.startsWith('--')) {
        console.error('Error: --check requires a check name argument');
        process.exit(2);
      }
      if (!(ALL_CHECKS as string[]).includes(name)) {
        console.error(`Error: unknown check '${name}'. Available: ${ALL_CHECKS.join(', ')}`);
        process.exit(2);
      }
      requestedChecks.push(name as CheckName);
      i++; // skip the name argument
    } else if (args[i] === '--jobs') {
      const value = args[i + 1];
      const n = value ? Number.parseInt(value, 10) : NaN;
      if (!Number.isFinite(n) || n < 1) {
        console.error('Error: --jobs requires a positive integer');
        process.exit(2);
      }
      jobs = n;
      i++;
    }
  }

  const checks = requestedChecks.length > 0
    ? new Set(requestedChecks)
    : new Set(ALL_CHECKS);

  const paths = args.filter((a, i) => {
    if (a.startsWith('--')) { return false; }
    const prev = args[i - 1];
    return prev !== '--check' && prev !== '--jobs';
  });

  const jobsCount = jobs ?? os.cpus().length;

  try {
    const result = await processFiles(paths, fix, checks, jobsCount);

    if (fix) {
      console.log(`Processed ${result.filesProcessed} file(s), fixed ${result.issuesFixed} issue(s).`);
      process.exit(0);
    } else {
      console.log(`Processed ${result.filesProcessed} file(s), found ${result.issuesFound} issue(s).`);
      process.exit(result.issuesFound > 0 ? 1 : 0);
    }
  } catch (err) {
    console.error('Error:', err instanceof Error ? err.message : err);
    process.exit(2);
  }
}

if (isMainThread) {
  // Only run main() when executed directly (not when imported by tests).
  if (require.main === module) {
    main();
  }
} else if (parentPort) {
  runWorker(parentPort);
}
