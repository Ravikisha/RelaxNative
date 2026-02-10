export type WorkerRequest = {
  id: number;
  libPath: string;
  bindings: any;
  fn: string;
  args: any[];
  callsite?: string;
};

export type WorkerResponse = {
  id: number;
  result?: any;
  error?: string;
  errorCallsite?: string;
};
