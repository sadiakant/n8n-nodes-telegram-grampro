const path = require('path');
const { task, src, dest, parallel } = require('gulp');

task('build:icons', parallel(copyNodeIcons, copyCredentialIcons));

function copyNodeIcons() {
	const nodeSource = path.resolve('src', 'nodes', '*.{png,svg}');
	const nodeDestination = path.resolve('dist', 'nodes');

	return src(nodeSource).pipe(dest(nodeDestination));
}

function copyCredentialIcons() {
	const credSource = path.resolve('src', 'credentials', '*.{png,svg}');
	const credDestination = path.resolve('dist', 'credentials');

	return src(credSource).pipe(dest(credDestination));
}
