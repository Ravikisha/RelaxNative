import Parser from 'tree-sitter';

import C from 'tree-sitter-c';
import CPP from 'tree-sitter-cpp';
import Rust from 'tree-sitter-rust';

export function createParser(lang: 'c' | 'cpp' | 'rust'): Parser {
  const parser = new Parser();

  if (lang === 'c') parser.setLanguage(C);
  if (lang === 'cpp') parser.setLanguage(CPP);
  if (lang === 'rust') parser.setLanguage(Rust);

  return parser;
}
