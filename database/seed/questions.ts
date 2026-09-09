export type SeedQuestion = {
  title: string;
  prompt: string;
  language: string;
  code_snippet: string;
  options: string[];
  correct_answer: number;
  difficulty: string;
  points: number;
  time_limit: number;
  category: string;
  explanation: string;
  hint: string;
  premium: boolean;
};
const examples: Array<[string, string, string, string[], number, string, string, string]> = [
  [
    'Python',
    'Shared rows',
    'rows = [[0] * 2] * 3\nrows[0][1] = 7\nprint(rows[2][1])',
    ['0', '7', 'IndexError', 'None'],
    1,
    'The list multiplication repeats references to the same inner list.',
    'Check whether the three rows are distinct objects.',
    'Hard',
  ],
  [
    'JavaScript',
    'Closure in a loop',
    'const f = [];\nfor (var i = 0; i < 3; i++) f.push(() => i);\nconsole.log(f[0]());',
    ['0', '1', '2', '3'],
    3,
    'All closures share the function-scoped i, whose final value is 3.',
    'var is function-scoped.',
    'Hard',
  ],
  [
    'Java',
    'Integer division',
    'System.out.println(5 / 2);',
    ['2', '2.5', '3', 'Compilation error'],
    0,
    'Both operands are integers, so division truncates toward zero.',
    'Look at the operand types.',
    'Easy',
  ],
  [
    'C++',
    'Post-increment',
    'int x = 4;\nint y = x++;\nstd::cout << x << " " << y;',
    ['4 4', '5 4', '5 5', '4 5'],
    1,
    'Post-increment produces the old value and then increments x.',
    'Distinguish the returned value from the changed variable.',
    'Easy',
  ],
  [
    'C',
    'Array size',
    'int a[5] = {1, 2};\nprintf("%zu", sizeof(a) / sizeof(a[0]));',
    ['2', '4', '5', 'Undefined behavior'],
    2,
    'The declared array contains five elements regardless of initializer count.',
    'Use the declared size.',
    'Easy',
  ],
  [
    'Python',
    'Default argument state',
    'def add(x, out=[]):\n    out.append(x)\n    return out\nadd(1)\nprint(add(2))',
    ['[2]', '[1, 2]', '[]', 'TypeError'],
    1,
    'The default list is created once when the function is defined.',
    'When is a default argument created?',
    'Hard',
  ],
  [
    'JavaScript',
    'Strict equality',
    'console.log(0 === false);',
    ['true', 'false', 'undefined', 'TypeError'],
    1,
    'Strict equality compares without coercing different types.',
    'The operator has three equals signs.',
    'Easy',
  ],
  [
    'Java',
    'String identity',
    'String a = new String("code");\nString b = new String("code");\nSystem.out.println(a == b);',
    ['true', 'false', 'code', 'Compilation error'],
    1,
    'The two new expressions create different objects; == compares references.',
    'Compare identity with content equality.',
    'Medium',
  ],
  [
    'C++',
    'Reference alias',
    'int x = 3;\nint& y = x;\ny = 9;\nstd::cout << x;',
    ['3', '9', '0', 'Compilation error'],
    1,
    'y aliases x, so assigning y modifies x.',
    'The ampersand declares a reference.',
    'Medium',
  ],
  [
    'C',
    'Short circuit',
    'int x = 0;\nif (0 && ++x) { x = 9; }\nprintf("%d", x);',
    ['0', '1', '9', 'Undefined behavior'],
    0,
    'Logical AND skips its right operand when the left operand is false.',
    'Does ++x execute?',
    'Medium',
  ],
  [
    'Python',
    'Slice independence',
    'a = [1, 2, 3]\nb = a[:]\nb[0] = 8\nprint(a[0])',
    ['8', '1', '3', 'IndexError'],
    1,
    'Slicing makes a new outer list; assigning its element does not modify a.',
    'Compare slicing with direct assignment.',
    'Medium',
  ],
  [
    'JavaScript',
    'Promise ordering',
    'console.log("A");\nPromise.resolve().then(() => console.log("B"));\nconsole.log("C");',
    ['A B C', 'B A C', 'A C B', 'C A B'],
    2,
    'The promise callback runs as a microtask after synchronous code finishes.',
    'Which statements are synchronous?',
    'Hard',
  ],
  [
    'Java',
    'Finally overrides',
    'static int f() {\n  try { return 1; }\n  finally { return 2; }\n}\nSystem.out.println(f());',
    ['1', '2', '3', 'Compilation error'],
    1,
    'The finally block return replaces the earlier pending return.',
    'The finally block runs before the method returns.',
    'Expert',
  ],
  [
    'C++',
    'Virtual dispatch',
    'struct A { virtual int f() { return 1; } };\nstruct B : A { int f() override { return 2; } };\nB b; A& a = b; std::cout << a.f();',
    ['1', '2', '0', 'Compilation error'],
    1,
    'Virtual dispatch uses the dynamic type B through the base reference.',
    'The method is virtual.',
    'Hard',
  ],
  [
    'C',
    'Pointer movement',
    'int a[] = {4, 8, 12};\nint *p = a;\np++;\nprintf("%d", *p);',
    ['4', '8', '12', 'Undefined behavior'],
    1,
    'Incrementing the pointer advances by one int element.',
    'Pointer arithmetic counts elements, not bytes.',
    'Medium',
  ],
  [
    'Python',
    'Generator exhaustion',
    'g = (x for x in range(3))\nlist(g)\nprint(list(g))',
    ['[0, 1, 2]', '[]', '[3]', 'RuntimeError'],
    1,
    'The first list consumes the generator; no items remain.',
    'Generators retain iteration state.',
    'Hard',
  ],
  [
    'JavaScript',
    'Destructuring defaults',
    'const { x = 5 } = { x: null };\nconsole.log(x);',
    ['5', 'null', 'undefined', 'TypeError'],
    1,
    'A destructuring default is used for undefined, not null.',
    'Is null the same as undefined?',
    'Medium',
  ],
  [
    'Java',
    'Compound narrowing',
    'byte b = 127;\nb += 1;\nSystem.out.println(b);',
    ['128', '-128', '127', 'Compilation error'],
    1,
    'Compound assignment includes a narrowing cast to byte, which wraps to -128.',
    'Consider the signed 8-bit range.',
    'Expert',
  ],
  [
    'C++',
    'Object slicing',
    'struct A { virtual int f() { return 1; } };\nstruct B : A { int f() override { return 2; } };\nB b; A a = b; std::cout << a.f();',
    ['1', '2', '0', 'Compilation error'],
    0,
    'Copying into a base value slices off the derived part.',
    'The destination is a value, not a reference.',
    'Expert',
  ],
  [
    'C',
    'Unsigned wrap',
    'unsigned int x = 0;\nx--;\nprintf("%d", x == UINT_MAX);',
    ['0', '1', '-1', 'Undefined behavior'],
    1,
    'Unsigned arithmetic wraps modulo one more than the maximum value.',
    'Unsigned overflow is defined.',
    'Hard',
  ],
];
export const baseQuestions: SeedQuestion[] = examples.map(
  ([language, title, code_snippet, options, correct_answer, explanation, hint, difficulty]) => ({
    title,
    prompt:
      'Assume required imports, headers and an appropriate entry point. What does this code print?',
    language,
    code_snippet,
    options,
    correct_answer,
    difficulty,
    points: ({ Easy: 10, Medium: 20, Hard: 30, Expert: 50 } as any)[difficulty],
    time_limit: 120,
    category: 'Program behavior',
    explanation,
    hint,
    premium: false,
  }),
);
export function premiumQuestion(set: number, index: number): SeedQuestion {
  const n = 3 + set * 5 + Math.floor(index / 5),
    language = ['Python', 'JavaScript', 'Java', 'C++', 'C'][index % 5];
  let code = '',
    answer = '',
    explanation = '',
    hint = '';
  if (language === 'Python') {
    code =
      'def collect(x, bucket=[]):\n    bucket.append(x)\n    return bucket\na = collect(' +
      n +
      ')\nb = collect(' +
      (n + 1) +
      ')\na.append(' +
      (n + 2) +
      ')\nprint(sum(b))';
    answer = String(3 * n + 3);
    explanation =
      'The default list and both returned references all point to the same list. The sum includes all three appended numbers.';
    hint = 'Track list identity across calls.';
  }
  if (language === 'JavaScript') {
    code =
      'const tasks = [];\nfor (var i = 0; i < ' +
      n +
      '; i++) {\n  tasks.push(() => i);\n}\nconsole.log(tasks[0]() + tasks.at(-1)());';
    answer = String(n * 2);
    explanation =
      'Both closures access the same var binding after the loop, when i equals ' + n + '.';
    hint = 'Consider the scope of the loop variable.';
  }
  if (language === 'Java') {
    code =
      'static int compute() {\n  int x = ' +
      n +
      ';\n  try { return x++; }\n  finally { return x * 2; }\n}\nSystem.out.println(compute());';
    answer = String((n + 1) * 2);
    explanation =
      'Post-increment changes x before finally runs; finally returns twice that updated value and overrides the pending return.';
    hint = 'Trace the side effect before entering finally.';
  }
  if (language === 'C++') {
    code =
      'struct A { virtual int f() const { return ' +
      n +
      '; } };\nstruct B : A { int f() const override { return ' +
      (n + 5) +
      '; } };\nB b; A sliced = b; const A& ref = b;\nstd::cout << sliced.f() + ref.f();';
    answer = String(n * 2 + 5);
    explanation =
      'The sliced base value calls A::f, while the reference retains virtual dispatch to B::f.';
    hint = 'Distinguish value copying from reference binding.';
  }
  if (language === 'C') {
    code =
      'int a[] = {' +
      n +
      ', ' +
      (n + 1) +
      ', ' +
      (n + 2) +
      '};\nint *p = a;\nint x = *p++;\nint y = ++*p;\nprintf("%d", x + y + a[1]);';
    answer = String(n * 3 + 4);
    explanation =
      'First read a[0] then advance p. Increment a[1] through p; y and a[1] now both equal ' +
      (n + 2) +
      '.';
    hint =
      'Postfix ++ binds more tightly than unary *, but prefix ++*p increments the pointed-to value.';
  }
  const options = [
    answer,
    String(Number(answer) - 1),
    String(Number(answer) + n),
    'Compilation error',
  ];
  const shift = (set + index) % 4;
  const rotated = [...options.slice(shift), ...options.slice(0, shift)];
  return {
    title: language + ' · State & identity ' + (set + 1) + '.' + (index + 1),
    prompt:
      'Assume required imports, headers and an appropriate entry point. Trace the program carefully. What is printed?',
    language,
    code_snippet: code,
    options: rotated,
    correct_answer: rotated.indexOf(answer),
    difficulty: index % 2 ? 'Expert' : 'Hard',
    points: 50,
    time_limit: 150,
    category: 'Advanced program tracing',
    explanation,
    hint,
    premium: true,
  };
}
