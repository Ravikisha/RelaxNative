#!/usr/bin/env node

import {
	installPackageEnforcingTrust,
	listPackages,
	removePackage,
	updateIndex,
} from './registry/installer.js';
import { formatNativeTestResults, runNativeTests } from './nativeTestHarness.js';
import {
	benchmarkCompareSyncVsWorker,
	formatBenchmarkCompare,
	benchmarkCompareTraditionalVsRelaxnative,
	formatBenchmarkTraditionalCompare,
} from './benchmark.js';
import { detectCompilers } from './compiler/detect.js';
import { getCacheRoot } from './cache/cachePaths.js';
import { existsSync, readdirSync, rmSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { readFileSync } from 'node:fs';

function isTraceEnabled() {
	return process.env.RELAXNATIVE_TRACE === '1';
}

function trace(...args: any[]) {
	if (!isTraceEnabled()) return;
	// eslint-disable-next-line no-console
	console.log('[relaxnative:trace]', ...args);
}

function getFlagValue(argv: string[], name: string): string | undefined {
	const idx = argv.indexOf(name);
	if (idx === -1) return undefined;
	return argv[idx + 1];
}

function hasFlag(argv: string[], name: string): boolean {
	return argv.includes(name);
}

function usage() {
	console.log(`relaxnative

Usage:
	relaxnative add <package>
	relaxnative list
	relaxnative remove <package>
	relaxnative test <nativeDir>
	relaxnative bench <nativeFile> <fnName>
	relaxnative doctor
	relaxnative cache status
	relaxnative cache clean

Examples:
	npx relaxnative test native/
	npx relaxnative bench native/examples/add.c add
	npx relaxnative bench native/examples/add.c add --traditional
	npx relaxnative doctor
	npx relaxnative cache status

Notes:
	- For deterministic offline installs, use: file:<path>
	- Example: relaxnative add file:examples/registry/fast-matrix
	- Trust levels: local (no prompts), community (warning + confirmation), verified (silent install, requires signature)
	- Add: pass --yes to make the command non-interactive (community installs will fail unless previously trusted)
	- Bench: pass --traditional to include a JS baseline when available (built-in for add)
`);
}

function fmtOk(msg: string) {
	return `\u2713 ${msg}`;
}

function fmtFail(msg: string) {
	return `\u2717 ${msg}`;
}

function folderSizeBytes(dir: string): { bytes: number; newestMtimeMs: number } {
	let bytes = 0;
	let newest = 0;
	if (!existsSync(dir)) return { bytes: 0, newestMtimeMs: 0 };
	for (const ent of readdirSync(dir, { withFileTypes: true })) {
		const p = join(dir, ent.name);
		try {
			const st = statSync(p);
			newest = Math.max(newest, st.mtimeMs);
			if (ent.isDirectory()) {
				const sub = folderSizeBytes(p);
				bytes += sub.bytes;
				newest = Math.max(newest, sub.newestMtimeMs);
			} else if (ent.isFile()) {
				bytes += st.size;
			}
		} catch {
			// ignore races
		}
	}
	return { bytes, newestMtimeMs: newest };
}

function humanBytes(bytes: number) {
	const u = ['B', 'KB', 'MB', 'GB'];
	let b = bytes;
	let i = 0;
	while (b >= 1024 && i < u.length - 1) {
		b /= 1024;
		i++;
	}
	return `${b.toFixed(i === 0 ? 0 : 1)} ${u[i]}`;
}

async function main() {
	// Best-effort crash traces. Segfaults won't be caught, but for many failures
	// (protocol errors, worker errors, bad args) we can at least print context.
	process.on('uncaughtException', (err) => {
		// eslint-disable-next-line no-console
		console.error('[relaxnative] uncaughtException', err);
	});
	process.on('unhandledRejection', (err) => {
		// eslint-disable-next-line no-console
		console.error('[relaxnative] unhandledRejection', err);
	});

	const [, , cmd, arg] = process.argv;

	if (!cmd || cmd === '-h' || cmd === '--help') {
		usage();
		process.exit(0);
	}

	if (cmd === 'add') {
		if (!arg) {
			console.error('Missing package specifier');
			usage();
			process.exit(1);
		}

		const yes = hasFlag(process.argv, '--yes');
		const res = await installPackageEnforcingTrust(arg, process.cwd(), { yes });
		updateIndex(process.cwd());

		console.log(`Installed ${res.pkg} (${res.trust}) at ${res.dir}`);
		if (res.warnings.length) {
			console.warn('\nStatic scan warnings:');
			for (const w of res.warnings) {
				console.warn(`  - ${w}`);
			}
		}

		process.exit(0);
	}

	if (cmd === 'list') {
		const pkgs = listPackages(process.cwd());
		for (const p of pkgs) console.log(p);
		process.exit(0);
	}

	if (cmd === 'remove') {
		if (!arg) {
			console.error('Missing package name');
			usage();
			process.exit(1);
		}
		removePackage(arg, process.cwd());
		updateIndex(process.cwd());
		console.log(`Removed ${arg}`);
		process.exit(0);
	}

	if (cmd === 'test') {
		if (!arg) {
			console.error('Missing native directory (ex: native/)');
			usage();
			process.exit(1);
		}

		const isolation = (getFlagValue(process.argv, '--isolation') ?? 'in-process') as
			| 'in-process'
			| 'worker'
			| 'process';
		if (!['in-process', 'worker', 'process'].includes(isolation)) {
			console.error('Invalid --isolation (expected: in-process|worker|process)');
			process.exit(1);
		}

		const { results, exitCode } = await runNativeTests(arg, { isolation });
		if (!results.length) {
			console.log('No native tests found');
			process.exit(0);
		}
		console.log(formatNativeTestResults(results));
		process.exit(exitCode);
	}

	if (cmd === 'bench') {
		const nativeFile = arg;
		const fnName = process.argv[4];
		if (!nativeFile || !fnName) {
			console.error('Usage: relaxnative bench <nativeFile> <fnName>');
			usage();
			process.exit(1);
		}

		const iterationsRaw = getFlagValue(process.argv, '--iterations');
		const warmupRaw = getFlagValue(process.argv, '--warmup');
		const argsRaw = getFlagValue(process.argv, '--args');
		const json = hasFlag(process.argv, '--json');
		const traditional = hasFlag(process.argv, '--traditional');
		const confirm = hasFlag(process.argv, '--confirm');

		trace('bench start', {
			nativeFile,
			fnName,
			traditional,
			iterationsRaw,
			warmupRaw,
		});

		let args: any[] | undefined;
		if (argsRaw != null) {
			try {
				const parsed = JSON.parse(argsRaw);
				if (!Array.isArray(parsed)) {
					console.error('--args must be a JSON array (example: --args "[1,2]")');
					process.exit(1);
				}
				args = parsed;
			} catch {
				console.error('Invalid JSON for --args (example: --args "[1,2]")');
				process.exit(1);
			}
		}

		const iterations = iterationsRaw ? Number(iterationsRaw) : 50_000;
		const warmup = warmupRaw ? Number(warmupRaw) : 2_000;
		trace('bench parsed flags', { iterations, warmup, hasArgs: Array.isArray(args) });
		if (!Number.isFinite(iterations) || iterations <= 0) {
			console.error('Invalid --iterations');
			process.exit(1);
		}
		if (!Number.isFinite(warmup) || warmup < 0) {
			console.error('Invalid --warmup');
			process.exit(1);
		}

		// Guard rails for accidental huge runs.
		const expensive = iterations > 250_000;
		if (expensive && !confirm) {
			console.error('Refusing to run: iterations > 250000. Re-run with --confirm to proceed.');
			process.exit(2);
		}

		if (traditional) {
			try {
				trace('bench traditional: begin');
				const res = await benchmarkCompareTraditionalVsRelaxnative(nativeFile, fnName, {
					iterations,
					warmup,
					args,
				});
				trace('bench traditional: done');
			if (json) console.log(JSON.stringify(res, null, 2));
			else console.log(formatBenchmarkTraditionalCompare(res));
			} catch (e: any) {
				// eslint-disable-next-line no-console
				console.error('[relaxnative] bench failed', {
					nativeFile,
					fnName,
					traditional: true,
					error: e?.message ?? String(e),
				});
				if (isTraceEnabled()) {
					// eslint-disable-next-line no-console
					console.error(e);
				}
				process.exit(1);
			}
		} else {
			try {
				trace('bench compare: begin');
				const res = await benchmarkCompareSyncVsWorker(nativeFile, fnName, { iterations, warmup, args });
				trace('bench compare: done');
			if (json) console.log(JSON.stringify(res, null, 2));
			else console.log(formatBenchmarkCompare(res));
			} catch (e: any) {
				// eslint-disable-next-line no-console
				console.error('[relaxnative] bench failed', {
					nativeFile,
					fnName,
					traditional: false,
					error: e?.message ?? String(e),
				});
				if (isTraceEnabled()) {
					// eslint-disable-next-line no-console
					console.error(e);
				}
				process.exit(1);
			}
		}
		process.exit(0);
	}

	if (cmd === 'doctor') {
		const lines: string[] = [];
		try {
			const { c, rust } = detectCompilers();
			if (c) lines.push(fmtOk(`C compiler detected (${c.vendor} ${c.version})`));
			else lines.push(fmtFail('C compiler missing (install clang or gcc)'));
			if (rust) lines.push(fmtOk(`Rust compiler detected (${rust.version})`));
			else lines.push(fmtFail('Rust compiler missing (install rustc + cargo)'));
		} catch (e: any) {
			lines.push(fmtFail(`Compiler detection failed: ${e?.message ?? String(e)}`));
		}

		// worker threads support (ESM-safe)
		try {
			await import('node:worker_threads');
			lines.push(fmtOk('Worker threads supported'));
		} catch {
			lines.push(fmtFail('Worker threads not supported in this Node build'));
		}

		// cache directory health
		const root = getCacheRoot();
		try {
			const st = existsSync(root) ? statSync(root) : null;
			if (!st) lines.push(fmtOk(`Cache directory will be created at ${root}`));
			else if (st.isDirectory()) lines.push(fmtOk(`Cache directory OK (${root})`));
			else lines.push(fmtFail(`Cache path is not a directory: ${root}`));
		} catch (e: any) {
			lines.push(fmtFail(`Cache directory not accessible: ${e?.message ?? String(e)}`));
		}

		// loader hint (best-effort)
		lines.push(fmtOk('ESM loader supported (Node >= 18)'));

		console.log(lines.join('\n'));
		process.exit(lines.some((l) => l.startsWith('\u2717')) ? 1 : 0);
	}

	if (cmd === 'cache') {
		const sub = arg;
		const root = getCacheRoot();
		if (!sub || !['status', 'clean'].includes(sub)) {
			console.error('Usage: relaxnative cache <status|clean>');
			process.exit(1);
		}

		if (sub === 'status') {
			if (!existsSync(root)) {
				console.log(fmtOk(`Cache empty (missing dir: ${root})`));
				process.exit(0);
			}
			const entries = readdirSync(root, { withFileTypes: true }).filter((d) => d.isDirectory());
			const { bytes, newestMtimeMs } = folderSizeBytes(root);
			const last = newestMtimeMs ? new Date(newestMtimeMs).toISOString() : 'n/a';

			let newestAccess = 0;
			for (const ent of entries) {
				const metaPath = join(root, ent.name, 'meta.json');
				try {
					const raw = readFileSync(metaPath, 'utf8');
					const meta = JSON.parse(raw) as { lastAccessAt?: number };
					if (typeof meta.lastAccessAt === 'number') {
						newestAccess = Math.max(newestAccess, meta.lastAccessAt);
					}
				} catch {
					// ignore broken entries
				}
			}
			const lastAccess = newestAccess ? new Date(newestAccess).toISOString() : 'n/a';
			console.log(fmtOk(`Cache entries: ${entries.length}`));
			console.log(fmtOk(`Disk usage: ${humanBytes(bytes)}`));
			console.log(fmtOk(`Last modified: ${last}`));
			console.log(fmtOk(`Last access: ${lastAccess}`));
			process.exit(0);
		}

		// clean
		rmSync(root, { recursive: true, force: true });
		console.log(fmtOk('Cache cleaned'));
		process.exit(0);
	}

	console.error(`Unknown command: ${cmd}`);
	usage();
	process.exit(1);
}

// eslint-disable-next-line @typescript-eslint/no-floating-promises
main();
