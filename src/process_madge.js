const madge = require("madge");
const fs = require("fs");
const path = require("path");

function extractPackageName(filePath) {
	const normalized = filePath.replace(/\\/g, "/");

	// js file under src/main/js or src/test/js
	const match = normalized.match(/src\/(main|test)\/js\/(.+)\/[^/]+\.js$/);
	if (match) {
		const type = match[1]; // main or test
		const packagePath = match[2].replace(/\//g, ".");
		return `${type}.js.${packagePath}`;
	}

	//other files in subfolders (exclude filename)
	if (normalized.includes("/")) {
		const dirPath = normalized.substring(0, normalized.lastIndexOf("/"));
		return dirPath.replace(/\//g, ".");
	}

	return "root";
}

function extractRepoName(rootPath, filePath) {
	const normalized = filePath.replace(/\\/g, "/");
	const normalizedRoot = rootPath.replace(/\\/g, "/");

	const splitName = path.dirname(normalized).split("/");
	const rootSplit = normalizedRoot.split("/");

	let repoPath = splitName[0];
	if (repoPath == "src") {
		repoPath = rootSplit[rootSplit.length - 1];
	}
	// console.log(rootSplit, normalizedRoot);
	return repoPath;
}

function convertDependencyGraph(dependencyGraph, projectPath) {
	const nodes = [];
	const links = [];
	const idMap = {}; // map file → id
	let idCounter = 0;

	Object.keys(dependencyGraph).forEach((file) => {
		if (!(file in idMap)) {
			idMap[file] = idCounter++;
			nodes.push({
				id: idMap[file],
				name: file,
				package: extractPackageName(file),
				repo: extractRepoName(projectPath, file),
			});
		}

		dependencyGraph[file].forEach((dep) => {
			if (!(dep in idMap)) {
				idMap[dep] = idCounter++;
				nodes.push({
					id: idMap[dep],
					name: dep,
					package: extractPackageName(dep),
					repo: extractRepoName(projectPath, dep),
				});
			}

			links.push({
				source: idMap[file],
				target: idMap[dep],
			});
		});
	});

	return { nodes, links };
}

function saveMadgeResult(filename, data) {
	const outputDir = path.resolve(__dirname, "../Output");

	// Ensure Output folder exists
	if (!fs.existsSync(outputDir)) {
		fs.mkdirSync(outputDir, { recursive: true });
	}

	const outputFile = path.join(outputDir, filename);

	fs.writeFileSync(outputFile, JSON.stringify(data, null, 2));
	console.log(`Result saved to ${outputFile}`);
}

async function runMadge(projectPath) {
	try {
		const result = await madge(projectPath);
		const dependencyGraph = result.obj(); //Returns an Object with all dependencies.

		saveMadgeResult("madge_out.json", dependencyGraph);

		const output = convertDependencyGraph(dependencyGraph, projectPath);
		saveMadgeResult("process_madge.json", output);
		return output;
	} catch (err) {
		console.error("Madge failed", err);
	}
}

module.exports = { runMadge };
