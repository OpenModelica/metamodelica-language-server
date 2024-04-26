/*
 * This file is part of OpenModelica.
 *
 * Copyright (c) 1998-2024, Open Source Modelica Consortium (OSMC),
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

import assert from 'assert';
import { GDBMIParser } from '../parser/gdbParser';

const testGdbOutput = [
`1^done
(gdb)
`,
`&"No source file named \\\\\\"Catch.omc\\\\\\".\n"
8^done,bkpt={number="1",type="breakpoint",disp="keep",enabled="n",addr="<PENDING>",pending="\\\\\\"Catch.omc\\\\\\":1",times="0",original-location="\\\\\\"Catch.omc\\\\\\":1"}
(gdb)
`,
`=thread-group-started,id="i1",pid="32033"
=thread-created,id="1",group-id="i1"
=library-loaded,id="/lib64/ld-linux-x86-64.so.2",target-name="/lib64/ld-linux-x86-64.so.2",host-name="/lib64/ld-linux-x86-64.so.2",symbols-loaded="0",thread-group="i1",ranges=[{from="0x00007ffff7fc5090",to="0x00007ffff7fee315"}]
10^running
*running,thread-id="all"
(gdb)
`,
`=library-loaded,id="/path/to/OpenModelica/build_cmake/install_cmake/bin/../lib/x86_64-linux-gnu/omc/libOpenModelicaCompiler.so",target-name="/path/to/OpenModelica/build_cmake/install_cmake/bin/../lib/x86_64-linux-gnu/omc/libOpenModelicaCompiler.so",host-name="/path/to/OpenModelica/build_cmake/install_cmake/bin/../lib/x86_64-linux-gnu/omc/libOpenModelicaCompiler.so",symbols-loaded="0",thread-group="i1",ranges=[{from="0x00007ffff4bd8410",to="0x00007ffff674cc56"}]
=library-loaded,id="/lib/x86_64-linux-gnu/libc.so.6",target-name="/lib/x86_64-linux-gnu/libc.so.6",host-name="/lib/x86_64-linux-gnu/libc.so.6",symbols-loaded="0",thread-group="i1",ranges=[{from="0x00007ffff345d700",to="0x00007ffff35ef93d"}]
=library-loaded,id="/path/to/OpenModelica/build_cmake/install_cmake/bin/../lib/x86_64-linux-gnu/omc/libOpenModelicaRuntimeC.so",target-name="/path/to/OpenModelica/build_cmake/install_cmake/bin/../lib/x86_64-linux-gnu/omc/libOpenModelicaRuntimeC.so",host-name="/path/to/OpenModelica/build_cmake/install_cmake/bin/../lib/x86_64-linux-gnu/omc/libOpenModelicaRuntimeC.so",symbols-loaded="0",thread-group="i1",ranges=[{from="0x00007ffff33c51a0",to="0x00007ffff3404224"}]
=library-loaded,id="/lib/x86_64-linux-gnu/libcurl-gnutls.so.4",target-name="/lib/x86_64-linux-gnu/libcurl-gnutls.so.4",host-name="/lib/x86_64-linux-gnu/libcurl-gnutls.so.4",symbols-loaded="0",thread-group="i1",ranges=[{from="0x00007ffff3314d00",to="0x00007ffff3383201"}]
=library-loaded,id="/lib/x86_64-linux-gnu/liblapack.so.3",target-name="/lib/x86_64-linux-gnu/liblapack.so.3",host-name="/lib/x86_64-linux-gnu/liblapack.so.3",symbols-loaded="0",thread-group="i1",ranges=[{from="0x00007ffff2bee260",to="0x00007ffff325876a"}]
=library-loaded,id="/lib/x86_64-linux-gnu/libuuid.so.1",target-name="/lib/x86_64-linux-gnu/libuuid.so.1",host-name="/lib/x86_64-linux-gnu/libuuid.so.1",symbols-loaded="0",thread-group="i1",ranges=[{from="0x00007ffff2bc2550",to="0x00007ffff2bc5d61"}]
=library-loaded,id="/path/to/OpenModelica/build_cmake/install_cmake/bin/../lib/x86_64-linux-gnu/omc/libomcgc.so",target-name="/path/to/OpenModelica/build_cmake/install_cmake/bin/../lib/x86_64-linux-gnu/omc/libomcgc.so",host-name="/path/to/OpenModelica/build_cmake/install_cmake/bin/../lib/x86_64-linux-gnu/omc/libomcgc.so",symbols-loaded="0",thread-group="i1",ranges=[{from="0x00007ffff2941f30",to="0x00007ffff295f820"}]
=library-loaded,id="/lib/x86_64-linux-gnu/libstdc++.so.6",target-name="/lib/x86_64-linux-gnu/libstdc++.so.6",host-name="/lib/x86_64-linux-gnu/libstdc++.so.6",symbols-loaded="0",thread-group="i1",ranges=[{from="0x00007ffff27a7420",to="0x00007ffff28affc2"}]
=library-loaded,id="/lib/x86_64-linux-gnu/libm.so.6",target-name="/lib/x86_64-linux-gnu/libm.so.6",host-name="/lib/x86_64-linux-gnu/libm.so.6",symbols-loaded="0",thread-group="i1",ranges=[{from="0x00007ffff262c3a0",to="0x00007ffff26a78c8"}]
=library-loaded,id="/lib/x86_64-linux-gnu/libgcc_s.so.1",target-name="/lib/x86_64-linux-gnu/libgcc_s.so.1",host-name="/lib/x86_64-linux-gnu/libgcc_s.so.1",symbols-loaded="0",thread-group="i1",ranges=[{from="0x00007ffff2601660",to="0x00007ffff2617805"}]
=library-loaded,id="/lib/x86_64-linux-gnu/libnghttp2.so.14",target-name="/lib/x86_64-linux-gnu/libnghttp2.so.14",host-name="/lib/x86_64-linux-gnu/libnghttp2.so.14",symbols-loaded="0",thread-group="i1",ranges=[{from="0x00007ffff25d71c0",to="0x00007ffff25eb546"}]
=library-loaded,id="/lib/x86_64-linux-gnu/libidn2.so.0",target-name="/lib/x86_64-linux-gnu/libidn2.so.0",host-name="/lib/x86_64-linux-gnu/libidn2.so.0",symbols-loaded="0",thread-group="i1",ranges=[{from="0x00007ffff25b33e0",to="0x00007ffff25b6579"}]
=library-loaded,id="/lib/x86_64-linux-gnu/librtmp.so.1",target-name="/lib/x86_64-linux-gnu/librtmp.so.1",host-name="/lib/x86_64-linux-gnu/librtmp.so.1",symbols-loaded="0",thread-group="i1",ranges=[{from="0x00007ffff2597d80",to="0x00007ffff25a6fd9"}]
=library-loaded,id="/lib/x86_64-linux-gnu/libssh.so.4",target-name="/lib/x86_64-linux-gnu/libssh.so.4",host-name="/lib/x86_64-linux-gnu/libssh.so.4",symbols-loaded="0",thread-group="i1",ranges=[{from="0x00007ffff2534460",to="0x00007ffff2574698"}]
=library-loaded,id="/lib/x86_64-linux-gnu/libpsl.so.5",target-name="/lib/x86_64-linux-gnu/libpsl.so.5",host-name="/lib/x86_64-linux-gnu/libpsl.so.5",symbols-loaded="0",thread-group="i1",ranges=[{from="0x00007ffff25133e0",to="0x00007ffff2514ea3"}]
=library-loaded,id="/lib/x86_64-linux-gnu/libnettle.so.8",target-name="/lib/x86_64-linux-gnu/libnettle.so.8",host-name="/lib/x86_64-linux-gnu/libnettle.so.8",symbols-loaded="0",thread-group="i1",ranges=[{from="0x00007ffff24d5260",to="0x00007ffff24f77dc"}]
=library-loaded,id="/lib/x86_64-linux-gnu/libgnutls.so.30",target-name="/lib/x86_64-linux-gnu/libgnutls.so.30",host-name="/lib/x86_64-linux-gnu/libgnutls.so.30",symbols-loaded="0",thread-group="i1",ranges=[{from="0x00007ffff2311b40",to="0x00007ffff243793d"}]
=library-loaded,id="/lib/x86_64-linux-gnu/libgssapi_krb5.so.2",target-name="/lib/x86_64-linux-gnu/libgssapi_krb5.so.2",host-name="/lib/x86_64-linux-gnu/libgssapi_krb5.so.2",symbols-loaded="0",thread-group="i1",ranges=[{from="0x00007ffff22973f0",to="0x00007ffff22cc928"}]
=library-loaded,id="/lib/x86_64-linux-gnu/libldap-2.5.so.0",target-name="/lib/x86_64-linux-gnu/libldap-2.5.so.0",host-name="/lib/x86_64-linux-gnu/libldap-2.5.so.0",symbols-loaded="0",thread-group="i1",ranges=[{from="0x00007ffff223b000",to="0x00007ffff2272e0c"}]
=library-loaded,id="/lib/x86_64-linux-gnu/liblber-2.5.so.0",target-name="/lib/x86_64-linux-gnu/liblber-2.5.so.0",host-name="/lib/x86_64-linux-gnu/liblber-2.5.so.0",symbols-loaded="0",thread-group="i1",ranges=[{from="0x00007ffff221d360",to="0x00007ffff2224341"}]
=library-loaded,id="/lib/x86_64-linux-gnu/libzstd.so.1",target-name="/lib/x86_64-linux-gnu/libzstd.so.1",host-name="/lib/x86_64-linux-gnu/libzstd.so.1",symbols-loaded="0",thread-group="i1",ranges=[{from="0x00007ffff2155220",to="0x00007ffff2206f02"}]
=library-loaded,id="/lib/x86_64-linux-gnu/libbrotlidec.so.1",target-name="/lib/x86_64-linux-gnu/libbrotlidec.so.1",host-name="/lib/x86_64-linux-gnu/libbrotlidec.so.1",symbols-loaded="0",thread-group="i1",ranges=[{from="0x00007ffff213e140",to="0x00007ffff21450da"}]
=library-loaded,id="/lib/x86_64-linux-gnu/libz.so.1",target-name="/lib/x86_64-linux-gnu/libz.so.1",host-name="/lib/x86_64-linux-gnu/libz.so.1",symbols-loaded="0",thread-group="i1",ranges=[{from="0x00007ffff2121280",to="0x00007ffff2131c14"}]
=library-loaded,id="/lib/x86_64-linux-gnu/libblas.so.3",target-name="/lib/x86_64-linux-gnu/libblas.so.3",host-name="/lib/x86_64-linux-gnu/libblas.so.3",symbols-loaded="0",thread-group="i1",ranges=[{from="0x00007ffff207eb90",to="0x00007ffff2114df8"}]
=library-loaded,id="/lib/x86_64-linux-gnu/libgfortran.so.5",target-name="/lib/x86_64-linux-gnu/libgfortran.so.5",host-name="/lib/x86_64-linux-gnu/libgfortran.so.5",symbols-loaded="0",thread-group="i1",ranges=[{from="0x00007ffff1dbf2f0",to="0x00007ffff2043adc"}]
=library-loaded,id="/lib/x86_64-linux-gnu/libunistring.so.2",target-name="/lib/x86_64-linux-gnu/libunistring.so.2",host-name="/lib/x86_64-linux-gnu/libunistring.so.2",symbols-loaded="0",thread-group="i1",ranges=[{from="0x00007ffff1c05790",to="0x00007ffff1c3ab51"}]
=library-loaded,id="/lib/x86_64-linux-gnu/libhogweed.so.6",target-name="/lib/x86_64-linux-gnu/libhogweed.so.6",host-name="/lib/x86_64-linux-gnu/libhogweed.so.6",symbols-loaded="0",thread-group="i1",ranges=[{from="0x00007ffff1bb4c80",to="0x00007ffff1bc6b89"}]
=library-loaded,id="/lib/x86_64-linux-gnu/libgmp.so.10",target-name="/lib/x86_64-linux-gnu/libgmp.so.10",host-name="/lib/x86_64-linux-gnu/libgmp.so.10",symbols-loaded="0",thread-group="i1",ranges=[{from="0x00007ffff1b32440",to="0x00007ffff1b9054d"}]
=library-loaded,id="/lib/x86_64-linux-gnu/libcrypto.so.3",target-name="/lib/x86_64-linux-gnu/libcrypto.so.3",host-name="/lib/x86_64-linux-gnu/libcrypto.so.3",symbols-loaded="0",thread-group="i1",ranges=[{from="0x00007ffff1799000",to="0x00007ffff19f4e22"}]
=library-loaded,id="/lib/x86_64-linux-gnu/libp11-kit.so.0",target-name="/lib/x86_64-linux-gnu/libp11-kit.so.0",host-name="/lib/x86_64-linux-gnu/libp11-kit.so.0",symbols-loaded="0",thread-group="i1",ranges=[{from="0x00007ffff15d3be0",to="0x00007ffff16763a0"}]
=library-loaded,id="/lib/x86_64-linux-gnu/libtasn1.so.6",target-name="/lib/x86_64-linux-gnu/libtasn1.so.6",host-name="/lib/x86_64-linux-gnu/libtasn1.so.6",symbols-loaded="0",thread-group="i1",ranges=[{from="0x00007ffff15954a0",to="0x00007ffff15a220b"}]
=library-loaded,id="/lib/x86_64-linux-gnu/libkrb5.so.3",target-name="/lib/x86_64-linux-gnu/libkrb5.so.3",host-name="/lib/x86_64-linux-gnu/libkrb5.so.3",symbols-loaded="0",thread-group="i1",ranges=[{from="0x00007ffff14e9f50",to="0x00007ffff1544b77"}]
=library-loaded,id="/lib/x86_64-linux-gnu/libk5crypto.so.3",target-name="/lib/x86_64-linux-gnu/libk5crypto.so.3",host-name="/lib/x86_64-linux-gnu/libk5crypto.so.3",symbols-loaded="0",thread-group="i1",ranges=[{from="0x00007ffff149a4c0",to="0x00007ffff14b45f2"}]
=library-loaded,id="/lib/x86_64-linux-gnu/libcom_err.so.2",target-name="/lib/x86_64-linux-gnu/libcom_err.so.2",host-name="/lib/x86_64-linux-gnu/libcom_err.so.2",symbols-loaded="0",thread-group="i1",ranges=[{from="0x00007ffff14923c0",to="0x00007ffff1492f59"}]
=library-loaded,id="/lib/x86_64-linux-gnu/libkrb5support.so.0",target-name="/lib/x86_64-linux-gnu/libkrb5support.so.0",host-name="/lib/x86_64-linux-gnu/libkrb5support.so.0",symbols-loaded="0",thread-group="i1",ranges=[{from="0x00007ffff1485630",to="0x00007ffff148aa24"}]
=library-loaded,id="/lib/x86_64-linux-gnu/libsasl2.so.2",target-name="/lib/x86_64-linux-gnu/libsasl2.so.2",host-name="/lib/x86_64-linux-gnu/libsasl2.so.2",symbols-loaded="0",thread-group="i1",ranges=[{from="0x00007ffff146a860",to="0x00007ffff147a0e4"}]
=library-loaded,id="/lib/x86_64-linux-gnu/libbrotlicommon.so.1",target-name="/lib/x86_64-linux-gnu/libbrotlicommon.so.1",host-name="/lib/x86_64-linux-gnu/libbrotlicommon.so.1",symbols-loaded="0",thread-group="i1",ranges=[{from="0x00007ffff1445080",to="0x00007ffff14455b5"}]
=library-loaded,id="/lib/x86_64-linux-gnu/libquadmath.so.0",target-name="/lib/x86_64-linux-gnu/libquadmath.so.0",host-name="/lib/x86_64-linux-gnu/libquadmath.so.0",symbols-loaded="0",thread-group="i1",ranges=[{from="0x00007ffff13fda80",to="0x00007ffff142895d"}]
=library-loaded,id="/lib/x86_64-linux-gnu/libffi.so.8",target-name="/lib/x86_64-linux-gnu/libffi.so.8",host-name="/lib/x86_64-linux-gnu/libffi.so.8",symbols-loaded="0",thread-group="i1",ranges=[{from="0x00007ffff13ef460",to="0x00007ffff13f5392"}]
=library-loaded,id="/lib/x86_64-linux-gnu/libkeyutils.so.1",target-name="/lib/x86_64-linux-gnu/libkeyutils.so.1",host-name="/lib/x86_64-linux-gnu/libkeyutils.so.1",symbols-loaded="0",thread-group="i1",ranges=[{from="0x00007ffff13e8260",to="0x00007ffff13e9404"}]
=library-loaded,id="/lib/x86_64-linux-gnu/libresolv.so.2",target-name="/lib/x86_64-linux-gnu/libresolv.so.2",host-name="/lib/x86_64-linux-gnu/libresolv.so.2",symbols-loaded="0",thread-group="i1",ranges=[{from="0x00007ffff13d56a0",to="0x00007ffff13de229"}]
~"[Thread debugging using libthread_db enabled]\n"
~"Using host libthread_db library \\"/lib/x86_64-linux-gnu/libthread_db.so.1\\".\n"
=thread-created,id="2",group-id="i1"
~"[New Thread 0x7ffff12c9640 (LWP 32048)]\n"
*running,thread-id="2"
=thread-created,id="3",group-id="i1"
~"[New Thread 0x7ffff0ac8640 (LWP 32049)]\n"
*running,thread-id="3"
=thread-created,id="4",group-id="i1"
~"[New Thread 0x7ffff02c7640 (LWP 32050)]\n"
*running,thread-id="4"
=thread-created,id="5",group-id="i1"
~"[New Thread 0x7fffefac6640 (LWP 32051)]\n"
*running,thread-id="5"
=thread-created,id="6",group-id="i1"
~"[New Thread 0x7fffef2c5640 (LWP 32052)]\n"
*running,thread-id="6"
=thread-created,id="7",group-id="i1"
~"[New Thread 0x7fffeeac4640 (LWP 32053)]\n"
*running,thread-id="7"
=thread-created,id="8",group-id="i1"
~"[New Thread 0x7fffee2c3640 (LWP 32054)]\n"
*running,thread-id="8"
=thread-created,id="9",group-id="i1"
~"[New Thread 0x7fffedac2640 (LWP 32055)]\n"
*running,thread-id="9"
=thread-created,id="10",group-id="i1"
~"[New Thread 0x7fffed2c1640 (LWP 32056)]\n"
*running,thread-id="10"
=thread-created,id="11",group-id="i1"
~"[New Thread 0x7fffecac0640 (LWP 32057)]\n"
*running,thread-id="11"
=thread-created,id="12",group-id="i1"
~"[New Thread 0x7fffec2bf640 (LWP 32058)]\n"
*running,thread-id="12"
=thread-created,id="13",group-id="i1"
~"[New Thread 0x7fffebabe640 (LWP 32059)]\n"
*running,thread-id="13"
=thread-created,id="14",group-id="i1"
~"[New Thread 0x7fffeb2bd640 (LWP 32060)]\n"
*running,thread-id="14"
=thread-created,id="15",group-id="i1"
~"[New Thread 0x7fffeaabc640 (LWP 32061)]\n"
*running,thread-id="15"
=thread-created,id="16",group-id="i1"
~"[New Thread 0x7fffea2bb640 (LWP 32062)]\n"
*running,thread-id="16"
v1.24.0-dev-30-gdbec0427dd-cmake
~"[Thread 0x7fffea2bb640 (LWP 32062) exited]\n"
=thread-exited,id="16",group-id="i1"
~"[Thread 0x7fffeaabc640 (LWP 32061) exited]\n"
=thread-exited,id="15",group-id="i1"
~"[Thread 0x7fffeb2bd640 (LWP 32060) exited]\n"
=thread-exited,id="14",group-id="i1"
~"[Thread 0x7fffecac0640 (LWP 32057) exited]\n"
=thread-exited,id="11",group-id="i1"
~"[Thread 0x7fffef2c5640 (LWP 32052) exited]\n"
=thread-exited,id="6",group-id="i1"
~"[Thread 0x7fffefac6640 (LWP 32051) exited]\n"
=thread-exited,id="5",group-id="i1"
~"[Thread 0x7ffff02c7640 (LWP 32050) exited]\n"
=thread-exited,id="4",group-id="i1"
~"[Thread 0x7fffebabe640 (LWP 32059) exited]\n"
=thread-exited,id="13",group-id="i1"
~"[Thread 0x7fffec2bf640 (LWP 32058) exited]\n"
=thread-exited,id="12",group-id="i1"
~"[Thread 0x7fffed2c1640 (LWP 32056) exited]\n"
=thread-exited,id="10",group-id="i1"
~"[Thread 0x7fffedac2640 (LWP 32055) exited]\n"
=thread-exited,id="9",group-id="i1"
~"[Thread 0x7fffee2c3640 (LWP 32054) exited]\n"
=thread-exited,id="8",group-id="i1"
~"[Thread 0x7fffeeac4640 (LWP 32053) exited]\n"
=thread-exited,id="7",group-id="i1"
~"[Thread 0x7ffff0ac8640 (LWP 32049) exited]\n"
=thread-exited,id="3",group-id="i1"
~"[Thread 0x7ffff12c9640 (LWP 32048) exited]\n"
=thread-exited,id="2",group-id="i1"
~"[Inferior 1 (process 32033) exited normally]\n"
=thread-exited,id="1",group-id="i1"
=thread-group-exited,id="i1",exit-code="0"
*stopped,reason="exited-normally"
(gdb)
`,
`11^exit
`
];

const testGDBOutputResultClass = [
  ["done"],
  ["done"],
  ["running"],
  [],
  ["exit"],
];

describe('GDB/MI Parser', () => {
  it('Initialize parser', async () => {
    const gdbMiParser = new GDBMIParser();
    await gdbMiParser.initialize();
  });

  it('Parse GDB/MI output', async () => {
    const gdbMiParser = new GDBMIParser();
    await gdbMiParser.initialize();

    for (let i = 0; i < testGdbOutput.length; i++) {
      const testOutput = testGdbOutput[i];
      gdbMiParser.parse(testOutput);
      const result = gdbMiParser.getResultClasses();
      assert.deepEqual(result, testGDBOutputResultClass[i], "Assert ResultClass failed");
    }
  }).timeout("2s");
});
