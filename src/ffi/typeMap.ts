import koffi from 'koffi';

export function mapType(type: string) {
  switch (type) {
    case 'int':
      return koffi.types.int;
    case 'long':
      return koffi.types.int64;
    case 'float':
      return koffi.types.float;
    case 'double':
      return koffi.types.double;
    case 'char*':
      return koffi.types.cstring;
    case 'void':
      return koffi.types.void;
    case 'pointer':
      return koffi.types.pointer;
    default:
      throw new Error(`Unsupported native type: ${type}`);
  }
}
