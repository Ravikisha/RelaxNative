import type { NativeFunction } from './parserTypes.js';

export function parseCFunctions(tree: any): NativeFunction[] {
  const functions: NativeFunction[] = [];

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
  return functions;
}

function mapCType(type: string | undefined) {
  if (!type) return 'unknown';
  const t = type.replace(/\s+/g, ' ').trim();
  // Common byte buffer patterns.
  if (/\b(u?int8_t|unsigned\s+char|uint8_t)\b/.test(t) && t.includes('*')) return 'buffer';

  // Fixed-width integer pointers.
  if (t.includes('*')) {
    if (/\buint8_t\b/.test(t)) return 'pointer<uint8_t>' as any;
    if (/\bint8_t\b/.test(t)) return 'pointer<int8_t>' as any;
    if (/\buint16_t\b/.test(t)) return 'pointer<uint16_t>' as any;
    if (/\bint16_t\b/.test(t)) return 'pointer<int16_t>' as any;
    if (/\buint32_t\b/.test(t)) return 'pointer<uint32_t>' as any;
    if (/\bint32_t\b/.test(t)) return 'pointer<int32_t>' as any;
    if (/\buint64_t\b/.test(t)) return 'pointer<uint64_t>' as any;
    if (/\bint64_t\b/.test(t)) return 'pointer<int64_t>' as any;
  }

  // C strings (explicit)
  if (/\bconst\s+char\s*\*/.test(t)) return 'cstring';

  // Unsigned ints (useful for size-like params)
  // Preserve explicit uint32_t scalars so FFI can map widths correctly.
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
  if (type.includes('float')) return 'float';
  if (type.includes('double')) return 'double';
  // Treat generic char pointers as buffers (not strings) when using native.alloc.
  // `char*` string semantics are still available via explicit `char*` returns.
  if (t.includes('char') && t.includes('*')) return 'buffer';
  if (t.includes('*')) return 'pointer';
  if (t.includes('void')) return 'void';
  return 'unknown';
}
