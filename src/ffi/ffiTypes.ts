export type FfiFunction = {
  name: string;
  returns: string;
  args: string[];
  // execution hints (optional)
  mode?: 'sync' | 'async';
  cost?: 'low' | 'medium' | 'high';
};

export type FfiBindings = {
  // legacy: array; new: map
  functions: FfiFunction[] | Record<string, FfiFunction>;
};
