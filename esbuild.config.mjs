import esbuild from 'esbuild';

console.log('Building n8n Telegram GramPro nodes...');

await esbuild.build({
	entryPoints: [
		'src/index.ts',
		'src/nodes/TelegramMtproto.node.ts',
		'src/nodes/TelegramTrigger.node.ts',
		'src/credentials/TelegramApi.credentials.ts',
	],

	bundle: true,
	platform: 'node',
	outdir: 'dist',
	outbase: 'src',

	format: 'cjs',
	target: 'node18',

	external: ['n8n-workflow'],
	logLevel: 'info',
});

console.log('Build finished successfully');
