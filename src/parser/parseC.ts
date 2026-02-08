import type { NativeFunction } from './parserTypes.js';

export function parseCFunctions(tree: any): NativeFunction[] {
  const functions: NativeFunction[] = [];

  function visit(node: any) {
    if (node.type === 'function_definition') {
      const declarator = node.childForFieldName('declarator');
      const typeNode = node.childForFieldName('type');

      if (!declarator || !typeNode) return;

      const nameNode = declarator.childForFieldName('declarator');
      if (!nameNode) return;

      const name = nameNode.text;

      const paramsNode = declarator.childForFieldName('parameters');
      const params =
        paramsNode?.children
          ?.filter((c: any) => c.type === 'parameter_declaration')
          .map((p: any) => ({
            name: p.childForFieldName('declarator')?.text ?? 'arg',
            type: mapCType(p.childForFieldName('type')?.text),
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
  if (type.includes('int')) return 'int';
  if (type.includes('long')) return 'long';
  if (type.includes('float')) return 'float';
  if (type.includes('double')) return 'double';
  if (type.includes('char') && type.includes('*')) return 'char*';
  if (type.includes('*')) return 'pointer';
  if (type.includes('void')) return 'void';
  return 'unknown';
}
