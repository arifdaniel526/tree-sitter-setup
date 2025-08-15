const TreeSitter = require("tree-sitter");
const Python = require("tree-sitter-python");
const Java = require("tree-sitter-java");
const fs = require("fs").promises;
const path = require("path");

// Map extensions to grammars
const langMap = {
	".py": Python,
	".java": Java,
};

// Recursively get all files in a directory
async function getAllFiles(dir) {
	let files = [];
	const items = await fs.readdir(dir, { withFileTypes: true });
	for (const item of items) {
		const fullPath = path.join(dir, item.name);
		if (item.isDirectory()) {
			files = files.concat(await getAllFiles(fullPath));
		} else {
			files.push(fullPath);
		}
	}
	return files;
}

// Serialize AST to JSON
function serializeNode(node, filePath, fileContent) {
	// Filter out node types
	if (node.type === "comment" || node.type === "whitespace") {
		return null;
	}

	const startIndex = node.startIndex;
	const endIndex = node.endIndex;
	const snippet = fileContent.slice(startIndex, endIndex); // Extract the code for the node
	return {
		type: node.type,
		file: filePath,
		startLine: node.startPosition.row + 1,
		startCol: node.startPosition.column + 1,
		endLine: node.endPosition.row + 1,
		endCol: node.endPosition.column + 1,
		text: snippet.trim(), // Code snippet text
		children: node.children
			.map((child) => serializeNode(child, filePath, fileContent))
			.filter(Boolean),
	};
}

// Convert AST to DOT format
function astToDot(
	node,
	parentId = null,
	nodeIdRef = { current: 0 },
	lines = []
) {
	const currentId = nodeIdRef.current++;
	const label = node.type.replace(/"/g, '\\"');
	lines.push(`  node${currentId} [label="${label}"];`);
	if (parentId !== null) {
		lines.push(`  node${parentId} -> node${currentId};`);
	}
	for (const child of node.children) {
		astToDot(child, currentId, nodeIdRef, lines);
	}
	return lines;
}

// Main function
async function main(projectPath) {
	try {
		const files = await getAllFiles(projectPath);
		const supportedFiles = files.filter((f) => langMap[path.extname(f)]);

		if (supportedFiles.length === 0) {
			console.log("No supported files found.");
			return;
		}

		// Ensure Output folder exists
		const outputDir = path.join(__dirname, "Output");
		await fs.mkdir(outputDir, { recursive: true });

		let combinedAstJson = []; //JSON storage
		let combinedDotLines = ["digraph AST {"]; //DOT storage
		let nodeIdRef = { current: 0 };

		for (const file of supportedFiles) {
			const ext = path.extname(file);
			const language = langMap[ext];

			// Parse code logic
			const codeContent = await fs.readFile(file, "utf8");
			const parser = new TreeSitter();
			parser.setLanguage(language);
			const tree = parser.parse(codeContent);

			combinedAstJson.push({
				file: file,
				ast: serializeNode(tree.rootNode, file, codeContent),
			});

			combinedDotLines.push(
				`subgraph cluster_${nodeIdRef.current} { label="${file}";`
			);
			astToDot(tree.rootNode, null, nodeIdRef, combinedDotLines);
			combinedDotLines.push("}");
		}

		combinedDotLines.push("}");

		// Write JSON output
		const jsonOutputPath = path.join(outputDir, "project_ast.json");
		await fs.writeFile(
			jsonOutputPath,
			JSON.stringify(combinedAstJson, null, 2),
			"utf8"
		);
		console.log(`AST JSON exported to ${jsonOutputPath}`);

		// Write DOT output
		const dotOutputPath = path.join(outputDir, "project_ast.dot");
		await fs.writeFile(dotOutputPath, combinedDotLines.join("\n"), "utf8");
		console.log(`AST DOT exported to ${dotOutputPath}`);

		const { exec } = require("child_process");

		// Export DOT to PNG format
		exec(
			`dot -Tpng ${dotOutputPath} -o ${path.join(
				outputDir,
				"project_ast.png"
			)}`,
			(err) => {
				if (err) {
					console.error(
						"Graphviz PNG export failed. Make sure Graphviz is installed."
					);
				} else {
					console.log(
						`AST PNG exported to ${path.join(
							outputDir,
							"project_ast.png"
						)}`
					);
				}
			}
		);
	} catch (err) {
		console.error("Error:", err);
	}
}

// CLI usage for error input
if (process.argv.length < 3) {
	console.error("Usage: node analyze_code.js <project-folder-path>");
	process.exit(1);
}

// Execute main function
main(process.argv[2]);
