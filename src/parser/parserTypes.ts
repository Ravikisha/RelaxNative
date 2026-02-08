export type NativeType =
  | 'void'
  | 'int'
  | 'long'
  | 'float'
  | 'double'
  | 'char*'
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
};

export type ParseResult = {
  functions: NativeFunction[];
};
