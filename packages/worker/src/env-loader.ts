import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

let loaded = false;

export function loadWorkspaceEnv(): void {
  if (loaded) return;
  loaded = true;

  const root = findWorkspaceRoot(process.cwd()) || findWorkspaceRoot(__dirname);
  const envPath = root ? path.join(root, '.env') : path.resolve(process.cwd(), '.env');
  if (fs.existsSync(envPath)) {
    dotenv.config({ path: envPath });
  }
}

function findWorkspaceRoot(start: string): string | null {
  let current = path.resolve(start);
  while (true) {
    if (fs.existsSync(path.join(current, 'pnpm-workspace.yaml'))) return current;
    const parent = path.dirname(current);
    if (parent === current) return null;
    current = parent;
  }
}
