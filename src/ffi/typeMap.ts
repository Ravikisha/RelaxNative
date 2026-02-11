import koffi from 'koffi';

export function mapType(type: string) {
  if (type == null) {
    throw new Error('Unsupported native type: <undefined>');
  }

  const cstringType =
    (koffi.types as any).cstring ??
    (koffi as any).cstring ??
    // Fallback: some koffi builds don't expose cstring; treat it as char*.
    // This is good enough for reading NUL-terminated strings.
    ((koffi as any).pointer ? (koffi as any).pointer('char') : undefined);

  // pointer<T> generic support (e.g. pointer<double>)
  if (/^pointer\s*<.+>$/i.test(type)) {
    // Where possible, preserve the pointed-to type for correct width/alignment.
    const inner = type
      .replace(/^pointer\s*<\s*/i, '')
      .replace(/\s*>\s*$/i, '')
      .trim();

    // pointer<pointer<T>> support (bindable, but higher-level marshalling is handled elsewhere).
    if (/^pointer\s*<\s*pointer\s*<.+>\s*>\s*$/i.test(inner)) {
      // Treat it as void** at the ABI level.
      // We don't currently marshal nested pointer graphs from JS, but mapping it here:
      // - avoids confusing "Unsupported native type" errors
      // - lets bind-time checks throw a clearer, signature-aware message
      return (koffi as any).pointer((koffi as any).pointer('void'));
    }
    switch (inner) {
      case 'uint8_t':
			return (koffi as any).pointer((koffi.types as any).uint8 ?? (koffi.types as any).uchar);
      case 'int8_t':
			return (koffi as any).pointer((koffi.types as any).int8 ?? (koffi.types as any).char);
      case 'uint16_t':
			return (koffi as any).pointer((koffi.types as any).uint16 ?? (koffi.types as any).ushort);
      case 'int16_t':
			return (koffi as any).pointer((koffi.types as any).int16 ?? (koffi.types as any).short);
      case 'int32_t':
			return (koffi as any).pointer((koffi.types as any).int32 ?? koffi.types.int);
      case 'uint32_t':
        return (koffi as any).pointer(
          (koffi.types as any).uint32 ?? (koffi.types as any).uint,
        );
      case 'int64_t':
			return (koffi as any).pointer((koffi.types as any).int64 ?? koffi.types.int64);
      case 'uint64_t':
			return (koffi as any).pointer((koffi.types as any).uint64 ?? (koffi.types as any).ulonglong);
      case 'int':
        return (koffi as any).pointer(koffi.types.int);
      case 'double':
        return (koffi as any).pointer(koffi.types.double);
      case 'float':
        return (koffi as any).pointer(koffi.types.float);
      default:
        return (koffi as any).pointer('void');
    }
  }

  switch (type) {
    case 'int':
      return koffi.types.int;
    case 'uint':
      return (koffi.types as any).uint;
    case 'uint32_t':
      return (koffi.types as any).uint32 ?? (koffi.types as any).uint;
    case 'int32_t':
      return (koffi.types as any).int32 ?? koffi.types.int;
    case 'uint8_t':
      return (koffi.types as any).uint8 ?? (koffi.types as any).uchar;
    case 'int8_t':
      return (koffi.types as any).int8 ?? (koffi.types as any).char;
    case 'uint16_t':
      return (koffi.types as any).uint16 ?? (koffi.types as any).ushort;
    case 'int16_t':
      return (koffi.types as any).int16 ?? (koffi.types as any).short;
    case 'uint64_t':
      return (koffi.types as any).uint64 ?? (koffi.types as any).ulonglong;
    case 'int64_t':
      return (koffi.types as any).int64 ?? koffi.types.int64;
    case 'long':
      return koffi.types.int64;
    case 'size_t':
      return (koffi.types as any).size_t ?? (koffi.types as any).uint64;
    case 'float':
      return koffi.types.float;
    case 'double':
      return koffi.types.double;
    case 'char*':
      return cstringType;
    case 'cstring':
      return cstringType;
    case 'void':
      return koffi.types.void;
    case 'pointer':
  // Historically we used void* for all pointers, but that prevents koffi from
  // accepting typed array inputs (it expects a numeric address for void*).
  // Default to int* which allows passing Int32Array/TypedArray-like values.
  // For best precision, prefer pointer<T> from the parser.
  return (koffi as any).pointer(koffi.types.int);
    case 'buffer':
      return (koffi as any).pointer('void');
    default:
      throw new Error(`Unsupported native type: ${type}`);
  }
}
