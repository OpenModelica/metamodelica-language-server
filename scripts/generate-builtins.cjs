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

/*
 * Generate the builtin-identifier whitelist used by the name-resolution
 * diagnostic (src/server/nameResolution.ts).
 *
 * The MetaModelica/Modelica predefined types, functions, operators and
 * constants are declared in the `*ModelicaBuiltin.mo` files shipped with
 * OpenModelica. Inside an encapsulated package these names are visible
 * without an import, so the resolver must treat them as always-resolved.
 *
 * This script parses those files with the vendored tree-sitter grammar and
 * emits `src/server/builtins.generated.ts`. Re-run it whenever the builtin
 * files change.
 *
 * Usage:
 *   node scripts/generate-builtins.cjs [--source <dir-or-file>]...
 *
 *   --source <path>   A path to an OpenModelica checkout (a directory, in
 *                     which case the default builtin files under
 *                     OMCompiler/Compiler/FrontEnd are used) or a single
 *                     `.mo` file. May be repeated. Defaults to
 *                     $OPENMODELICA_SRC or /projects/OpenModelica.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { Parser, Language } = require('web-tree-sitter');

const WASM = path.join(__dirname, '..', 'src', 'server', 'tree-sitter-metamodelica.wasm');
const OUT = path.join(__dirname, '..', 'src', 'server', 'builtins.generated.ts');

// Builtin files, relative to an OpenModelica source root. MetaModelicaBuiltin
// covers the MetaModelica predefined functions/types; ModelicaBuiltin covers
// the standard Modelica functions/operators that are also available.
const DEFAULT_BUILTIN_FILES = [
  'OMCompiler/Compiler/FrontEnd/MetaModelicaBuiltin.mo',
  'OMCompiler/Compiler/FrontEnd/ModelicaBuiltin.mo',
];

// Lexical builtins that are not declared as classes in the *Builtin.mo files:
// predefined type names and literals, the polymorphic-type keywords, the
// runtime-only functions (defined in C, not in the .mo files) and the
// statement keywords that the grammar parses as plain identifiers.
const LEXICAL_BUILTINS = [
  // Predefined types and literals.
  'Integer', 'Real', 'Boolean', 'String',
  'list', 'Option', 'tuple', 'array',
  'polymorphic', 'Any', 'time', 'true', 'false',
  // Runtime functions defined in C (not declared in the .mo files).
  'getGlobalRoot', 'setGlobalRoot',
  // Statement keywords parsed by the grammar as identifiers.
  'continue', 'break', 'return', 'fail',
];

/** Resolve the list of `.mo` files to parse from the `--source` arguments. */
function resolveSourceFiles(sources) {
  const files = [];
  for (const src of sources) {
    const stat = fs.existsSync(src) ? fs.statSync(src) : null;
    if (stat && stat.isFile()) {
      files.push(src);
    } else if (stat && stat.isDirectory()) {
      for (const rel of DEFAULT_BUILTIN_FILES) {
        const p = path.join(src, rel);
        if (fs.existsSync(p)) {
          files.push(p);
        } else {
          console.warn(`warning: builtin file not found: ${p}`);
        }
      }
    } else {
      console.warn(`warning: source path does not exist: ${src}`);
    }
  }
  return files;
}

/** Collect the IDENT text of the first `identifier`/`IDENT` descendant. */
function firstIdent(node) {
  if (node.type === 'IDENT') {
    return node.text;
  }
  for (let i = 0; i < node.namedChildCount; i++) {
    const r = firstIdent(node.namedChild(i));
    if (r) {
      return r;
    }
  }
  return null;
}

/**
 * Walk a parsed tree collecting builtin names:
 *  - every `class_definition` identifier at any depth (functions, types,
 *    uniontypes, records incl. nested NONE/SOME, packages, operators), and
 *  - every `constant`-prefixed `component_declaration` name.
 */
function collectFromTree(root, names) {
  const stack = [root];
  while (stack.length) {
    const node = stack.pop();

    if (node.type === 'class_definition') {
      const spec = node.childForFieldName('classSpecifier');
      const idNode = spec ? spec.childForFieldName('identifier') : null;
      const name = idNode ? firstIdent(idNode) : null;
      if (name) {
        names.add(name);
      }
    } else if (node.type === 'component_clause') {
      const prefix = node.childForFieldName('typePrefix');
      if (prefix && /\bconstant\b/.test(prefix.text)) {
        for (let i = 0; i < node.namedChildCount; i++) {
          const child = node.namedChild(i);
          if (child.type === 'component_declaration') {
            const name = firstIdent(child);
            if (name) {
              names.add(name);
            }
          }
        }
      }
    }

    for (let i = 0; i < node.namedChildCount; i++) {
      stack.push(node.namedChild(i));
    }
  }
}

async function main() {
  const args = process.argv.slice(2);
  const sources = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--source') {
      sources.push(args[++i]);
    } else {
      console.error(`Unknown argument: ${args[i]}`);
      process.exit(2);
    }
  }
  if (sources.length === 0) {
    sources.push(process.env.OPENMODELICA_SRC || '/projects/OpenModelica');
  }

  const files = resolveSourceFiles(sources);
  if (files.length === 0) {
    console.error('Error: no builtin source files found. Pass --source <openmodelica-checkout>.');
    process.exit(1);
  }

  await Parser.init();
  const language = await Language.load(WASM);
  const parser = new Parser();
  parser.setLanguage(language);

  const names = new Set(LEXICAL_BUILTINS);
  for (const file of files) {
    const tree = parser.parse(fs.readFileSync(file, 'utf8'));
    collectFromTree(tree.rootNode, names);
    tree.delete();
    console.log(`parsed ${file}`);
  }

  const sorted = [...names].sort((a, b) => a.localeCompare(b));
  // Reuse the OSMC license header from an existing source file.
  const sibling = fs.readFileSync(
    path.join(__dirname, '..', 'src', 'server', 'tree-sitter.ts'), 'utf8');
  const header = sibling.slice(0, sibling.indexOf('*/') + 2);

  const body =
    header + '\n\n' +
    '// AUTO-GENERATED by scripts/generate-builtins.cjs — do not edit.\n' +
    `// Source files: ${files.map(f => path.basename(f)).join(', ')}\n` +
    `// ${sorted.length} names.\n\n` +
    '/**\n' +
    ' * Predefined MetaModelica/Modelica names that are visible without an import\n' +
    ' * inside an encapsulated package. Used by the name-resolution diagnostic.\n' +
    ' */\n' +
    'export const BUILTIN_NAMES: ReadonlySet<string> = new Set([\n' +
    sorted.map(n => `  ${JSON.stringify(n)},`).join('\n') +
    '\n]);\n';

  fs.writeFileSync(OUT, body);
  console.log(`wrote ${OUT} (${sorted.length} names)`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
