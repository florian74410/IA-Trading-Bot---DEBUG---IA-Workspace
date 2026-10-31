#!/usr/bin/env node
'use strict';
// Interactive, DEBUG-ONLY wrapper. Keeps the original Auth21 operator
// authorization (localOperator), DB checks, confirmations and secret handling.
// Use readline for public/operator answers so arrows and pasted text work.
// Passwords continue to use the original non-echoing secure TTY reader.
const readline = require('node:readline/promises');
const cli = require('../Core/Clients/UserManagement/cli');

async function prompt(label) {
  if (!process.stdin.isTTY || !process.stdout.isTTY) throw Error('LOCAL_TTY_REQUIRED');
  if (/mot de passe|password|secret|clé privée|private key|token/i.test(label)) {
    return cli.promptSecret(label);
  }
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: true,
    historySize: 0,
    removeHistoryDuplicates: true
  });
  try {
    const answer = await rl.question(label + ': ');
    if (answer.length > 1024 || /[\x00-\x08\x0b-\x1f\x7f]/.test(answer)) {
      throw Error('INPUT_INVALID');
    }
    return answer;
  } finally {
    rl.close();
  }
}

async function main() {
  const [action] = process.argv.slice(2);
  if (!['migrate', 'create-first-admin'].includes(action) || process.argv.length !== 3) {
    throw Error('DEBUG_OPERATOR_ACTION_FORBIDDEN');
  }
  const result = await cli.run([action], { prompt, check: cli.localOperator });
  console.log(result.help || JSON.stringify(result, null, 2));
}
main().catch(e => {
  console.error(/^[A-Z0-9_]+$/.test(e.message) ? e.message : 'DEBUG_OPERATOR_FAILED');
  process.exitCode = 1;
});
