const path = require("path");
const fs = require("fs").promises;

function extractPackageName(filePath, rootPath) {
	// normalize slashes
	const normalized = filePath.replace(/\\/g, "/");
	const normalizedRoot = rootPath.replace(/\\/g, "/");

	// try to find "src/" or "java/" in path
	let idx = normalized.lastIndexOf("/src/");
	if (idx === -1) {
		idx = normalized.lastIndexOf("/java/");
	}

	let pkgPath;
	const splitName = path.dirname(normalized).split("/");
	let repoPath = splitName[normalizedRoot.split("/").length];
	if (repoPath == "src" || repoPath == "java") {
		repoPath = splitName[normalizedRoot.split("/").length - 1];
	}
	//console.log(splitName[normalizedRoot.split("/").length]);
	if (idx !== -1) {
		// take everything after src/ or java/
		pkgPath = normalized.substring(idx + 5);
	} else {
		// fallback: relative to file's parent directory
		pkgPath = repoPath;
	}

	// remove filename if still there
	if (pkgPath.includes("/")) {
		pkgPath = pkgPath.substring(0, pkgPath.lastIndexOf("/"));
	}

	// convert to package notation
	return {
		package: pkgPath.replace(/\//g, "."),
		repo: repoPath,
	};
}

async function runDepends(
	fileType,
	projectPath,
	outputDir = "..\\Output\\",
	outputName = "depends_out"
) {
	const { exec } = require("child_process");
	console.log("Executing Depends...");
	return new Promise((resolve, reject) => {
		exec(
			`java -jar "..\\lib\\depends\\depends.jar" ${fileType} "${projectPath}" ${path.join(
				outputDir,
				outputName
			)}`,
			(err) => {
				if (err) {
					console.error(`Depends failed. Error: ${err}`);
				} else {
					console.log(
						`Depends completed successfully. JSON output at ${path.join(
							outputDir,
							outputName
						)}`
					);
					resolve();
				}
			}
		);
	});
}

function processDependsJson(data, rootPath) {
	// preprocess cells to only get src and dest
	const cellList = data.cells.map((node) => {
		return { source: node.src, target: node.dest };
	});

	// node list: keep full path, add package
	const nodeList = data.variables.map((node, i) => {
		const dirInfo = extractPackageName(node, rootPath);
		return {
			id: Number(i),
			name: node, // keep full path
			package: dirInfo.package,
			repo: dirInfo.repo,
		};
	});

	return { nodes: nodeList, links: cellList };
}

async function parseDependsOutput(filePath, rootPath) {
	const fileName = filePath + "depends_out-file.json";
	const data = await fs.readFile(fileName, "utf-8");
	console.log("Start processing Depends output...");
	try {
		const dependsData = JSON.parse(data);
		const processedData = processDependsJson(dependsData, rootPath);
		// write to file
		await fs.writeFile(
			`${filePath}processed_depends.json`,
			JSON.stringify(processedData, null, 2),
			"utf8",
			(err) => {
				if (err) {
					console.error(err);
				}
			}
		);
		console.log(
			`Saved processed file at: ${filePath}processed_depends.json`
		);
		return processedData;
	} catch (parseError) {
		console.error(`JSON parse error: ${parseError}`);
	}
}

async function processDepends(rootPath) {
	try {
		// testing

		await runDepends("java", rootPath);
		const res = await parseDependsOutput("..\\Output\\", rootPath);
		return res;
	} catch (err) {
		console.error(err);
	}
}

const rootPath =
	"C:\\Users\\yosoo\\OneDrive - Deloitte (O365D)\\Documents\\maybank assignment\\backend-assignment";
//"C:\\Users\\yosoo\\OneDrive - Deloitte (O365D)\\Documents\\App Modernisation\\talent-review\\backend";
//"C:\\Users\\yosoo\\OneDrive - Deloitte (O365D)\\Documents\\App Modernisation\\talent-review\\frontend\\hr-talent-review-web"
//processDepends(rootPath);

module.exports = { processDepends };
