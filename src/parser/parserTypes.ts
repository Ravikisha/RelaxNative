export type NativeType =
  | 'void'
  | 'int'
  | 'uint'
  | 'int8_t'
  | 'uint8_t'
  | 'int16_t'
  | 'uint16_t'
  | 'int32_t'
  | 'uint32_t'
  | 'int64_t'
  | 'uint64_t'
  | 'long'
  | 'size_t'
  | 'float'
  | 'double'
  | 'char*'
  | 'cstring'
  | 'buffer'
  | 'pointer'
  | 'unknown';

export type NativeParam = {
  name: string;
  type: NativeType;
};

export type NativeFunction = {
  name: string;
  returnType: NativeType;
  params: NativeParam[];
  sourceLine?: number;
  annotations?: {
    mode?: 'sync' | 'async';
    cost?: 'low' | 'medium' | 'high';
  };
};

export type ParseResult = {
  functions: NativeFunction[];
};
