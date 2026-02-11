import type { NativeFunction } from './parserTypes.js';

export function parseRustFunctions(tree: any): NativeFunction[] {
  const functions: NativeFunction[] = [];

  function visit(node: any) {
    if (
      node.type === 'function_item' &&
      node.text.includes('pub extern')
    ) {
      const nameNode = node.childForFieldName('name');
      const paramsNode = node.childForFieldName('parameters');
      const returnNode = node.childForFieldName('return_type');

      const params =
        paramsNode?.children
          ?.filter((c: any) => c.type === 'parameter')
          .map((p: any) => ({
            name: p.childForFieldName('pattern')?.text ?? 'arg',
            type: mapRustType(p.childForFieldName('type')?.text),
          })) ?? [];

      functions.push({
        name: nameNode?.text ?? 'unknown',
        returnType: mapRustType(returnNode?.text),
        params,
        sourceLine: node.startPosition.row + 1,
      });
    }

    for (const child of node.children ?? []) visit(child);
  }

  visit(tree.rootNode);
  return functions;
}

function mapRustType(type: string | undefined) {
  if (!type) return 'void';

  const t = type.replace(/\s+/g, ' ').trim();

  // Scalars
  if (/\bi32\b/.test(t)) return 'int';
  if (/\bi64\b/.test(t)) return 'long';
  if (/\bu32\b/.test(t)) return 'uint32_t' as any;
  if (/\bu64\b/.test(t)) return 'uint64_t' as any;
  if (/\bf32\b/.test(t)) return 'float';
  if (/\bf64\b/.test(t)) return 'double';

  // C strings
  if (/\*const\s+i8\b/.test(t) || /\*mut\s+i8\b/.test(t)) return 'char*';

  // Typed pointers commonly used in Rust FFI.
  if (t.includes('*')) {
    if (/\*const\s+f64\b/.test(t) || /\*mut\s+f64\b/.test(t)) return 'pointer<double>' as any;
    if (/\*const\s+f32\b/.test(t) || /\*mut\s+f32\b/.test(t)) return 'pointer<float>' as any;
    if (/\*const\s+i32\b/.test(t) || /\*mut\s+i32\b/.test(t)) return 'pointer<int>' as any;
    if (/\*const\s+u32\b/.test(t) || /\*mut\s+u32\b/.test(t)) return 'pointer<uint32_t>' as any;
    if (/\*const\s+u8\b/.test(t) || /\*mut\s+u8\b/.test(t)) return 'pointer<uint8_t>' as any;
    if (/\*const\s+i8\b/.test(t) || /\*mut\s+i8\b/.test(t)) return 'pointer<int8_t>' as any;

    return 'pointer';
  }

  return 'unknown';
}
