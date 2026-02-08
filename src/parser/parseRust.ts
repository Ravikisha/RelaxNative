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
  if (type.includes('i32')) return 'int';
  if (type.includes('i64')) return 'long';
  if (type.includes('f32')) return 'float';
  if (type.includes('f64')) return 'double';
  if (type.includes('*const i8')) return 'char*';
  if (type.includes('*')) return 'pointer';
  return 'unknown';
}
