import type { NativeFunction } from './parserTypes.js';

type VarargFn = { name: string; line: number };

export function parseCFunctions(tree: any): NativeFunction[] {
  const functions: NativeFunction[] = [];
  const varargs: VarargFn[] = [];

  function visit(node: any) {
    if (node.type === 'function_definition') {
      const declarator = node.childForFieldName('declarator');
      const typeNode = node.childForFieldName('type');

      if (!declarator || !typeNode) return;

      const nameNode = declarator.childForFieldName('declarator');
      // Tree-sitter C grammar varies a bit for simple identifiers vs pointer/func declarators.
      // If field lookup fails, fall back to best-effort parsing from declarator text.
      const name = nameNode?.text ?? declarator.text?.split('(')[0]?.trim();
      if (!name) return;

      const paramsNode = declarator.childForFieldName('parameters');
      const hasVarargs = (paramsNode?.children ?? []).some(
        (c: any) => c?.type === 'variadic_parameter' || c?.type === '...' || c?.text === '...',
      );
      if (hasVarargs) {
        varargs.push({ name, line: node.startPosition.row + 1 });
        return;
      }

      const params =
        paramsNode?.children
          ?.filter((c: any) => c.type === 'parameter_declaration')
          .map((p: any) => ({
            name: p.childForFieldName('declarator')?.text ?? 'arg',
            type: mapCType(
              // For pointer params, tree-sitter C often stores `*` in the declarator,
              // not in the `type` field. Combine both so we can detect pointers.
              `${p.childForFieldName('type')?.text ?? ''}${p.childForFieldName('declarator')?.text ?? ''}`,
            ),
          })) ?? [];

      functions.push({
        name,
        returnType: mapCType(typeNode.text),
        params,
        sourceLine: node.startPosition.row + 1,
      });
    }

    for (const child of node.children ?? []) visit(child);
  }

  visit(tree.rootNode);

  if (varargs.length) {
    const msg = varargs.map((v) => `- ${v.name} (line ${v.line})`).join('\n');
    throw new Error(
      `Unsupported native API: variadic functions (varargs, \",\") are not supported.\n\n` +
        `Relaxnative can't safely infer varargs ABI/calling conventions from source.\n` +
        `Please write a fixed-signature wrapper function in C/C++ and export that instead.\n\n` +
        `Found varargs functions:\n${msg}`,
    );
  }

  return functions;
}

function mapCType(type: string | undefined) {
  if (!type) return 'unknown';
  const t = type.replace(/\s+/g, ' ').trim();

  // C strings / byte buffers.
  // IMPORTANT: handle char* early, before the generic pointer branch.
  // Otherwise, `char*` params can get misclassified as `pointer<uint8_t>` just because
  // `uint8_t` appears in the alternation, which then makes koffi treat the pointer as
  // a different "kind" (e.g., char* vs double*).
  if (/\bconst\s+char\s*\*/.test(t)) return 'cstring';
  if (/\bchar\b/.test(t) && t.includes('*')) return 'buffer';

  // Common byte buffer patterns.
  if (/\b(u?int8_t|unsigned\s+char|uint8_t)\b/.test(t) && t.includes('*')) return 'buffer';

  // Fixed-width integer pointers.
  if (t.includes('*')) {
    // Detect pointer-to-pointer (e.g., int**). We currently don't support allocating
    // nested pointer graphs from JS, but we tag it distinctly so we can throw a
    // clear error at bind-time rather than letting koffi mis-marshal.
    if (t.includes('**')) {
  // For pointer-to-pointer parameters, we intentionally erase the inner type.
  // Reason: koffi distinguishes pointer "kinds" (char*, int*, double*, ...).
  // Our JS-side marshalling builds a temporary void** table, and passing it to a
  // typed int** signature can trigger runtime errors like:
  //   "Unexpected char * value, expected int *"
  // So we represent all T** as a generic pointer table and keep the true shape
  // (pointer-to-pointer) semantics for marshalling.
  return 'pointer<pointer>' as any;
    }

    // Floating-point pointers.
    // IMPORTANT: check these first.
    // For strings like "double* a", the substring "int" is present in "pointer"
    // in some combined forms, and a loose "includes('int')" check later can misclassify.
    if (/\bdouble\b/.test(t)) return 'pointer<double>' as any;
    if (/\bfloat\b/.test(t)) return 'pointer<float>' as any;

    if (/\buint8_t\b/.test(t)) return 'pointer<uint8_t>' as any;
    if (/\bint8_t\b/.test(t)) return 'pointer<int8_t>' as any;
    if (/\buint16_t\b/.test(t)) return 'pointer<uint16_t>' as any;
    if (/\bint16_t\b/.test(t)) return 'pointer<int16_t>' as any;
    if (/\buint32_t\b/.test(t)) return 'pointer<uint32_t>' as any;
    if (/\bint32_t\b/.test(t)) return 'pointer<int32_t>' as any;
    if (/\buint64_t\b/.test(t)) return 'pointer<uint64_t>' as any;
    if (/\bint64_t\b/.test(t)) return 'pointer<int64_t>' as any;

  // Plain C ints.
  if (/\bint\b/.test(t)) return 'pointer<int>' as any;
  }

  // Unsigned ints / fixed-width scalars.
  if (/\buint8_t\b/.test(t)) return 'uint8_t' as any;
  if (/\bint8_t\b/.test(t)) return 'int8_t' as any;
  if (/\buint16_t\b/.test(t)) return 'uint16_t' as any;
  if (/\bint16_t\b/.test(t)) return 'int16_t' as any;
  if (/\buint32_t\b/.test(t)) return 'uint32_t' as any;
  if (/\bint32_t\b/.test(t)) return 'int32_t' as any;
  if (/\buint64_t\b/.test(t)) return 'uint64_t' as any;
  if (/\bint64_t\b/.test(t)) return 'int64_t' as any;
  if (/\bunsigned\s+int\b/.test(t)) return 'uint';
  if (/\bsize_t\b/.test(t)) return 'size_t';

  if (t.includes('int')) return 'int';
  if (t.includes('long')) return 'long';
  if (t.includes('float')) return 'float';
  if (t.includes('double')) return 'double';

  // Treat generic char pointers as buffers (not strings).
  if (t.includes('char') && t.includes('*')) return 'buffer';
  if (t.includes('*')) return 'pointer';
  if (t.includes('void')) return 'void';
  return 'unknown';
}
