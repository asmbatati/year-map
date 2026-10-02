// Bundles the demo page's script, then renders the README's screenshots with headless Microsoft Edge (or Chrome).
//
//     node docs/demo/build.mjs            the bundle only
//     node docs/demo/build.mjs --shots    the bundle and docs/screenshot-light.png, docs/screenshot-dark.png
import esbuild from 'esbuild';
import { execFileSync } from 'node:child_process';
import { existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = fileURLToPath(new URL('.', import.meta.url));
esbuild.buildSync({
	entryPoints: [here + 'demo.ts'],
	bundle: true,
	format: 'iife',
	target: 'es2021',
	outfile: here + 'demo.js',
	logLevel: 'info',
});

if (process.argv.includes('--shots')) {
	const browsers = [
		'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
		'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
		'C:/Program Files/Google/Chrome/Application/chrome.exe',
	];
	const browser = browsers.find((b) => existsSync(b));
	if (!browser) throw new Error('No Edge or Chrome found for the screenshots');
	// Its own profile, so a browser already open is not asked to do the work and the command waits for it.
	const profile = join(tmpdir(), 'year-map-shots');
	for (const theme of ['light', 'dark']) {
		const url = pathToFileURL(here + 'index.html').href + '?theme=' + theme;
		const out = fileURLToPath(new URL('../screenshot-' + theme + '.png', import.meta.url));
		rmSync(out, { force: true });
		execFileSync(browser, ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--force-device-scale-factor=1.5',
			'--user-data-dir=' + profile, '--window-size=1500,1120', '--virtual-time-budget=2000', '--screenshot=' + out, url],
		{ stdio: 'ignore' });
		const until = Date.now() + 15000;
		while (!existsSync(out) && Date.now() < until) await new Promise((resolve) => setTimeout(resolve, 250));
		if (!existsSync(out)) throw new Error('The browser wrote no screenshot: ' + out);
		console.log('wrote ' + out);
	}
}
