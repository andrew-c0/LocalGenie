// Node.js process global for Vite config
interface ProcessEnv {
  [key: string]: string | undefined;
}

interface Process {
  env: ProcessEnv;
  version: string;
  argv: string[];
  exit: (code?: number) => void;
}

declare const process: Process;
