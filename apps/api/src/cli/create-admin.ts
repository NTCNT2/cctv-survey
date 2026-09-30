/**
 * Creates an admin account:  pnpm user:create-admin <username>
 *
 * The password is read from a hidden prompt (or from stdin when piped), never
 * from argv, so it does not end up in shell history or the process list.
 */
import { createUserSchema } from '@cctv/shared';
import { NestFactory } from '@nestjs/core';
import { createInterface } from 'node:readline';
import { AppModule } from '../app.module.js';
import { UsersService } from '../users/users.service.js';

/**
 * One readline for all prompts. The async iterator buffers lines, so piped
 * input (`printf 'pw\npw\n' | ...`) is not lost between prompts. On a
 * terminal, echo is muted while a secret is typed.
 */
function openPrompt() {
  const tty = Boolean(process.stdin.isTTY);
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: tty,
  });
  let muted = false;
  if (tty) {
    const w = rl as unknown as { _writeToOutput: (s: string) => void };
    const write = w._writeToOutput.bind(rl);
    w._writeToOutput = (s: string) => {
      if (!muted) write(s);
    };
  }
  const lines = rl[Symbol.asyncIterator]();
  return {
    async secret(prompt: string): Promise<string> {
      process.stdout.write(prompt);
      muted = true;
      const next = await lines.next();
      muted = false;
      process.stdout.write('\n');
      return next.done ? '' : next.value;
    },
    close: () => rl.close(),
  };
}

async function main(): Promise<number> {
  const username = process.argv[2];
  if (!username) {
    console.error('usage: pnpm user:create-admin <username>');
    return 2;
  }
  const prompt = openPrompt();
  const password = await prompt.secret('Password: ');
  const confirm = await prompt.secret('Repeat password: ');
  prompt.close();
  if (password !== confirm) {
    console.error('error: passwords do not match');
    return 1;
  }
  const parsed = createUserSchema.safeParse({
    username,
    password,
    role: 'admin',
  });
  if (!parsed.success) {
    // Messages come from the schema and never echo the password itself.
    for (const i of parsed.error.issues) console.error(`error: ${i.message}`);
    return 1;
  }

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });
  try {
    const user = await app.get(UsersService).create(parsed.data);
    console.log(`created admin "${user.username}" (${user.id})`);
    return 0;
  } catch (err) {
    const code = (err as { code?: string }).code;
    console.error(
      code === '23505'
        ? `error: username "${parsed.data.username}" already exists`
        : 'error: could not create the user (see server log)',
    );
    return 1;
  } finally {
    await app.close();
  }
}

process.exitCode = await main();
