const path = require("path");
const fs = require("fs").promises;

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

function processDependsJson(data) {
	// preprocess cells to only get src and dest
	const cellList = data.cells.map((node) => {
		return { source: node.src, target: node.dest };
	});
	// process node list
	const nodeList = data.variables.map((node, i) => {
		return { id: Number(i), name: node };
	});

	return { nodes: nodeList, links: cellList };
}

async function parseDependsOutput(filePath = "..\\Output\\") {
	const fileName = filePath + "depends_out-file.json";
	const data = await fs.readFile(fileName, "utf-8");
	console.log("Start processing Depends output...");
	try {
		const dependsData = JSON.parse(data);
		const processedData = processDependsJson(dependsData);
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
	} catch (parseError) {
		console.error(`JSON parse error: ${parseError}`);
	}
}

async function processDepends() {
	try {
		// testing
		await runDepends(
			"java",
			"C:\\Users\\yosoo\\OneDrive - Deloitte (O365D)\\Documents\\maybank assignment\\backend-assignment\\src"
		);
		await parseDependsOutput();
	} catch (err) {
		console.error(err);
	}
}

processDepends();
