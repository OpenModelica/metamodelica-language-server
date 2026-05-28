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

import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';

// Tests run from dist/test/server/ — project root is three levels up.
const projectRoot = path.resolve(__dirname, '../../..');

suite('Bundle packaging', () => {
  test('out/server.js does not externally require web-tree-sitter', () => {
    const bundlePath = path.join(projectRoot, 'out', 'server.js');
    assert.ok(fs.existsSync(bundlePath), `Bundle not found: ${bundlePath}`);
    const bundle = fs.readFileSync(bundlePath, 'utf8');
    // If web-tree-sitter is marked external in esbuild, the bundle contains a
    // bare require("web-tree-sitter") that fails at runtime in an installed
    // extension because node_modules is not shipped.
    assert.ok(
      !bundle.includes('require("web-tree-sitter")'),
      'out/server.js contains require("web-tree-sitter") — web-tree-sitter must be bundled, not external'
    );
  });

  test('out/cli.js does not externally require web-tree-sitter', () => {
    const bundlePath = path.join(projectRoot, 'out', 'cli.js');
    assert.ok(fs.existsSync(bundlePath), `Bundle not found: ${bundlePath}`);
    const bundle = fs.readFileSync(bundlePath, 'utf8');
    assert.ok(
      !bundle.includes('require("web-tree-sitter")'),
      'out/cli.js contains require("web-tree-sitter") — web-tree-sitter must be bundled, not external'
    );
  });
});
