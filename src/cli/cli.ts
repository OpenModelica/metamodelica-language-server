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
import * as path from 'path';
import { TextDocument } from 'vscode-languageserver-textdocument';
import * as LSP from 'vscode-languageserver/node';

import { initializeMetaModelicaParser } from '../server/metaModelicaParser';
import Analyzer from '../server/analyzer';
import { UnusedArgFix, UnusedVarFix, SilencedOutputFix } from '../server/diagnostics';

export type CheckName = 'unused-var' | 'unused-match-arg' | 'unused-silenced-output';

export const ALL_CHECKS: CheckName[] = ['unused-var', 'unused-match-arg', 'unused-silenced-output'];

export interface ProcessResult {
  filesProcessed: number;
  issuesFound: number;
  issuesFixed: number;
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
  data: { unusedArgFix?: UnusedArgFix; unusedVarFix?: UnusedVarFix; silencedOutputFix?: SilencedOutputFix } | undefined,
  checks: Set<CheckName>,
): LSP.TextEdit[] | undefined {
  if (!data) { return undefined; }
  if (checks.has('unused-match-arg') && data.unusedArgFix) { return data.unusedArgFix.edits; }
  if (checks.has('unused-var') && data.unusedVarFix) { return data.unusedVarFix.edits; }
  if (checks.has('unused-silenced-output') && data.silencedOutputFix) { return data.silencedOutputFix.edits; }
  return undefined;
}

/**
 * Process a set of file/directory paths: detect issues and optionally apply
 * the quick-fixes in-place.
 *
 * @param paths   File or directory paths to process.
 * @param fix     When true, apply quick-fixes and save files. When false, only report.
 * @param checks  Which checks to run/fix. Defaults to all checks.
 * @returns       Summary of what was found and fixed.
 */
export async function processFiles(
  paths: string[],
  fix: boolean,
  checks: Set<CheckName> = new Set(ALL_CHECKS),
): Promise<ProcessResult> {
  const parser = await initializeMetaModelicaParser();
  const analyzer = new Analyzer(parser);

  const moFiles: string[] = [];
  for (const p of paths) {
    moFiles.push(...findMoFiles(p));
  }

  let totalIssuesFound = 0;
  let totalIssuesFixed = 0;

  for (const filePath of moFiles) {
    const absPath = path.resolve(filePath);
    const uri = `file://${absPath}`;
    let content = fs.readFileSync(absPath, 'utf-8');

    if (fix) {
      // Apply fixes one at a time, re-parsing after each (positions shift after edits).
      let fixed = 0;
      let hasMore = true;
      while (hasMore) {
        hasMore = false;
        const doc = TextDocument.create(uri, 'metamodelica', 1, content);
        const diagnostics = analyzer.analyze(doc);
        for (const diagnostic of diagnostics) {
          const data = diagnostic.data as { unusedArgFix?: UnusedArgFix; unusedVarFix?: UnusedVarFix; silencedOutputFix?: SilencedOutputFix } | undefined;
          const edits = getFixEdits(data, checks);
          if (edits) {
            content = applyEdits(content, uri, edits);
            fixed++;
            hasMore = true;
            break; // restart scan; positions are now stale
          }
        }
      }
      if (fixed > 0) {
        fs.writeFileSync(absPath, content);
        console.log(`${filePath}: fixed ${fixed} issue(s)`);
      }
      totalIssuesFixed += fixed;
    } else {
      const doc = TextDocument.create(uri, 'metamodelica', 1, content);
      const diagnostics = analyzer.analyze(doc);
      let count = 0;
      for (const diagnostic of diagnostics) {
        const data = diagnostic.data as { unusedArgFix?: UnusedArgFix; unusedVarFix?: UnusedVarFix; silencedOutputFix?: SilencedOutputFix } | undefined;
        if (getFixEdits(data, checks)) {
          const { line, character } = diagnostic.range.start;
          console.log(`${filePath}:${line + 1}:${character + 1}: ${diagnostic.message}`);
          count++;
        }
      }
      totalIssuesFound += count;
    }
  }

  return {
    filesProcessed: moFiles.length,
    issuesFound: totalIssuesFound,
    issuesFixed: totalIssuesFixed,
  };
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    console.log(
      'Usage: mmlsc [--fix] [--check <name>]... <paths...>\n\n' +
      '  --fix            Apply quick-fixes to files in-place (default: report only)\n' +
      '  --check <name>   Limit to a specific check (repeatable; default: all checks)\n' +
      '  --help           Show this help\n\n' +
      '  Available check names:\n' +
      '    unused-var              Unused protected/local variables\n' +
      '    unused-match-arg        Unused match/matchcontinue arguments\n' +
      '    unused-silenced-output  Unnecessary output silencing (\'_ := expr\')\n\n' +
      '  paths    Files or directories to process (.mo files, directories are scanned recursively)'
    );
    process.exit(0);
  }

  const fix = args.includes('--fix');

  // Collect --check <name> pairs
  const requestedChecks: CheckName[] = [];
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
    }
  }

  const checks = requestedChecks.length > 0
    ? new Set(requestedChecks)
    : new Set(ALL_CHECKS);

  const paths = args.filter((a, i) =>
    !a.startsWith('--') && (i === 0 || args[i - 1] !== '--check')
  );

  try {
    const result = await processFiles(paths, fix, checks);

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

// Only run main() when executed directly (not when imported by tests).
if (require.main === module) {
  main();
}
