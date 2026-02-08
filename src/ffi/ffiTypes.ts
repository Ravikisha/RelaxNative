export type FfiFunction = {
  name: string;
  returns: string;
  args: string[];
};

export type FfiBindings = {
  functions: FfiFunction[];
};
