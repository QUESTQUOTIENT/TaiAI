

import { createRequire } from 'module';
import path               from 'path';
import fs                 from 'fs';


const require = createRequire(import.meta.url);
const solc     = require('solc') as {
  compile: (input: string, options?: { import: (p: string) => { contents?: string; error?: string } }) => string;
};



export interface CompilationResult {
  abi:          any[];
  bytecode:     string;
  source:       string;
  contractName: string;
  warnings?:    string[];
  error?:       string;
}





function findImports(importPath: string): { contents: string } | { error: string } {
  const roots = [
    process.cwd(),
    path.resolve(process.cwd(), 'server'),
    path.resolve(process.cwd(), 'server', 'services'),
  ];
  for (const root of roots) {
    try {
      const full = path.join(root, 'node_modules', importPath);
      if (fs.existsSync(full)) return { contents: fs.readFileSync(full, 'utf8') };
    } catch {  }
  }
  if (fs.existsSync(importPath)) {
    try { return { contents: fs.readFileSync(importPath, 'utf8') }; } catch {}
  }
  return { error: `Import not found: ${importPath}` };
}



function findContractInOutput(
  output:         any,
  sourceFileName: string,
  expectedName:   string,
): { abi: any[]; bytecode: string } | null {
  const contracts = output?.contracts;
  if (!contracts) return null;

  
  const sf = contracts[sourceFileName];
  if (sf?.[expectedName]?.abi) {
    const c = sf[expectedName];
    return { abi: c.abi, bytecode: c.evm?.bytecode?.object ?? '' };
  }
  
  if (sf) {
    const keys = Object.keys(sf);
    if (keys.length > 0 && sf[keys[0]]?.abi) {
      const c = sf[keys[0]];
      return { abi: c.abi, bytecode: c.evm?.bytecode?.object ?? '' };
    }
  }
  
  for (const [, fc] of Object.entries(contracts) as any) {
    if (typeof fc !== 'object') continue;
    if (fc[expectedName]?.evm?.bytecode?.object?.length > 100) {
      const c = fc[expectedName];
      return { abi: c.abi, bytecode: c.evm.bytecode.object };
    }
  }
  
  for (const [, fc] of Object.entries(contracts) as any) {
    if (typeof fc !== 'object') continue;
    for (const [, c] of Object.entries(fc) as any) {
      if (c?.evm?.bytecode?.object?.length > 100) {
        return { abi: c.abi, bytecode: c.evm.bytecode.object };
      }
    }
  }
  return null;
}



export async function compileContract(
  sourceCode:   string,
  contractName: string,
): Promise<CompilationResult> {
  const safeName       = (contractName || '').replace(/[^a-zA-Z0-9_]/g, '') || 'Contract';
  const sourceFileName = `${safeName}.sol`;

  const solcInput = JSON.stringify({
    language: 'Solidity',
    sources:  { [sourceFileName]: { content: sourceCode } },
    settings: {
      outputSelection: { '*': { '*': ['abi', 'evm.bytecode', 'evm.deployedBytecode'] } },
      optimizer:       { enabled: true, runs: 200 },
    },
  });

  let output: any;
  try {
    
    const rawOutput = solc.compile(solcInput, { import: findImports });
    output = JSON.parse(rawOutput);
  } catch (err: any) {
    console.error('[compiler] solc.compile threw:', err.message);
    return {
      abi: [], bytecode: '', source: sourceCode, contractName: safeName,
      error: `Compilation failed: ${err.message}`,
    };
  }

  const allErrors = output?.errors ?? [];
  const errors    = allErrors.filter((e: any) => e.severity === 'error');
  const warnings  = allErrors
    .filter((e: any) => e.severity === 'warning')
    .map((e: any) => e.formattedMessage ?? e.message);

  if (errors.length > 0) {
    const msg = errors.map((e: any) => e.formattedMessage ?? e.message).join('\n');
    console.error(`[compiler] Solidity errors for ${safeName}:\n`, msg.slice(0, 800));
    return { abi: [], bytecode: '', source: sourceCode, contractName: safeName, error: msg };
  }

  const found = findContractInOutput(output, sourceFileName, safeName);
  if (!found) {
    return {
      abi: [], bytecode: '', source: sourceCode, contractName: safeName,
      error:
        `Contract "${safeName}" not found in compiler output. ` +
        `Make sure the "contract ${safeName}" keyword is in your source.`,
    };
  }
  if (!found.bytecode || found.bytecode.length === 0) {
    return {
      abi: found.abi, bytecode: '', source: sourceCode, contractName: safeName,
      error: 'Compilation succeeded but produced empty bytecode ' +
             '(is this an interface or abstract contract?)',
    };
  }

  console.log(
    `[compiler] ✓ ${safeName} — ` +
    `${Math.round(found.bytecode.length / 2 / 1024)}KB bytecode, ` +
    `${found.abi.length} ABI entries` +
    (warnings.length ? `, ${warnings.length} warning(s)` : ''),
  );

  return {
    abi:          found.abi,
    bytecode:     found.bytecode,
    source:       sourceCode,
    contractName: safeName,
    warnings:     warnings.length > 0 ? warnings : undefined,
  };
}
