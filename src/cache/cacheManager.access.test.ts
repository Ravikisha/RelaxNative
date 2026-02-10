import { describe, expect, it } from 'vitest';
import { chmodSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { loadCacheEntry, saveCacheEntry } from './cacheManager.js';

function withTempHome(fn: (home: string) => void) {
	const dir = mkdtempSync(join(tmpdir(), 'relaxnative-home-'));
	const prev = process.env.HOME;
	process.env.HOME = dir;
	try {
		fn(dir);
	} finally {
		if (prev == null) delete process.env.HOME;
		else process.env.HOME = prev;
		rmSync(dir, { recursive: true, force: true });
	}
}

describe('cacheManager lastAccessAt', () => {
	it('touches lastAccessAt when reading meta.json', () => {
		withTempHome(() => {
			saveCacheEntry({
				hash: 'abc',
				sourcePath: 'x.c',
				outputPath: '/tmp/out',
				compilerPath: 'cc',
				compilerVersion: '1',
				flags: [],
				platform: 'linux-x64',
				createdAt: 1,
			});

			// Ensure reading updates the meta on disk.
			const before = JSON.parse(
				readFileSync(join(process.env.HOME!, '.relaxnative', 'cache', 'abc', 'meta.json'), 'utf8'),
			) as any;
			expect(before.lastAccessAt).toBeUndefined();

			const entry = loadCacheEntry('abc');
			expect(typeof entry.lastAccessAt).toBe('number');

			const after = JSON.parse(
				readFileSync(join(process.env.HOME!, '.relaxnative', 'cache', 'abc', 'meta.json'), 'utf8'),
			) as any;
			expect(typeof after.lastAccessAt).toBe('number');
		});
	});

	it('does not throw if meta.json is not writable (best-effort)', () => {
		withTempHome((home) => {
			const metaDir = join(home, '.relaxnative', 'cache', 'ro');
			mkdirSync(metaDir, { recursive: true });
			const metaPath = join(metaDir, 'meta.json');
			writeFileSync(
				metaPath,
				JSON.stringify({
					hash: 'ro',
					sourcePath: 'x.c',
					outputPath: '/tmp/out',
					compilerPath: 'cc',
					compilerVersion: '1',
					flags: [],
					platform: 'linux-x64',
					createdAt: 1,
				}),
			);

			// Make the file read-only after it exists so setup doesn't fail.
			try {
				chmodSync(metaPath, 0o444);
			} catch {
				// ignore platform differences
			}

			expect(() => loadCacheEntry('ro')).not.toThrow();
		});
	});
});
